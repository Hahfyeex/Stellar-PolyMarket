require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();

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

// Health check
app.get("/health", (req, res) => res.json({ status: "ok" }));

// Routes
app.use("/api/markets", require("./routes/markets"));
app.use("/api/bets", require("./routes/bets"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/reserves", require("./routes/reserves"));
app.use("/api/audit-logs", require("./routes/audit"));

const shortUrlRoutes = require("./routes/shorturl");
app.use("/api/short-url", shortUrlRoutes);
app.get("/s/:code", shortUrlRoutes.redirectHandler);

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Stella Polymarket API running on port ${PORT}`));
