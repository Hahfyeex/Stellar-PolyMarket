require("dotenv").config();
const express = require("express");
const cors = require("cors");
const logger = require("./utils/logger");

// ── Firebase Admin SDK initialisation ──────────────────────────────────────
// Must happen before any firebase-admin/* imports (including appCheck middleware).
const admin = require("firebase-admin");

if (!admin.apps.length) {
  // When deployed to Cloud Functions / Cloud Run the SDK auto-discovers
  // credentials via Application Default Credentials (ADC).
  // For local development set GOOGLE_APPLICATION_CREDENTIALS to the path of
  // a service-account JSON file that has the "Firebase App Check Admin" role.
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
}
// ───────────────────────────────────────────────────────────────────────────

const appCheckMiddleware = require("./middleware/appCheck");

const app = express();
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info(
      {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: duration,
        ip: req.ip,
      },
      "HTTP Request"
    );
  });
  next();
});

// Health check – intentionally NOT behind App Check so uptime monitors work
app.get("/health", (req, res) => res.json({ status: "ok" }));

// Prometheus metrics — NOT behind App Check so Prometheus can scrape freely
app.use("/metrics", require("./routes/metrics"));

// ── App Check enforcement ───────────────────────────────────────────────────
// All /api/* routes are protected. Any request without a valid
// X-Firebase-AppCheck header receives HTTP 403 before reaching the handler.
app.use("/api", appCheckMiddleware);
// ───────────────────────────────────────────────────────────────────────────

// Routes
app.use("/api/markets", require("./routes/markets"));
app.use("/api/bets", require("./routes/bets"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/reserves", require("./routes/reserves"));
app.use("/api/status", require("./routes/status"));
app.use("/api/images", require("./routes/images"));
app.use("/api/v1/oracles", require("./routes/oracles"));
app.use("/api/tvl", require("./routes/tvl"));

// Start TVL background poller (updates Prometheus gauges every 30 s)
require("./services/tvlService").startPoller();

// Global error handler
app.use((err, req, res, next) => {
  logger.error(
    {
      err,
      method: req.method,
      path: req.path,
      body: req.body,
    },
    "Unhandled error"
  );
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  logger.info(
    { port: PORT, environment: process.env.NODE_ENV || "development" },
    "Server started"
  );
});
