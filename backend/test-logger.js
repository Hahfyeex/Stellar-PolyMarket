// Test script to demonstrate structured JSON logging output
require("dotenv").config();
process.env.NODE_ENV = "production"; // Force JSON output

const logger = require("./src/utils/logger");

console.log("=== Structured JSON Logging Demo ===\n");

// Simulate various log scenarios
logger.info({ port: 4000, environment: "production" }, "Server started");

logger.info({
  market_id: 123,
  question: "Will Bitcoin reach $100k by end of 2026?",
  contract_address: "GAXYZ...",
  outcomes_count: 2,
}, "Market created");

logger.info({
  bet_id: 456,
  market_id: 123,
  wallet_address: "GBDEF...",
  outcome_index: 1,
  amount: "100.50",
}, "Bet placed");

logger.warn({
  market_id: 999,
  wallet_address: "GBXYZ...",
}, "Bet rejected: market not found, resolved, or expired");

logger.info({
  market_id: 123,
  winning_outcome: 1,
  status: "RESOLVED",
}, "Market resolved");

logger.error({
  err: new Error("Connection timeout"),
  market_id: 123,
  winning_outcome: 1,
}, "Failed to resolve market");

logger.info({
  method: "POST",
  path: "/api/markets/123/resolve",
  status: 200,
  duration_ms: 145,
  ip: "192.168.1.100",
}, "HTTP Request");

console.log("\n=== End of Demo ===");
