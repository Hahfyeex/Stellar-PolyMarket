const express = require("express");
const router = express.Router();
const db = require("../db");
const logger = require("../utils/logger");

// POST /api/notifications/register — register or update FCM token
router.post("/register", async (req, res) => {
  const { walletAddress, fcmToken, preferences } = req.body;
  if (!walletAddress || !fcmToken) {
    return res.status(400).json({ error: "walletAddress and fcmToken are required" });
  }

  try {
    const query = `
      INSERT INTO user_notifications (wallet_address, fcm_token, preferences, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (wallet_address)
      DO UPDATE SET fcm_token = EXCLUDED.fcm_token, preferences = COALESCE(EXCLUDED.preferences, user_notifications.preferences), updated_at = NOW()
      RETURNING *;
    `;
    const result = await db.query(query, [walletAddress, fcmToken, preferences || { market_proposed: true, market_resolved: true }]);
    logger.info({ wallet_address: walletAddress, has_preferences: !!preferences }, "FCM token registered");
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    logger.error({ err, wallet_address: walletAddress }, "Failed to register FCM token");
    res.status(500).json({ error: err.message });
  }
});

// GET /api/notifications/:walletAddress — get preferences
router.get("/:walletAddress", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM user_notifications WHERE wallet_address = $1", [req.params.walletAddress]);
    if (!result.rows.length) {
      logger.debug({ wallet_address: req.params.walletAddress }, "Notification preferences not found");
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ user: result.rows[0] });
  } catch (err) {
    logger.error({ err, wallet_address: req.params.walletAddress }, "Failed to fetch notification preferences");
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
