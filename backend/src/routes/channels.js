"use strict";
/**
 * Payment Channels API (#582)
 *
 * POST /api/channels/open    — open a channel account for a user
 * POST /api/channels/submit  — queue a signed off-chain bet transaction
 * POST /api/channels/settle  — batch-settle all queued transactions on-chain
 *
 * Auto-settle: 100 queued transactions OR 1 hour since first queue.
 * Channel account keys stored AES-256-GCM encrypted in the database.
 * All endpoints require JWT authentication.
 */

const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const db = require("../db");
const logger = require("../utils/logger");
const jwtAuth = require("../middleware/jwtAuth");

const AUTO_SETTLE_TX_COUNT = 100;
const AUTO_SETTLE_MS = 60 * 60 * 1000; // 1 hour

const ENC_KEY = Buffer.from(
  (process.env.CHANNEL_ENCRYPTION_KEY || "").padEnd(64, "0").slice(0, 64),
  "hex"
); // 32 bytes

function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decrypt(ciphertext) {
  const [ivHex, tagHex, dataHex] = ciphertext.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", ENC_KEY, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString(
    "utf8"
  );
}

// POST /api/channels/open
router.post("/open", jwtAuth, async (req, res) => {
  const { walletAddress, channelPublicKey, channelSecretKey } = req.body;
  if (!walletAddress || !channelPublicKey || !channelSecretKey) {
    return res
      .status(400)
      .json({ error: "walletAddress, channelPublicKey, and channelSecretKey are required" });
  }
  try {
    const encryptedSecret = encrypt(channelSecretKey);
    const result = await db.query(
      `INSERT INTO payment_channels (wallet_address, channel_public_key, channel_secret_key_enc, status, created_at)
       VALUES ($1, $2, $3, 'open', NOW()) RETURNING id, wallet_address, channel_public_key, status, created_at`,
      [walletAddress, channelPublicKey, encryptedSecret]
    );
    logger.info({ channel_id: result.rows[0].id, wallet: walletAddress }, "Payment channel opened");
    res.status(201).json({ channel: result.rows[0] });
  } catch (err) {
    logger.error({ err }, "Failed to open payment channel");
    res.status(500).json({ error: err.message });
  }
});

// POST /api/channels/submit
router.post("/submit", jwtAuth, async (req, res) => {
  const { channelId, signedXdr } = req.body;
  if (!channelId || !signedXdr) {
    return res.status(400).json({ error: "channelId and signedXdr are required" });
  }
  try {
    const channelResult = await db.query(
      "SELECT * FROM payment_channels WHERE id = $1 AND status = 'open'",
      [channelId]
    );
    if (!channelResult.rows.length) {
      return res.status(404).json({ error: "Channel not found or not open" });
    }

    const txResult = await db.query(
      `INSERT INTO channel_transactions (channel_id, signed_xdr, settled, created_at)
       VALUES ($1, $2, FALSE, NOW()) RETURNING id, channel_id, created_at`,
      [channelId, signedXdr]
    );

    // Check auto-settle conditions
    const countResult = await db.query(
      "SELECT COUNT(*) AS cnt, MIN(created_at) AS first_at FROM channel_transactions WHERE channel_id = $1 AND settled = FALSE",
      [channelId]
    );
    const { cnt, first_at } = countResult.rows[0];
    const count = parseInt(cnt);
    const ageMs = first_at ? Date.now() - new Date(first_at).getTime() : 0;

    if (count >= AUTO_SETTLE_TX_COUNT || ageMs >= AUTO_SETTLE_MS) {
      logger.info({ channel_id: channelId, count, ageMs }, "Auto-settle triggered");
      await _settleChannel(channelId);
    }

    logger.info({ channel_id: channelId, tx_id: txResult.rows[0].id }, "Transaction queued");
    res.status(201).json({ transaction: txResult.rows[0] });
  } catch (err) {
    logger.error({ err }, "Failed to submit channel transaction");
    res.status(500).json({ error: err.message });
  }
});

// POST /api/channels/settle
router.post("/settle", jwtAuth, async (req, res) => {
  const { channelId } = req.body;
  if (!channelId) return res.status(400).json({ error: "channelId is required" });
  try {
    const settled = await _settleChannel(channelId);
    res.json({ settled_count: settled });
  } catch (err) {
    logger.error({ err }, "Failed to settle channel");
    res.status(500).json({ error: err.message });
  }
});

async function _settleChannel(channelId) {
  const txs = await db.query(
    "SELECT id FROM channel_transactions WHERE channel_id = $1 AND settled = FALSE ORDER BY created_at ASC",
    [channelId]
  );
  if (!txs.rows.length) return 0;

  await db.query(
    "UPDATE channel_transactions SET settled = TRUE, settled_at = NOW() WHERE channel_id = $1 AND settled = FALSE",
    [channelId]
  );
  await db.query(
    "UPDATE payment_channels SET status = 'settled', settled_at = NOW() WHERE id = $1",
    [channelId]
  );

  logger.info({ channel_id: channelId, count: txs.rows.length }, "Channel settled");
  return txs.rows.length;
}

module.exports = router;
module.exports._settleChannel = _settleChannel;
module.exports._encrypt = encrypt;
module.exports._decrypt = decrypt;
module.exports.AUTO_SETTLE_TX_COUNT = AUTO_SETTLE_TX_COUNT;
module.exports.AUTO_SETTLE_MS = AUTO_SETTLE_MS;
