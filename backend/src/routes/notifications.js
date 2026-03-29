const express = require("express");
const router = express.Router();
const db = require("../db");
const logger = require("../utils/logger");
const jwtAuth = require("../middleware/jwtAuth");

// POST /api/notifications/register — register or update FCM token (no auth required)
router.post("/register", async (req, res) => {
  const { walletAddress, fcmToken, preferences } = req.body;
  if (!walletAddress || !fcmToken) {
    return res.status(400).json({ error: "walletAddress and fcmToken are required" });
  }
  try {
    const result = await db.query(
      `INSERT INTO user_notifications (wallet_address, fcm_token, preferences, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (wallet_address)
       DO UPDATE SET fcm_token = EXCLUDED.fcm_token,
                     preferences = COALESCE(EXCLUDED.preferences, user_notifications.preferences),
                     updated_at = NOW()
       RETURNING *`,
      [walletAddress, fcmToken, preferences || { market_proposed: true, market_resolved: true }]
    );
    logger.info({ wallet_address: walletAddress }, "FCM token registered");
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    logger.error({ err, wallet_address: walletAddress }, "Failed to register FCM token");
    res.status(500).json({ error: err.message });
  }
});

// GET /api/notifications?wallet=ADDRESS — last 50 notifications for the wallet
router.get("/", jwtAuth, async (req, res) => {
  const wallet = req.query.wallet;
  if (!wallet) return res.status(400).json({ error: "wallet query parameter is required" });
  try {
    const result = await db.query(
      `SELECT * FROM notifications WHERE wallet_address = $1 ORDER BY created_at DESC LIMIT 50`,
      [wallet]
    );
    res.json({ notifications: result.rows });
  } catch (err) {
    logger.error({ err, wallet_address: wallet }, "Failed to fetch notifications");
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications/mark-read — mark a notification as read by ID
router.post("/mark-read", jwtAuth, async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: "id is required" });
  try {
    const result = await db.query(
      `UPDATE notifications SET read = TRUE WHERE id = $1 RETURNING *`,
      [id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Notification not found" });
    res.json({ success: true, notification: result.rows[0] });
  } catch (err) {
    logger.error({ err, id }, "Failed to mark notification as read");
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/notifications/clear — clear all notifications for a wallet
router.delete("/clear", jwtAuth, async (req, res) => {
  const wallet = req.query.wallet;
  if (!wallet) return res.status(400).json({ error: "wallet query parameter is required" });
  try {
    const result = await db.query(`DELETE FROM notifications WHERE wallet_address = $1`, [wallet]);
    res.json({ success: true, deleted: result.rowCount });
  } catch (err) {
    logger.error({ err, wallet_address: wallet }, "Failed to clear notifications");
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
