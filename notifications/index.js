require("dotenv").config();
const express = require("express");
const admin = require("firebase-admin");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

// Initialize Firebase Admin
// In a real scenario, you'd use a service account JSON file
// For this mock, we'll assume it's configured via environment variables
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
} else {
  console.warn("FIREBASE_SERVICE_ACCOUNT not found. Initializing with default app (may fail if not in GCP).");
  // For local testing/demo purposes, we'll mock the messaging if no real account is provided
  admin.initializeApp();
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Endpoint triggered by backend webhook
 */
app.post("/sendPushNotification", async (req, res) => {
  const { marketId, status } = req.body;

  if (!marketId || !status) {
    return res.status(400).json({ error: "marketId and status are required" });
  }

  console.log(`[Cloud Function] Processing status change for Market #${marketId} to ${status}`);

  try {
    // 1. Fetch market details
    const marketResult = await pool.query("SELECT question FROM markets WHERE id = $1", [marketId]);
    if (!marketResult.rows.length) return res.status(404).json({ error: "Market not found" });
    const market = marketResult.rows[0];

    // 2. Fetch all users who bet on this market and have FCM tokens
    const query = `
      SELECT DISTINCT un.fcm_token, un.preferences
      FROM bets b
      JOIN user_notifications un ON b.wallet_address = un.wallet_address
      WHERE b.market_id = $1 AND un.fcm_token IS NOT NULL
    `;
    const tokensResult = await pool.query(query, [marketId]);
    const users = tokensResult.rows;

    console.log(`[Cloud Function] Found ${users.length} user(s) to notify.`);

    // 3. Filter by preferences and send FCM
    const messages = [];
    const prefKey = status === "PROPOSED" ? "market_proposed" : "market_resolved";

    users.forEach((user) => {
      if (user.preferences[prefKey]) {
        messages.push({
          token: user.fcm_token,
          notification: {
            title: `Market ${status.charAt(0) + status.slice(1).toLowerCase()}`,
            body: `The market "${market.question}" is now ${status.toLowerCase()}!`,
          },
          data: {
            marketId: marketId.toString(),
            status: status,
          },
        });
      }
    });

    if (messages.length > 0) {
      // In a real environment: await admin.messaging().sendEach(messages);
      console.log(`[Cloud Function] Sending ${messages.length} notifications...`);
      console.log("Payload Sample:", messages[0]);
    }

    res.json({ success: true, count: messages.length });
  } catch (err) {
    console.error("[Cloud Function] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.NOTIFICATION_PORT || 5001;
app.listen(PORT, () => console.log(`Notification Cloud Function (Mock) running on port ${PORT}`));
