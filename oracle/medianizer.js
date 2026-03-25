"use strict";

/**
 * OracleMedianizer — multi-feed aggregator with outlier detection.
 *
 * Algorithm:
 *  1. Query all fetcher functions in parallel (Promise.all).
 *  2. Discard any that rejected or returned a non-finite number.
 *  3. Require at least MIN_SOURCES valid values — throw otherwise.
 *  4. Outlier filter: compute mean + std dev; drop values where
 *     |value - mean| > OUTLIER_SIGMA * stdDev.
 *  5. Require at least MIN_SOURCES values survive filtering — throw otherwise.
 *  6. Compute median on the filtered set:
 *     - odd count  → middle element of sorted array
 *     - even count → average of the two middle elements
 *  7. Log all source values, discarded outliers, and final median.
 */

const MIN_SOURCES = 3;
const OUTLIER_SIGMA = 2; // discard values more than 2 std devs from mean

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
   * @param {Array<() => Promise<number>>} fetchers - Array of oracle fetcher functions.
   *   Each must resolve to a finite number or reject on failure.
   * @param {object} [logger] - Optional logger with .info() / .warn() / .error().
   *   Defaults to console.
   */
  constructor(fetchers, logger = console) {
    this._fetchers = fetchers;
    this._log = logger;
  }

  /**
   * Fetch all sources in parallel, aggregate, and return the median.
   * Throws if fewer than MIN_SOURCES valid values remain after outlier filtering.
   * @returns {Promise<number>} The aggregated median value.
   */
  async aggregate() {
    // Step 1: query all fetchers in parallel; capture settled results
    const results = await Promise.allSettled(this._fetchers.map((fn) => fn()));

    // Step 2: collect valid (finite number) values and note failures
    const valid = [];
    const failed = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled" && Number.isFinite(r.value)) {
        valid.push(r.value);
      } else {
        failed.push({ index: i, reason: r.reason?.message ?? r.value });
      }
    });

    if (failed.length > 0) {
      this._log.warn(
        { failed },
        `[Medianizer] ${failed.length} source(s) failed or returned invalid data`
      );
    }

    // Step 3: require minimum sources before outlier filtering
    if (valid.length < MIN_SOURCES) {
      throw new Error(
        `[Medianizer] Insufficient valid sources: got ${valid.length}, need ${MIN_SOURCES}`
      );
    }

    this._log.info({ sourceValues: valid }, "[Medianizer] Raw source values");

    // Step 4: discard outliers beyond OUTLIER_SIGMA standard deviations from mean
    const { filtered, outliers } = filterOutliers(valid);

    if (outliers.length > 0) {
      this._log.warn(
        { outliers },
        `[Medianizer] Discarded ${outliers.length} outlier(s) (>${OUTLIER_SIGMA}σ from mean)`
      );
    }

    // Step 5: require minimum sources after outlier filtering
    if (filtered.length < MIN_SOURCES) {
      throw new Error(
        `[Medianizer] Too many outliers removed: ${filtered.length} sources remain, need ${MIN_SOURCES}`
      );
    }

    // Step 6: compute median on sorted filtered set
    const sorted = [...filtered].sort((a, b) => a - b);
    const result = median(sorted);

    // Step 7: audit log — all source values, outliers, and final median
    this._log.info(
      { sourceValues: valid, outliers, filteredValues: filtered, median: result },
      "[Medianizer] Aggregation complete"
    );

    return result;
  }
}

module.exports = { OracleMedianizer, median, filterOutliers, MIN_SOURCES, OUTLIER_SIGMA };
