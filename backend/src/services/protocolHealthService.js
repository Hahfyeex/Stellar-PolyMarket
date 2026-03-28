"use strict";

/**
 * Protocol Health Service
 *
 * All monetary values are stored and returned as i128-compatible BigInt strings
 * with 7-decimal (stroop) precision — zero floats throughout.
 *
 * Caching: 30-second Redis TTL per the issue spec.
 */

const { Pool } = require("pg");
const redis = require("../utils/redisClient");

const CACHE_KEY = "protocol:health";
const CACHE_TTL_SECONDS = 30;

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Convert a raw stroop integer (BigInt) to a 7-decimal fixed-point string.
 * e.g. 1_000_000_0n → "1.0000000"
 * @param {BigInt} stroops
 * @returns {string}
 */
function stroopsToFixed(stroops) {
  const s = stroops.toString().padStart(8, "0");
  const intPart = s.slice(0, -7) || "0";
  const fracPart = s.slice(-7);
  return `${intPart}.${fracPart}`;
}

/**
 * Fetch fresh protocol health metrics from PostgreSQL.
 * Returns an object with BigInt fields for monetary values.
 */
async function fetchMetricsFromDB() {
  const [tvlResult, activeMarketsResult, volumeResult, stakingResult] = await Promise.all([
    // Total Value Locked — sum of all locked stakes across open markets
    db.query(`
        SELECT COALESCE(SUM(amount_stroops), 0)::text AS tvl_stroops
        FROM bets
        WHERE status = 'locked'
      `),

    // Active market count
    db.query(`
        SELECT COUNT(*)::bigint AS active_markets
        FROM markets
        WHERE status = 'open'
          AND end_date > NOW()
      `),

    // 24-hour rolling volume
    db.query(`
        SELECT COALESCE(SUM(amount_stroops), 0)::text AS volume_24h_stroops
        FROM bets
        WHERE created_at >= NOW() - INTERVAL '24 hours'
      `),

    // Total staked STELLA + staking ratio
    db.query(`
        SELECT
          COALESCE(SUM(staked_stroops), 0)::text   AS total_staked_stroops,
          COALESCE(SUM(total_supply_stroops), 0)::text AS total_supply_stroops
        FROM stella_staking_summary
      `),
  ]);

  const tvlStroops = BigInt(tvlResult.rows[0].tvl_stroops);
  const activeMarkets = BigInt(activeMarketsResult.rows[0].active_markets);
  const volume24hStroops = BigInt(volumeResult.rows[0].volume_24h_stroops);
  const totalStakedStroops = BigInt(stakingResult.rows[0].total_staked_stroops);
  const totalSupplyStroops = BigInt(stakingResult.rows[0].total_supply_stroops);

  // Staking ratio: (staked / supply) * 10_000_000 — stored as i128 fixed-point integer
  // Represents a value in [0, 10_000_000] where 10_000_000 ≡ 100.0000000 %
  const stakingRatioFixed =
    totalSupplyStroops > 0n ? (totalStakedStroops * 10_000_000n) / totalSupplyStroops : 0n;

  return {
    tvl_stroops: tvlStroops.toString(),
    active_markets: activeMarkets.toString(),
    volume_24h_stroops: volume24hStroops.toString(),
    total_staked_stroops: totalStakedStroops.toString(),
    staking_ratio_fixed: stakingRatioFixed.toString(), // fixed-point integer, 7 decimals
    // Human-readable fixed-point strings (no floats — formatted from integers)
    tvl_xlm: stroopsToFixed(tvlStroops),
    volume_24h_xlm: stroopsToFixed(volume24hStroops),
    total_staked_xlm: stroopsToFixed(totalStakedStroops),
    staking_ratio_pct: stroopsToFixed(stakingRatioFixed), // e.g. "42.3500000"
    fetched_at: new Date().toISOString(),
  };
}

/**
 * Get protocol health metrics, served from Redis cache when possible.
 * @returns {Promise<object>}
 */
async function getProtocolHealth() {
  const cached = await redis.get(CACHE_KEY);
  if (cached) {
    return { ...JSON.parse(cached), cached: true };
  }

  const metrics = await fetchMetricsFromDB();
  await redis.set(CACHE_KEY, JSON.stringify(metrics), { EX: CACHE_TTL_SECONDS });
  return { ...metrics, cached: false };
}

module.exports = { getProtocolHealth, stroopsToFixed };
