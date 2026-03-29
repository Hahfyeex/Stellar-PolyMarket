"use strict";

const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const StellarSdk = require("@stellar/stellar-sdk");
const redis = require("../utils/redis");
const logger = require("../utils/logger");

const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";
const SERVER_SECRET = process.env.STELLAR_SERVER_SECRET;
const NETWORK_PASSPHRASE = process.env.STELLAR_NETWORK === "mainnet"
  ? StellarSdk.Networks.PUBLIC
  : StellarSdk.Networks.TESTNET;

const ADMIN_WALLETS = (process.env.ADMIN_WALLETS || "").split(",").map((w) => w.trim()).filter(Boolean);
const CHALLENGE_TTL = 300; // 5 minutes

/**
 * GET /api/auth/challenge?wallet=ADDRESS
 * Returns a SEP-10 challenge transaction as base64-encoded XDR.
 */
router.get("/challenge", async (req, res) => {
  const { wallet } = req.query;
  if (!wallet) {
    return res.status(400).json({ error: "wallet query parameter is required" });
  }

  try {
    StellarSdk.StrKey.decodeEd25519PublicKey(wallet);
  } catch {
    return res.status(400).json({ error: "Invalid Stellar wallet address" });
  }

  if (!SERVER_SECRET) {
    logger.error("STELLAR_SERVER_SECRET is not configured");
    return res.status(500).json({ error: "Server misconfiguration" });
  }

  try {
    const serverKeypair = StellarSdk.Keypair.fromSecret(SERVER_SECRET);
    const now = Math.floor(Date.now() / 1000);

    const transaction = new StellarSdk.TransactionBuilder(
      new StellarSdk.Account(serverKeypair.publicKey(), "0"),
      { fee: StellarSdk.BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE }
    )
      .addOperation(
        StellarSdk.Operation.manageData({
          name: `${process.env.HOME_DOMAIN || "polymarket"} auth`,
          value: StellarSdk.Keypair.random().publicKey(),
          source: wallet,
        })
      )
      .setTimebounds(now, now + CHALLENGE_TTL)
      .build();

    transaction.sign(serverKeypair);

    const xdr = transaction.toEnvelope().toXDR("base64");

    // Store challenge in Redis with 5-minute TTL (single-use)
    await redis.set(`sep10:challenge:${wallet}`, xdr, "EX", CHALLENGE_TTL);

    logger.info({ wallet }, "SEP-10 challenge issued");
    res.json({ transaction: xdr, network_passphrase: NETWORK_PASSPHRASE });
  } catch (err) {
    logger.error({ err }, "Failed to generate SEP-10 challenge");
    res.status(500).json({ error: "Failed to generate challenge" });
  }
});

/**
 * POST /api/auth/token
 * Accepts a signed SEP-10 challenge XDR and issues a JWT.
 */
router.post("/token", async (req, res) => {
  const { transaction } = req.body;
  if (!transaction) {
    return res.status(400).json({ error: "transaction is required" });
  }

  try {
    const envelope = StellarSdk.xdr.TransactionEnvelope.fromXDR(transaction, "base64");
    const tx = new StellarSdk.Transaction(envelope, NETWORK_PASSPHRASE);

    // Extract the client wallet from the first operation's source account
    const op = tx.operations[0];
    if (!op || op.type !== "manageData") {
      return res.status(400).json({ error: "Invalid SEP-10 challenge transaction" });
    }

    const wallet = op.source;
    if (!wallet) {
      return res.status(400).json({ error: "Missing source account on challenge operation" });
    }

    // Retrieve stored challenge from Redis
    const stored = await redis.get(`sep10:challenge:${wallet}`);
    if (!stored) {
      return res.status(401).json({ error: "Challenge expired or not found" });
    }

    // Verify the submitted XDR matches the stored challenge (replay protection)
    if (stored !== transaction) {
      return res.status(401).json({ error: "Challenge mismatch" });
    }

    // Verify client signature
    const clientKeypair = StellarSdk.Keypair.fromPublicKey(wallet);
    const txHash = tx.hash();
    const clientSig = tx.signatures.find((sig) => {
      try {
        return clientKeypair.verify(txHash, sig.signature());
      } catch {
        return false;
      }
    });

    if (!clientSig) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    // Delete challenge — single-use enforcement
    await redis.del(`sep10:challenge:${wallet}`);

    const isAdmin = ADMIN_WALLETS.includes(wallet);
    const expiresIn = isAdmin ? "1h" : "24h";

    const token = jwt.sign({ sub: wallet, wallet, role: isAdmin ? "admin" : "user" }, JWT_SECRET, { expiresIn });

    logger.info({ wallet, role: isAdmin ? "admin" : "user" }, "SEP-10 JWT issued");
    res.json({ token, expires_in: isAdmin ? 3600 : 86400 });
  } catch (err) {
    logger.error({ err }, "Failed to verify SEP-10 challenge");
    res.status(400).json({ error: "Invalid transaction" });
  }
});

module.exports = router;
