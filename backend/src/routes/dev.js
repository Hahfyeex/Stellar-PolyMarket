"use strict";

const express = require("express");
const axios = require("axios");
const redis = require("../utils/redis");
const logger = require("../utils/logger");

const router = express.Router();
const ONE_HOUR_SECONDS = 60 * 60;

function isDevEnvironment() {
  return process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
}

router.get("/faucet", async (req, res) => {
  if (!isDevEnvironment()) {
    return res.status(403).json({ error: "Faucet is only available in development." });
  }

  const wallet = String(req.query.wallet || "").trim();
  if (!wallet) {
    return res.status(400).json({ error: "wallet query parameter is required" });
  }

  if (!/^G[A-Z2-7]{55}$/.test(wallet)) {
    return res.status(400).json({ error: "Invalid Stellar wallet address" });
  }

  const rateLimitKey = `faucet:wallet:${wallet}`;

  try {
    const claimLock = await redis.set(rateLimitKey, String(Date.now()), "EX", ONE_HOUR_SECONDS, "NX");
    if (claimLock !== "OK") {
      return res.status(429).json({ error: "Rate limit exceeded. Try again in one hour." });
    }

    const friendbotResponse = await axios.get("https://friendbot.stellar.org", {
      params: { addr: wallet },
    });
    const transactionHash =
      friendbotResponse.data?.hash ??
      friendbotResponse.data?.transaction_hash ??
      friendbotResponse.data?.tx_hash ??
      null;

    return res.status(200).json({
      ...friendbotResponse.data,
      transaction_hash: transactionHash,
    });
  } catch (err) {
    await redis.del(rateLimitKey).catch(() => {});

    logger.error(
      {
        wallet_address: wallet,
        error: err.message,
      },
      "Friendbot faucet request failed"
    );

    const upstreamStatus = err.response?.status;
    const upstreamBody = err.response?.data;

    return res.status(upstreamStatus || 502).json({
      error: upstreamBody?.detail || upstreamBody?.error || "Failed to request testnet funds",
      details: upstreamBody || null,
    });
  }
});

module.exports = router;
