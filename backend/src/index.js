require("dotenv").config();
const express = require("express");
const cors = require("cors");
const logger = require("./utils/logger");

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

// Health check
app.get("/health", (req, res) => res.json({ status: "ok" }));

// Routes
app.use("/api/markets", require("./routes/markets"));
app.use("/api/bets", require("./routes/bets"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/reserves", require("./routes/reserves"));
app.use("/api/whitelisted-tokens", require("./routes/whitelisted-tokens"));

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
app.listen(PORT, () => {
  logger.info({ port: PORT, environment: process.env.NODE_ENV || "development" }, "Server started");
});
