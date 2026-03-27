const express = require("express");
const router = express.Router();
const { Horizon } = require("@stellar/stellar-sdk");
const db = require("../db");
const logger = require("../utils/logger");

const CACHE_TTL_MS = 60 * 1000; // 60 seconds
let cache = { data: null, fetchedAt: 0 };

const NETWORK = process.env.STELLAR_NETWORK === "mainnet" ? "mainnet" : "testnet";
const HORIZON_URL =
  NETWORK === "mainnet"
    ? "https://horizon.stellar.org"
    : "https://horizon-testnet.stellar.org";
const STELLAR_EXPERT_BASE =
  NETWORK === "mainnet"
    ? "https://stellar.expert/explorer/public/account"
    : "https://stellar.expert/explorer/testnet/account";

const server = new Horizon.Server(HORIZON_URL);

async function fetchXLMBalance(contractAddress) {
  try {
    const account = await server.loadAccount(contractAddress);
    const native = account.balances.find((b) => b.asset_type === "native");
    return native ? native.balance : "0";
  } catch (err) {
    logger.warn({ contract_address: contractAddress, err: err.message }, "Failed to fetch XLM balance from Horizon");
    return null;
  }
}

// GET /api/reserves
// Returns all active market contract addresses with their verified on-chain XLM balances.
// Response is cached for 60 seconds to avoid Horizon rate limits.
router.get("/", async (req, res) => {
  const now = Date.now();

  if (cache.data && now - cache.fetchedAt < CACHE_TTL_MS) {
    logger.debug("Reserves served from cache");
    return res.json({ ...cache.data, cached: true });
  }

  try {
    const result = await db.query(
      "SELECT id, question, contract_address, resolved FROM markets WHERE contract_address IS NOT NULL ORDER BY created_at DESC"
    );

    const markets = await Promise.all(
      result.rows.map(async (market) => {
        const xlm_balance = await fetchXLMBalance(market.contract_address);
        return {
          market_id: market.id,
          question: market.question,
          contract_address: market.contract_address,
          resolved: market.resolved,
          xlm_balance: xlm_balance ?? "unavailable",
          verification_link: `${STELLAR_EXPERT_BASE}/${market.contract_address}`,
        };
      })
    );

    const payload = {
      network: NETWORK,
      fetched_at: new Date().toISOString(),
      cached: false,
      markets,
    };

    cache = { data: payload, fetchedAt: now };
    logger.info({ markets_count: markets.length, network: NETWORK }, "Reserves fetched from Horizon");
    res.json(payload);
  } catch (err) {
    logger.error({ err }, "Failed to fetch reserves");
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
