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
app.use((req, res, _next) => {
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
  _next();
});

// Health check – intentionally NOT behind App Check so uptime monitors work
app.get("/health", (req, res) => res.json({ status: "ok" }));
app.use("/api/health", require("./routes/health/protocolHealth"));

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
app.use("/api/governance", require("./routes/governance"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/indexer", require("./routes/indexer"));
app.use("/api/archive", require("./routes/archive"));

// GraphQL endpoint (graphql-yoga as Express middleware)
const { createYoga } = require("graphql-yoga");
const schema = require("./graphql/schema");
const yoga = createYoga({ schema, graphqlEndpoint: "/graphql", logging: false });
app.use("/graphql", yoga);

// Initialise bot registry — subscribes all strategies to the event bus
require("./bots/registry");

// Start automated market resolver cron (every 5 minutes)
require("./workers/resolver").start();

// Start nightly market archival cron (02:00 UTC)
require("./workers/archive-worker").start();

// Subscribe prediction market contract to Mercury Indexer
require("./indexer/mercury").subscribe();

// Initialize self-healing gap detection and recovery
require("./indexer/gap-detector").initializeSelfHealing();

// Global error handler
app.use((err, req, res, _next) => {
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
const http = require("http");
const httpServer = http.createServer(app);

// Attach graphql-ws WebSocket server (subscriptions at /graphql)
require("./graphql/wsServer").attach(httpServer, schema);

httpServer.listen(PORT, () => {
  logger.info({ port: PORT, environment: process.env.NODE_ENV || "development" }, "Server started");
});
