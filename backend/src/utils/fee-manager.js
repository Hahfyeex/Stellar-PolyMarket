const { Horizon } = require("@stellar/stellar-sdk");
const logger = require("./logger");

/**
 * Dynamic Fee Manager for Oracle Transactions
 *
 * Monitors Stellar network fee_stats and adjusts the base_fee
 * to ensure Oracle proposals are prioritized during congestion.
 *
 * Congestion is determined by comparing the 90th-percentile fee
 * against the BASE_FEE threshold. When congested, the 90th-percentile
 * fee is used — capped at MAX_FEE_CAP to prevent accidental overspending.
 */

const HORIZON_URL =
  process.env.STELLAR_NETWORK === "mainnet"
    ? "https://horizon.stellar.org"
    : "https://horizon-testnet.stellar.org";

// Minimum fee in stroops (Stellar network minimum is 100)
const BASE_FEE = parseInt(process.env.ORACLE_BASE_FEE || "100", 10);

/**
 * MAX_FEE_CAP (stroops)
 *
 * Hard ceiling on the fee we will ever submit for an Oracle transaction.
 * Without this cap, a sudden fee spike (e.g. a spam attack pushing p90 to
 * 100 000 stroops) could drain the relayer wallet unexpectedly.
 * Default: 10 000 stroops (~0.001 XLM). Override via MAX_FEE_CAP env var.
 */
const MAX_FEE_CAP = parseInt(process.env.MAX_FEE_CAP || "10000", 10);

// p90 fee threshold above which we consider the network "congested"
const CONGESTION_THRESHOLD = parseInt(
  process.env.CONGESTION_THRESHOLD || "200",
  10
);

const horizonServer = new Horizon.Server(HORIZON_URL);

/**
 * Fetches current fee statistics from the Stellar Horizon API.
 * @returns {Promise<Object>} Raw fee_stats response
 */
async function fetchFeeStats() {
  return horizonServer.feeStats();
}

/**
 * Determines the appropriate fee for an Oracle transaction.
 *
 * Logic:
 *  1. Fetch fee_stats from Horizon.
 *  2. Read the p90 fee from `fee_charged.p90`.
 *  3. If p90 > CONGESTION_THRESHOLD → high congestion; use p90 (capped at MAX_FEE_CAP).
 *  4. Otherwise → normal; use BASE_FEE.
 *
 * @returns {Promise<{fee: string, congested: boolean, p90: number}>}
 */
async function getOracleFee() {
  const stats = await fetchFeeStats();

  // Horizon returns fee values as strings
  const p90 = parseInt(stats.fee_charged.p90, 10);

  const congested = p90 > CONGESTION_THRESHOLD;

  if (congested) {
    const adjustedFee = Math.min(p90, MAX_FEE_CAP);

    logger.info(
      {
        event: "FeeAdjustment",
        p90,
        adjusted_fee: adjustedFee,
        max_fee_cap: MAX_FEE_CAP,
        congestion_threshold: CONGESTION_THRESHOLD,
      },
      `[INFO] High Congestion detected. Adjusting fee to ${adjustedFee} stroops.`
    );

    return { fee: String(adjustedFee), congested: true, p90 };
  }

  logger.debug(
    {
      event: "FeeAdjustment",
      p90,
      fee: BASE_FEE,
      congestion_threshold: CONGESTION_THRESHOLD,
    },
    `[DEBUG] Network nominal. Using base fee of ${BASE_FEE} stroops.`
  );

  return { fee: String(BASE_FEE), congested: false, p90 };
}

module.exports = {
  getOracleFee,
  fetchFeeStats,
  BASE_FEE,
  MAX_FEE_CAP,
  CONGESTION_THRESHOLD,
};
