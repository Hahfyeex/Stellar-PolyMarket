const express = require("express");
const router = express.Router();
const db = require("../db");
const redis = require("../utils/redis");
const logger = require("../utils/logger");
const eventBus = require("../bots/eventBus");
const { StrKey } = require("@stellar/stellar-sdk");
const { sanitizeError } = require("../utils/errors");
const axios = require("axios");

const POOL_LOW_THRESHOLD = Number(process.env.DEPTH_BOT_THRESHOLD) || 50;

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
      "INSERT INTO bets (market_id, wallet_address, outcome_index, amount) VALUES ($1, $2, $3, $4) RETURNING *",
      [marketId, walletAddress, outcomeIndex, amount]
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
    const market = await db.query("SELECT * FROM markets WHERE id = $1 AND resolved = TRUE", [
      req.params.marketId,
    ]);
    if (!market.rows.length) {
      logger.warn({ market_id: req.params.marketId }, "Payout rejected: market not resolved");
      return res.status(400).json({ error: "Market not resolved yet" });
    }

    const { winning_outcome, total_pool } = market.rows[0];

    // Get all winning bets
    const winners = await db.query(
      "SELECT * FROM bets WHERE market_id = $1 AND outcome_index = $2 AND paid_out = FALSE",
      [req.params.marketId, winning_outcome]
    );

    // Convert to stroops (7 decimal places = 10^7)
    const totalPoolStroops = BigInt(Math.floor(parseFloat(total_pool) * 1e7));

    // Get total winning stake in stroops
    const winningStakeStroops = winners.rows.reduce((sum, b) => {
      return sum + BigInt(Math.floor(parseFloat(b.amount) * 1e7));
    }, 0n);

    if (winningStakeStroops === 0n) {
      return res.status(400).json({ error: "No winning stake" });
    }

    // Calculate payout pool after 3% platform fee: pool * 97 / 100
    const payoutPoolStroops = (totalPoolStroops * 97n) / 100n;

    // Calculate payouts using BigInt arithmetic
    const payouts = winners.rows.map((bet) => {
      const betAmountStroops = BigInt(Math.floor(parseFloat(bet.amount) * 1e7));
      // payout = (betAmount * payoutPool) / winningStake
      const payoutStroops = (betAmountStroops * payoutPoolStroops) / winningStakeStroops;
      // Convert back to XLM (divide by 10^7)
      const payoutXlm = Number(payoutStroops) / 1e7;
      return { wallet: bet.wallet_address, payout: payoutXlm.toFixed(7) };
    });

    // Verify sum of payouts doesn't exceed payout pool
    let totalPayoutStroops = 0n;
    for (const payout of payouts) {
      const payoutStroops = BigInt(Math.round(parseFloat(payout.payout) * 10_000_000));
      totalPayoutStroops += payoutStroops;
    }

    if (totalPayoutStroops > payoutPoolStroops) {
      logger.error(
        {
          market_id: req.params.marketId,
          total_payout_stroops: totalPayoutStroops.toString(),
          payout_pool_stroops: payoutPoolStroops.toString(),
        },
        "Payout sum exceeds pool"
      );
      return res.status(500).json({ error: "Payout calculation error: sum exceeds pool" });
    }

    // Mark bets as paid
    await db.query("UPDATE bets SET paid_out = TRUE WHERE market_id = $1 AND outcome_index = $2", [
      req.params.marketId,
      winning_outcome,
    ]);

    logger.info(
      {
        market_id: req.params.marketId,
        winning_outcome,
        winners_count: winners.rows.length,
        total_pool,
        winning_stake: Number(winningStakeStroops) / 1e7,
      },
      "Payouts distributed"
    );

    // Invalidate portfolio cache for all winners
    if (winners.rows.length > 0) {
      const winnerAddresses = new Set(winners.rows.map((w) => w.wallet_address));
      const invalidationPromises = Array.from(winnerAddresses).map((addr) =>
        redis.del(`portfolio:${addr}`)
      );
      await Promise.all(invalidationPromises);
      logger.info(
        { market_id: req.params.marketId, winners_count: winnerAddresses.size },
        "[Cache] Invalidated portfolio cache for winners"
      );
    }

    res.json({ payouts });
  } catch (err) {
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

module.exports = router;
