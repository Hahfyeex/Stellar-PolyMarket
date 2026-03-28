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

// ── CORS ────────────────────────────────────────────────────────────────────
// Restrict allowed origins to the official frontend domain.
// Set ALLOWED_ORIGINS as a comma-separated list in production env vars.
// Falls back to localhost:3000 in development.
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:3000"];

function applyCommonMiddleware(app) {
  app.use(
    cors({
      origin(origin, callback) {
        // Allow server-to-server requests (no Origin header) and listed origins
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`CORS: origin '${origin}' not allowed`));
        }
      },
      credentials: true,
    })
  );

  // Explicit 10kb body limits reduce memory exposure from oversized payload attacks.
  app.use(express.json({ limit: "10kb" }));
  app.use(express.urlencoded({ extended: true, limit: "10kb" }));

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
}

function applyRoutes(app) {
  // Health and readiness probes — NOT behind App Check so orchestrators can probe freely
  const healthRouter = require("./routes/health");
  app.use(healthRouter);
  app.use("/api/health", require("./routes/health/protocolHealth"));

  // Prometheus metrics — NOT behind App Check so Prometheus can scrape freely
  app.use("/metrics", require("./routes/metrics"));

  // ── App Check enforcement ─────────────────────────────────────────────────
  // All /api/* routes are protected. Any request without a valid
  // X-Firebase-AppCheck header receives HTTP 403 before reaching the handler.
  app.use("/api", appCheckMiddleware);
  // ──────────────────────────────────────────────────────────────────────────

  app.use("/api/markets", require("./routes/markets"));
  app.use("/api/bets", require("./routes/bets"));
  app.use("/api/notifications", require("./routes/notifications"));
  app.use("/api/reserves", require("./routes/reserves"));
  app.use("/api/audit-logs", require("./routes/audit"));

  const shortUrlRoutes = require("./routes/shorturl");
  app.use("/api/short-url", shortUrlRoutes);
  app.get("/s/:code", shortUrlRoutes.redirectHandler);
  app.use("/api/status", require("./routes/status"));
  app.use("/api/images", require("./routes/images"));
  app.use("/api/v1/oracles", require("./routes/oracles"));
  app.use("/api/tvl", require("./routes/tvl"));
  app.use("/api/governance", require("./routes/governance"));
  app.use("/api/admin", require("./routes/admin"));
  app.use("/api/indexer", require("./routes/indexer"));
  app.use("/api/archive", require("./routes/archive"));
  app.use("/api/portfolio", require("./routes/portfolio"));

  // GraphQL endpoint (graphql-yoga as Express middleware)
  const { createYoga } = require("graphql-yoga");
  const schema = require("./graphql/schema");
  const yoga = createYoga({ schema, graphqlEndpoint: "/graphql", logging: false });
  app.use("/graphql", yoga);

  return { schema };
}

function applyErrorHandlers(app) {
  app.use((err, req, res, next) => {
    if (err?.type === "entity.too.large" || err?.status === 413) {
      logger.warn(
        { method: req.method, path: req.path },
        "Request body rejected: payload too large"
      );
      return res.status(413).json({ error: "Request body exceeds the 10kb limit." });
    }
    return next(err);
  });

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
}

function createApp(options = {}) {
  const { includeRoutes = true } = options;
  const app = express();
  applyCommonMiddleware(app);

  let schema = null;
  if (includeRoutes) {
    ({ schema } = applyRoutes(app));
  }

  applyErrorHandlers(app);
  return { app, schema };
}

function startBackgroundServices() {
  // Start TVL background poller (updates Prometheus gauges every 30 s)
  require("./services/tvlService").startPoller();
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
}

function startServer() {
  const { app, schema } = createApp();
  startBackgroundServices();

  const PORT = process.env.PORT || 4000;
  const http = require("http");
  const httpServer = http.createServer(app);

  // Attach graphql-ws WebSocket server (subscriptions at /graphql)
  require("./graphql/wsServer").attach(httpServer, schema);

  httpServer.listen(PORT, () => {
    logger.info(
      { port: PORT, environment: process.env.NODE_ENV || "development" },
      "Server started"
    );
  });

  return { app, httpServer };
}

if (require.main === module) {
  startServer();
}
module.exports = {
  applyCommonMiddleware,
  applyErrorHandlers,
  applyRoutes,
  createApp,
  startServer,
};
