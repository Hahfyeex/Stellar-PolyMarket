const express = require("express");
const router = express.Router();
const db = require("../db");
const redis = require("../utils/redis");
const logger = require("../utils/logger");
const eventBus = require("../bots/eventBus");
const { StrKey } = require("@stellar/stellar-sdk");
const { sanitizeError } = require("../utils/errors");
const axios = require("axios");
const { broadcastBetPlaced } = require("../websocket/marketUpdates");
const { getMarketStatus } = require("../utils/sorobanClient");

const POOL_LOW_THRESHOLD = Number(process.env.DEPTH_BOT_THRESHOLD) || 50;
const GRACE_PERIOD_SECONDS = parseInt(process.env.BET_GRACE_PERIOD_SECONDS, 10) || 300; // 5 min default

const IDEMPOTENCY_TTL = 24 * 60 * 60; // 24 hours in seconds
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRUSTLINE_CACHE_TTL = 5 * 60; // 5 minutes in seconds
const HORIZON_URL = process.env.HORIZON_URL || "https://horizon.stellar.org";

/**
 * Verify that a wallet has a trustline for a given asset
 * @param {string} walletAddress - Stellar wallet address
 * @param {string} assetCode - Asset code (e.g., "USDC")
 * @param {string} assetIssuer - Asset issuer address
 * @returns {Promise<boolean>} - True if trustline exists
 */
async function verifyTrustline(walletAddress, assetCode, assetIssuer) {
  const cacheKey = `trustline:${walletAddress}:${assetCode}:${assetIssuer}`;

  // Check cache first
  const cached = await redis.get(cacheKey);
  if (cached !== null) {
    return cached === "1";
  }

  try {
    const response = await axios.get(`${HORIZON_URL}/accounts/${walletAddress}`);
    const balances = response.data.balances || [];

    const hasTrustline = balances.some(
      (balance) => balance.asset_code === assetCode && balance.asset_issuer === assetIssuer
    );

    // Cache the result
    await redis.set(cacheKey, hasTrustline ? "1" : "0", "EX", TRUSTLINE_CACHE_TTL);

    return hasTrustline;
  } catch (err) {
    logger.error(
      { wallet_address: walletAddress, asset_code: assetCode, error: err.message },
      "Failed to verify trustline"
    );
    // Don't block the bet on API errors, log and allow
    return true;
  }
}

// POST /api/bets — place a bet
router.post("/", async (req, res) => {
  const idempotencyKey = req.headers["x-idempotency-key"];

  if (idempotencyKey !== undefined) {
    if (!UUID_RE.test(idempotencyKey)) {
      return res.status(400).json({ error: "X-Idempotency-Key must be a valid UUID" });
    }
    const cached = await redis.get(`idem:${idempotencyKey}`);
    if (cached) {
      const { status, body } = JSON.parse(cached);
      return res.status(status).json(body);
    }
  }

  const { marketId, outcomeIndex, amount, walletAddress, transaction_hash } = req.body;
  if (!marketId || outcomeIndex === undefined || !amount || !walletAddress || !transaction_hash) {
    return res.status(400).json({
      error: "marketId, outcomeIndex, amount, walletAddress, and transaction_hash are required",
    });
  }

  // Validate amount is a positive integer stroop value
  const amountInt = parseInt(amount, 10);
  if (!Number.isInteger(amountInt) || amountInt <= 0 || String(amountInt) !== String(amount)) {
    return res.status(400).json({ error: "amount must be a positive integer stroop value" });
  }

  // Validate Stellar wallet address format
  const isValidAddress =
    walletAddress.length === 56 &&
    walletAddress.startsWith("G") &&
    StrKey.isValidEd25519PublicKey(walletAddress);

  if (!isValidAddress) {
    logger.warn(
      { wallet_address: walletAddress },
      "Bet rejected: invalid Stellar wallet address format"
    );
    return res.status(400).json({ error: "Invalid Stellar wallet address format" });
  }

  try {
    // Verify transaction on Stellar Horizon API
    const cachedTx = await redis.get(`tx:${transaction_hash}`);
    let transaction;

    if (cachedTx) {
      transaction = JSON.parse(cachedTx);
    } else {
      const response = await axios.get(
        `https://horizon-testnet.stellar.org/transactions/${transaction_hash}`
      );
      transaction = response.data;

      // Cache transaction for 24 hours
      await redis.set(`tx:${transaction_hash}`, JSON.stringify(transaction), "EX", 24 * 60 * 60);
    }

    // Validate transaction details
    if (
      transaction.source_account !== walletAddress ||
      parseFloat(transaction.amount) !== parseFloat(amount)
    ) {
      return res
        .status(400)
        .json({ error: "On-chain transaction not found or does not match bet details" });
    }

    // Check market exists and is not resolved
    const market = await db.query(
      "SELECT * FROM markets WHERE id = $1 AND resolved = FALSE AND end_date > NOW() AND deleted_at IS NULL",
      [marketId]
    );
    if (!market.rows.length) {
      logger.warn(
        { market_id: marketId, wallet_address: walletAddress },
        "Bet rejected: market not found, resolved, expired, or deleted"
      );
      return res
        .status(400)
        .json({ error: "Market not found, already resolved, expired, or deleted" });
    }

    const marketData = market.rows[0];

    // #435: Validate bet against on-chain market status
    const onChainStatus = await getMarketStatus(marketId);
    if (onChainStatus && onChainStatus !== "Active") {
      logger.warn(
        { market_id: marketId, on_chain_status: onChainStatus },
        "Bet rejected: market not accepting bets on-chain"
      );
      return res.status(400).json({
        error: `Market is not accepting bets on-chain. Current status: ${onChainStatus}`,
      });
    }

    // #479: Verify trustline for custom Stellar assets
    if (marketData.contract_address && marketData.asset_code && marketData.asset_issuer) {
      const hasTrustline = await verifyTrustline(
        walletAddress,
        marketData.asset_code,
        marketData.asset_issuer
      );

      if (!hasTrustline) {
        logger.warn(
          {
            market_id: marketId,
            wallet_address: walletAddress,
            asset_code: marketData.asset_code,
            asset_issuer: marketData.asset_issuer,
          },
          "Bet rejected: wallet does not have trustline for asset"
        );
        return res.status(400).json({
          error: `Your wallet does not have a trustline for ${marketData.asset_code}. Please add the trustline before betting.`,
        });
      }
    }

    // #376: Check for duplicate bet from same wallet on same market
    const existingBet = await db.query(
      "SELECT id FROM bets WHERE market_id = $1 AND wallet_address = $2",
      [marketId, walletAddress]
    );
    if (existingBet.rows.length > 0) {
      logger.warn(
        { market_id: marketId, wallet_address: walletAddress },
        "Bet rejected: wallet has already placed a bet on this market"
      );
      return res.status(409).json({ error: "Wallet has already placed a bet on this market" });
    }

    // Record bet
    const bet = await db.query(
      "INSERT INTO bets (market_id, wallet_address, outcome_index, amount, grace_period_ends_at, transaction_hash) VALUES ($1, $2, $3, $4, NOW() + ($5 || ' seconds')::interval, $6) RETURNING *",
      [marketId, walletAddress, outcomeIndex, amount, GRACE_PERIOD_SECONDS, transaction_hash]
    );

    // Update total pool
    await db.query("UPDATE markets SET total_pool = total_pool + $1 WHERE id = $2", [
      amount,
      marketId,
    ]);

    logger.info(
      {
        bet_id: bet.rows[0].id,
        market_id: marketId,
        wallet_address: walletAddress,
        outcome_index: outcomeIndex,
        amount,
      },
      "Bet placed"
    );

    // Broadcast BET_PLACED event to all subscribed clients
    broadcastBetPlaced(marketId, bet.rows[0]);

    // Fetch updated pool and emit pool.low if depth has fallen below threshold
    const poolResult = await db.query("SELECT total_pool FROM markets WHERE id = $1", [marketId]);
    const totalPool = parseFloat(poolResult.rows[0]?.total_pool ?? 0);
    if (totalPool < POOL_LOW_THRESHOLD) {
      eventBus.emit("pool.low", { marketId, totalPool, threshold: POOL_LOW_THRESHOLD });
    }

    // Invalidate portfolio cache for this wallet
    await redis.del(`portfolio:${walletAddress}`);

    const responseBody = { bet: bet.rows[0] };
    if (idempotencyKey) {
      await redis.set(
        `idem:${idempotencyKey}`,
        JSON.stringify({ status: 201, body: responseBody }),
        "EX",
        IDEMPOTENCY_TTL
      );
    }
    res.status(201).json(responseBody);
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err, req.requestId) });
  }
});

// POST /api/bets/payout/:marketId — distribute rewards to winners
router.post("/payout/:marketId", async (req, res) => {
  try {
    const { distributePayouts } = require("../services/payoutService");
    const result = await distributePayouts(req.params.marketId);
    
    if (result.winningStake === 0 && result.totalPool > 0) {
      return res.status(400).json({ error: "No winning stake" });
    }

    res.json({ payouts: result.payouts });
  } catch (err) {
    if (err.message === "Market not found or not resolved") {
      logger.warn({ market_id: req.params.marketId }, "Payout rejected: market not resolved");
      return res.status(400).json({ error: "Market not resolved yet" });
    }
    if (err.message === "Payout calculation error: sum exceeds pool") {
      return res.status(500).json({ error: err.message });
    }
    res.status(500).json({ error: sanitizeError(err, req.requestId) });
  }
});

// GET /api/bets/recent — recent activity feed (indexer)
router.get("/recent", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  try {
    const result = await db.query(
      `SELECT b.id, b.wallet_address, b.outcome_index, b.amount, b.created_at,
              m.question, m.outcomes
       FROM bets b
       JOIN markets m ON m.id = b.market_id
       ORDER BY b.created_at DESC
       LIMIT $1`,
      [limit]
    );
    logger.debug({ activity_count: result.rows.length, limit }, "Recent activity fetched");
    res.json({ activity: result.rows });
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err, req.requestId) });
  }
});

// GET /api/bets/my-positions — paginated user positions
router.get("/my-positions", async (req, res) => {
  const { walletAddress, cursor } = req.query;
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);

  if (!walletAddress) {
    return res.status(400).json({ error: "walletAddress is required" });
  }

  try {
    const cursorId = cursor ? parseInt(cursor) : null;
    const query = `
      SELECT b.id, b.market_id, b.outcome_index, b.amount, b.created_at, b.paid_out,
             m.question, m.status as market_status, m.resolved
      FROM bets b
      JOIN markets m ON m.id = b.market_id
      WHERE b.wallet_address = $1
        AND ($2::integer IS NULL OR b.id < $2)
      ORDER BY b.id DESC
      LIMIT $3
    `;

    const result = await db.query(query, [walletAddress, cursorId, limit]);
    const bets = result.rows;
    const nextCursor = bets.length > 0 ? bets[bets.length - 1].id : null;

    logger.info(
      {
        wallet_address: walletAddress,
        bets_count: bets.length,
        next_cursor: nextCursor,
      },
      "User positions fetched"
    );

    res.json({
      positions: bets,
      next_cursor: nextCursor,
      limit,
    });
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err, req.requestId) });
  }
});

// DELETE /api/bets/:id — cancel a bet within the grace period
router.delete("/:id", async (req, res) => {
  const { walletAddress } = req.body;
  if (!walletAddress) {
    return res.status(400).json({ error: "walletAddress is required" });
  }

  try {
    const betResult = await db.query("SELECT * FROM bets WHERE id = $1 AND wallet_address = $2", [
      req.params.id,
      walletAddress,
    ]);

    if (!betResult.rows.length) {
      return res.status(404).json({ error: "Bet not found" });
    }

    const bet = betResult.rows[0];

    if (bet.cancelled_at) {
      return res.status(409).json({ error: "Bet already cancelled" });
    }

    if (bet.paid_out) {
      return res.status(409).json({ error: "Bet already paid out" });
    }

    if (!bet.grace_period_ends_at || new Date() > new Date(bet.grace_period_ends_at)) {
      return res.status(400).json({ error: "Grace period has expired" });
    }

    await db.query("UPDATE bets SET cancelled_at = NOW() WHERE id = $1", [bet.id]);
    await db.query("UPDATE markets SET total_pool = total_pool - $1 WHERE id = $2", [
      bet.amount,
      bet.market_id,
    ]);

    await redis.del(`portfolio:${walletAddress}`);

    logger.info(
      { bet_id: bet.id, market_id: bet.market_id, wallet_address: walletAddress },
      "Bet cancelled within grace period"
    );

    res.json({ success: true, bet_id: bet.id, refunded_amount: bet.amount });
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err, req.requestId) });
  }
});

// GET /api/bets/my-positions — paginated user positions
router.get("/my-positions", async (req, res) => {
  const { walletAddress, cursor } = req.query;
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);

  if (!walletAddress) {
    return res.status(400).json({ error: "walletAddress is required" });
  }

  try {
    const cursorId = cursor ? parseInt(cursor) : null;
    const query = `
      SELECT b.id, b.market_id, b.outcome_index, b.amount, b.created_at, b.paid_out,
             m.question, m.status as market_status, m.resolved
      FROM bets b
      JOIN markets m ON m.id = b.market_id
      WHERE b.wallet_address = $1
        AND ($2::integer IS NULL OR b.id < $2)
      ORDER BY b.id DESC
      LIMIT $3
    `;

    const result = await db.query(query, [walletAddress, cursorId, limit]);
    const bets = result.rows;
    const nextCursor = bets.length > 0 ? bets[bets.length - 1].id : null;

    logger.info({
      wallet_address: walletAddress,
      bets_count: bets.length,
      next_cursor: nextCursor,
    }, "User positions fetched");

    res.json({
      positions: bets,
      next_cursor: nextCursor,
      limit,
    });
  } catch (err) {
    logger.error({ err, wallet_address: walletAddress }, "Failed to fetch user positions");
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bets/export — export bets as CSV for tax reporting
router.get("/export", async (req, res) => {
  const { wallet, year } = req.query;

  if (!wallet) {
    return res.status(400).json({ error: "wallet query parameter is required" });
  }

  if (!year) {
    return res.status(400).json({ error: "year query parameter is required" });
  }

  // Validate wallet address format
  const isValidAddress =
    wallet.length === 56 &&
    wallet.startsWith("G") &&
    StrKey.isValidEd25519PublicKey(wallet);

  if (!isValidAddress) {
    logger.warn(
      { wallet_address: wallet },
      "Export rejected: invalid Stellar wallet address format"
    );
    return res.status(400).json({ error: "Invalid Stellar wallet address format" });
  }

  // Validate year is a valid integer
  const yearInt = parseInt(year, 10);
  if (!Number.isInteger(yearInt) || yearInt < 2000 || yearInt > new Date().getFullYear() + 1) {
    return res.status(400).json({ error: "year must be a valid year between 2000 and next year" });
  }

  try {
    // Query all bets for the wallet in the specified year
    const result = await db.query(
      `SELECT 
        b.id,
        b.market_id,
        b.created_at,
        b.outcome_index,
        b.amount,
        b.paid_out,
        b.transaction_hash,
        m.question,
        m.outcomes,
        m.winning_outcome,
        m.resolved
       FROM bets b
       JOIN markets m ON m.id = b.market_id
       WHERE b.wallet_address = $1
       AND EXTRACT(YEAR FROM b.created_at) = $2
       ORDER BY b.created_at ASC`,
      [wallet, yearInt]
    );

    const bets = result.rows;

    // CSV header row
    const csvHeaders = [
      "Date",
      "Market Question",
      "Outcome Bet On",
      "Stake (XLM)",
      "Payout Received (XLM)",
      "Net Gain/Loss (XLM)",
      "Transaction Hash"
    ];

    // Helper to escape and quote CSV fields
    function escapeCsvField(value) {
      if (value === null || value === undefined) {
        return "";
      }
      const str = String(value);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }

    // Transform bets to CSV rows
    const csvRows = bets.map((bet) => {
      const date = new Date(bet.created_at).toISOString().split("T")[0];
      const question = bet.question;
      const outcomes = JSON.parse(bet.outcomes) || [];
      const outcomeText = outcomes[bet.outcome_index] || `Outcome ${bet.outcome_index}`;
      const stakeAmount = parseFloat(bet.amount);
      
      // Calculate payout and net gain/loss
      let payoutAmount = 0;
      let netGainLoss = 0;
      
      if (bet.resolved) {
        if (bet.winning_outcome === bet.outcome_index && bet.paid_out) {
          // Winner — calculate payout from market pool
          // For simplicity, if marked as paid_out, we calculate the net as what was gained
          // Without storing exact payout amount, we'll use 0 for now and note this limitation
          // TODO: Store exact payout amounts in database for accurate tax reporting
          payoutAmount = 0; // Placeholder - would need payout table
          netGainLoss = payoutAmount - stakeAmount;
        } else if (bet.winning_outcome === bet.outcome_index) {
          // Winner but not yet paid
          netGainLoss = 0 - stakeAmount;
        } else {
          // Loser
          netGainLoss = 0 - stakeAmount;
        }
      } else {
        // Pending
        netGainLoss = 0;
      }

      return [
        escapeCsvField(date),
        escapeCsvField(question),
        escapeCsvField(outcomeText),
        escapeCsvField(stakeAmount.toFixed(7)),
        escapeCsvField(payoutAmount.toFixed(7)),
        escapeCsvField(netGainLoss.toFixed(7)),
        escapeCsvField(bet.transaction_hash || "")
      ];
    });

    // Build CSV content
    const csvContent = [
      csvHeaders.map(escapeCsvField).join(","),
      ...csvRows.map((row) => row.join(","))
    ].join("\n");

    // Set response headers for file download
    const filename = `stella-bets-${yearInt}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    logger.info(
      {
        wallet_address: wallet,
        year: yearInt,
        bets_exported: bets.length,
      },
      "Bet export generated"
    );

    res.send(csvContent);
  } catch (err) {
    logger.error(
      { wallet_address: wallet, year: yearInt, err },
      "Failed to generate bet export"
    );
    res.status(500).json({ error: sanitizeError(err, req.requestId) });
  }
});

module.exports = router;
