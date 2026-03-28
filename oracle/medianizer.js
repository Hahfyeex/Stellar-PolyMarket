"use strict";

/**
 * OracleMedianizer — multi-feed aggregator with outlier detection and DB audit log.
 *
 * Algorithm:
 *  1. Query all fetcher functions in parallel (Promise.allSettled).
 *  2. Discard any that rejected or returned a non-finite number.
 *  3. Require at least MIN_SOURCES (2) valid values — throw otherwise.
 *     Callers should push the market to pending review on this error.
 *  4. Outlier filter: compute mean + std dev; drop values where
 *     |value - mean| > OUTLIER_SIGMA * stdDev.
 *  5. Require at least MIN_SOURCES values survive filtering — throw otherwise.
 *  6. Compute median on the filtered set:
 *     - odd count  → middle element of sorted array
 *     - even count → average of the two middle elements
 *  7. Log all source values, discarded outliers, and final median to the DB
 *     for auditability (oracle_price_log table).
 *
 * Auth Enforcement:
 *   DB connection is injected via constructor — never hard-coded.
 *   API keys for individual sources are read from env vars in sources.js.
 */

/** Minimum number of valid sources required — fewer triggers pending review */
const MIN_SOURCES = 2;

/** Discard values more than this many standard deviations from the mean */
const OUTLIER_SIGMA = 2;

/**
 * Compute the median of a sorted numeric array.
 * Assumes array is already sorted ascending and non-empty.
 * @param {number[]} sorted
 * @returns {number}
 */
function median(sorted) {
  const mid = Math.floor(sorted.length / 2);
  // Even count: average the two middle values to avoid bias
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  // Odd count: exact middle element
  return sorted[mid];
}

/**
 * Filter outliers more than OUTLIER_SIGMA standard deviations from the mean.
 * Returns { filtered: number[], outliers: number[] }.
 *
 * When stdDev = 0 (all values identical), threshold = 0 so all values pass
 * (|v - mean| = 0 ≤ 0).
 *
 * @param {number[]} values
 * @returns {{ filtered: number[], outliers: number[] }}
 */
function filterOutliers(values) {
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const threshold = OUTLIER_SIGMA * stdDev;

  const filtered = [];
  const outliers = [];
  for (const v of values) {
    if (Math.abs(v - mean) <= threshold) {
      filtered.push(v);
    } else {
      outliers.push(v);
    }
  }
  return { filtered, outliers };
}

class OracleMedianizer {
  /**
   * @param {Array<() => Promise<number>>} fetchers
   *   Each must resolve to a finite number or reject on failure.
   * @param {object} [logger]
   *   Optional logger with .info() / .warn() / .error(). Defaults to console.
   * @param {object|null} [db]
   *   Optional pg Pool / client for DB audit logging.
   *   If null, audit logging is skipped (useful in tests).
   *   Must expose a .query(sql, params) method.
   */
  constructor(fetchers, logger = console, db = null) {
    this._fetchers = fetchers;
    this._log = logger;
    this._db = db;
  }

  /**
   * Fetch all sources in parallel, aggregate, and return the median.
   *
   * Throws if fewer than MIN_SOURCES valid values remain after outlier filtering.
   * Callers must catch this error and push the market to the pending review queue.
   *
   * @param {string} [asset="BTC/USD"] - Asset label for the audit log.
   * @returns {Promise<number>} The aggregated median value.
   */
  async aggregate(asset = "BTC/USD") {
    const fetchedAt = new Date().toISOString();

    // ── Step 1: query all fetchers in parallel; capture settled results ──────
    const results = await Promise.allSettled(this._fetchers.map((fn) => fn()));

    // ── Step 2: collect valid (finite number) values; note failures ───────────
    const valid = [];
    const failed = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled" && Number.isFinite(r.value)) {
        valid.push(r.value);
      } else {
        failed.push({ index: i, reason: r.reason?.message ?? String(r.value) });
      }
    });

    if (failed.length > 0) {
      this._log.warn(
        { failed },
        `[Medianizer] ${failed.length} source(s) failed or returned invalid data`
      );
    }

    // ── Step 3: require minimum sources before outlier filtering ─────────────
    if (valid.length < MIN_SOURCES) {
      const msg = `[Medianizer] Insufficient valid sources: got ${valid.length}, need ${MIN_SOURCES}`;
      this._log.error({ valid, failed }, msg);
      throw new Error(msg);
    }

    this._log.info({ sourceValues: valid }, "[Medianizer] Raw source values");

    // ── Step 4: discard outliers beyond OUTLIER_SIGMA std devs from mean ─────
    const { filtered, outliers } = filterOutliers(valid);

    if (outliers.length > 0) {
      this._log.warn(
        { outliers },
        `[Medianizer] Discarded ${outliers.length} outlier(s) (>${OUTLIER_SIGMA}σ from mean)`
      );
    }

    // ── Step 5: require minimum sources after outlier filtering ──────────────
    if (filtered.length < MIN_SOURCES) {
      const msg = `[Medianizer] Too many outliers removed: ${filtered.length} sources remain, need ${MIN_SOURCES}`;
      this._log.error({ filtered, outliers }, msg);
      throw new Error(msg);
    }

    // ── Step 6: compute median on sorted filtered set ─────────────────────────
    const sorted = [...filtered].sort((a, b) => a - b);
    const result = median(sorted);

    // ── Step 7: audit log — all source values, outliers, and final median ─────
    this._log.info(
      { sourceValues: valid, outliers, filteredValues: filtered, median: result },
      "[Medianizer] Aggregation complete"
    );

    await this._auditLog({ asset, fetchedAt, sourceValues: valid, outliers, filteredValues: filtered, medianValue: result });

    return result;
  }

  /**
   * Write an audit record to the oracle_price_log table.
   * Silently skips if no DB is configured (test environments).
   *
   * Table schema (create if not exists):
   *   CREATE TABLE IF NOT EXISTS oracle_price_log (
   *     id          SERIAL PRIMARY KEY,
   *     asset       TEXT NOT NULL,
   *     fetched_at  TIMESTAMPTZ NOT NULL,
   *     source_values  NUMERIC[] NOT NULL,
   *     outliers       NUMERIC[] NOT NULL DEFAULT '{}',
   *     filtered_values NUMERIC[] NOT NULL,
   *     median_value   NUMERIC NOT NULL,
   *     created_at  TIMESTAMPTZ DEFAULT NOW()
   *   );
   *
   * @private
   */
  async _auditLog({ asset, fetchedAt, sourceValues, outliers, filteredValues, medianValue }) {
    if (!this._db) return;
    try {
      await this._db.query(
        `INSERT INTO oracle_price_log
           (asset, fetched_at, source_values, outliers, filtered_values, median_value)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [asset, fetchedAt, sourceValues, outliers, filteredValues, medianValue]
      );
    } catch (err) {
      // Audit log failure must never block resolution — log and continue
      this._log.error({ err: err.message }, "[Medianizer] Failed to write audit log");
    }
  }
}

module.exports = { OracleMedianizer, median, filterOutliers, MIN_SOURCES, OUTLIER_SIGMA };
