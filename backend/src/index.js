require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
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

const compression = require("compression");
const appCheckMiddleware = require("./middleware/appCheck");

const app = express();

app.use(compression({ threshold: 1024 }));

// ── CORS ────────────────────────────────────────────────────────────────────
// Restrict allowed origins to the official frontend domain.
// Set ALLOWED_ORIGINS as a comma-separated list in production env vars.
// Falls back to localhost:3000 in development.
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:3000"];

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
// ────────────────────────────────────────────────────────────────────────────

app.use(express.json());

// Mitigate impact of any HTML echoed by clients: enforce baseline CSP on every response.
app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", "default-src 'self'");
  next();
});

// Request tracking and logging middleware
app.use((req, res, next) => {
  req.requestId = req.headers["x-request-id"] || crypto.randomUUID();
  res.setHeader("X-Request-ID", req.requestId);

  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info(
      {
        request_id: req.requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: duration,
        ip: req.ip,
        requestId: req.requestId,
      },
      "HTTP Request"
    );
  });
  next();
});

// Health and readiness probes — NOT behind App Check so orchestrators can probe freely
const healthRouter = require("./routes/health");
app.use(healthRouter);
app.use("/api/health", require("./routes/health/protocolHealth"));

// Prometheus metrics — NOT behind App Check so Prometheus can scrape freely
app.use("/metrics", require("./routes/metrics"));

// ── App Check enforcement ───────────────────────────────────────────────────
// All /api/* routes are protected. Any request without a valid
// X-Firebase-AppCheck header receives HTTP 403 before reaching the handler.
app.use("/api", appCheckMiddleware);
// ───────────────────────────────────────────────────────────────────────────

// Routes (MERGED — keep ALL)
app.use("/api/auth", require("./routes/auth"));
app.use("/api/markets", require("./routes/markets"));
app.use("/api/bets", require("./routes/bets"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/reserves", require("./routes/reserves"));
app.use("/api/anchor", require("./routes/anchor"));
app.use("/api/audit-logs", require("./routes/audit"));

const shortUrlRoutes = require("./routes/shorturl");
app.use("/api/short-url", shortUrlRoutes);
app.get("/s/:code", shortUrlRoutes.redirectHandler);
app.use("/api/status", require("./routes/status"));
app.use("/api/images", require("./routes/images"));
app.use("/api/v1/oracles", require("./routes/oracles"));
app.use("/api/tvl", require("./routes/tvl"));
app.use("/api/webhooks", require("./routes/webhooks"));

// Start TVL background poller (updates Prometheus gauges every 30 s)
require("./services/tvlService").startPoller();
// Start Webhook Delivery Worker
require("./workers/webhook-worker").runWebhookWorker();
app.use("/api/governance", require("./routes/governance"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/indexer", require("./routes/indexer"));
app.use("/api/archive", require("./routes/archive"));
app.use("/api/creators", require("./routes/creators"));
app.use("/api/portfolio", require("./routes/portfolio"));
app.use("/api/leaderboard", require("./routes/leaderboard"));

// ── Apollo Server (GraphQL API) ────────────────────────────────────────────
const { ApolloServer } = require("@apollo/server");
const { expressMiddleware } = require("@apollo/server/express4");
const { makeExecutableSchema } = require("@graphql-tools/schema");
const bodyParser = require("body-parser");
const jwt = require("jsonwebtoken");
const { typeDefs } = require("./graphql/schema");
const gqlResolvers = require("./graphql/resolvers");
const { createLoaders } = require("./graphql/dataLoaders");

const executableSchema = makeExecutableSchema({ typeDefs, resolvers: gqlResolvers });

const apolloServer = new ApolloServer({
  schema: executableSchema,
  // Playground (sandbox) is enabled by default in Apollo Server 4 when NODE_ENV !== 'production'
  introspection: process.env.NODE_ENV !== "production",
});

// Apollo Server must be started before applying middleware
apolloServer.start().then(() => {
  app.use(
    "/graphql",
    bodyParser.json(),
    expressMiddleware(apolloServer, {
      context: async ({ req }) => {
        // JWT validation on every GraphQL request
        const auth = req.headers.authorization || "";
        let user = null;
        if (auth.startsWith("Bearer ")) {
          try {
            user = jwt.verify(auth.slice(7), process.env.JWT_SECRET || "change-me-in-production");
          } catch {
            // Invalid token — user stays null; resolvers can enforce auth as needed
          }
        }
        return { user, loaders: createLoaders() };
      },
    })
  );
});
// ────────────────────────────────────────────────────────────────────────────

// Initialise bot registry — subscribes all strategies to the event bus
require("./bots/registry");

// Start automated market resolver cron (every 5 minutes)
require("./workers/resolver").start();

// Start hourly stale-market expiry job
require("./jobs/expireMarkets").start();

// Start automated market liquidity update job (every 5 minutes)
require("./jobs/updateMarketLiquidity").start();

// Start automated payouts job (every 15 minutes)
require("./jobs/automatedPayouts").start();

// Start nightly market archival cron (02:00 UTC)
require("./workers/archive-worker").start();

// Subscribe prediction market contract to Mercury Indexer
require("./indexer/mercury").subscribe();

// Initialize self-healing gap detection and recovery
require("./indexer/gap-detector").initializeSelfHealing();

// Initialise bot registry — subscribes all strategies to the event bus
require("./bots/registry");

// Global error handler — always returns sanitized response
app.use((err, req, res, _next) => {
  const requestId = req.requestId;
  logger.error(
    { err: { message: err.message, stack: err.stack, code: err.code }, requestId },
    "Unhandled error"
  );
  res.status(err.status || 500).json({ error: "Internal server error", requestId });
});

// Development-only error handler — includes stack trace only when NODE_ENV is explicitly 'development'
if (process.env.NODE_ENV === "development") {
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    res
      .status(err.status || 500)
      .json({ error: err.message, stack: err.stack, requestId: req.requestId });
  });
}

const PORT = process.env.PORT || 4000;
const http = require("http");
const httpServer = http.createServer(app);

// Attach graphql-ws WebSocket server (subscriptions at /graphql)
require("./graphql/wsServer").attach(httpServer, executableSchema);

// Attach market updates WebSocket server (real-time updates at /ws/markets)
require("./websocket/marketUpdates").attach(httpServer);

httpServer.listen(PORT, () => {
  logger.info({ port: PORT, environment: process.env.NODE_ENV || "development" }, "Server started");
});
