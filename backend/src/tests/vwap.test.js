/**
 * Tests for the VWAP (Volume-Weighted Average Price) utility.
 * Target: ≥95% coverage on calculateVWAP.
 */

const { calculateVWAP } = require("../utils/vwap");

describe("calculateVWAP", () => {
  // ── Edge cases ────────────────────────────────────────────────────────────

  test("returns 0 for null input", () => {
    expect(calculateVWAP(null)).toBe(0);
  });

  test("returns 0 for undefined input", () => {
    expect(calculateVWAP(undefined)).toBe(0);
  });

  test("returns 0 for empty array", () => {
    expect(calculateVWAP([])).toBe(0);
  });

  test("returns 0 for non-array input", () => {
    expect(calculateVWAP("trades")).toBe(0);
    expect(calculateVWAP(42)).toBe(0);
    expect(calculateVWAP({})).toBe(0);
  });

  // ── Zero / invalid volume trades ─────────────────────────────────────────

  test("returns 0 when all trades have zero volume", () => {
    const trades = [
      { price_xlm: 1.0, volume: 0 },
      { price_xlm: 2.0, volume: 0 },
    ];
    expect(calculateVWAP(trades)).toBe(0);
  });

  test("skips trades with negative volume", () => {
    const trades = [
      { price_xlm: 1.0, volume: -10 },
      { price_xlm: 0.5, volume: 100 },
    ];
    // Only the second trade counts
    expect(calculateVWAP(trades)).toBe(0.5);
  });

  test("skips trades with negative price", () => {
    const trades = [
      { price_xlm: -1.0, volume: 50 },
      { price_xlm: 0.8, volume: 50 },
    ];
    expect(calculateVWAP(trades)).toBe(0.8);
  });

  test("skips trades with NaN price", () => {
    const trades = [
      { price_xlm: NaN, volume: 100 },
      { price_xlm: 0.9, volume: 100 },
    ];
    expect(calculateVWAP(trades)).toBe(0.9);
  });

  test("skips trades with NaN volume", () => {
    const trades = [
      { price_xlm: 1.0, volume: NaN },
      { price_xlm: 0.6, volume: 200 },
    ];
    expect(calculateVWAP(trades)).toBe(0.6);
  });

  test("skips trades with non-finite price (Infinity)", () => {
    const trades = [
      { price_xlm: Infinity, volume: 100 },
      { price_xlm: 0.7, volume: 100 },
    ];
    expect(calculateVWAP(trades)).toBe(0.7);
  });

  test("skips trades with non-finite volume (Infinity)", () => {
    const trades = [
      { price_xlm: 1.0, volume: Infinity },
      { price_xlm: 0.4, volume: 50 },
    ];
    expect(calculateVWAP(trades)).toBe(0.4);
  });

  test("returns 0 when all trades are invalid", () => {
    const trades = [
      { price_xlm: NaN, volume: 0 },
      { price_xlm: -1, volume: -5 },
    ];
    expect(calculateVWAP(trades)).toBe(0);
  });

  // ── Single trade ──────────────────────────────────────────────────────────

  test("returns the trade price for a single valid trade", () => {
    const trades = [{ price_xlm: 0.85, volume: 100 }];
    expect(calculateVWAP(trades)).toBe(0.85);
  });

  test("handles string price and volume (DB numeric type)", () => {
    const trades = [{ price_xlm: "0.85", volume: "100" }];
    expect(calculateVWAP(trades)).toBe(0.85);
  });

  // ── Standard VWAP calculations ────────────────────────────────────────────

  test("calculates VWAP correctly for two equal-volume trades", () => {
    const trades = [
      { price_xlm: 1.0, volume: 100 },
      { price_xlm: 0.5, volume: 100 },
    ];
    // (1.0×100 + 0.5×100) / 200 = 150/200 = 0.75
    expect(calculateVWAP(trades)).toBe(0.75);
  });

  test("weights higher-volume trades more heavily", () => {
    const trades = [
      { price_xlm: 1.0, volume: 10 },   // small volume, high price
      { price_xlm: 0.5, volume: 990 },  // large volume, low price
    ];
    // (1.0×10 + 0.5×990) / 1000 = (10 + 495) / 1000 = 0.505
    expect(calculateVWAP(trades)).toBeCloseTo(0.505, 5);
  });

  test("calculates VWAP for three trades with different volumes", () => {
    const trades = [
      { price_xlm: 0.8, volume: 200 },
      { price_xlm: 0.9, volume: 300 },
      { price_xlm: 1.0, volume: 500 },
    ];
    // (0.8×200 + 0.9×300 + 1.0×500) / 1000
    // = (160 + 270 + 500) / 1000 = 930/1000 = 0.93
    expect(calculateVWAP(trades)).toBeCloseTo(0.93, 5);
  });

  test("handles very small fractional prices (stroop precision)", () => {
    const trades = [
      { price_xlm: 0.0000001, volume: 1000000 },
      { price_xlm: 0.0000002, volume: 1000000 },
    ];
    // (0.0000001 + 0.0000002) / 2 = 0.00000015
    // After rounding to 7 decimal places: 0.0000002 (rounds up at 7th place)
    expect(calculateVWAP(trades)).toBe(0.0000002);
  });

  test("handles large XLM values without precision loss", () => {
    const trades = [
      { price_xlm: 100.0, volume: 1000 },
      { price_xlm: 200.0, volume: 1000 },
    ];
    expect(calculateVWAP(trades)).toBe(150.0);
  });

  // ── Mixed valid/invalid trades ────────────────────────────────────────────

  test("ignores invalid entries and computes VWAP from valid ones only", () => {
    const trades = [
      { price_xlm: 1.0, volume: 100 },
      { price_xlm: NaN, volume: 50 },    // skipped
      { price_xlm: 0.5, volume: 0 },     // skipped (zero volume)
      { price_xlm: 0.8, volume: 100 },
    ];
    // (1.0×100 + 0.8×100) / 200 = 180/200 = 0.9
    expect(calculateVWAP(trades)).toBe(0.9);
  });

  // ── Rounding ──────────────────────────────────────────────────────────────

  test("rounds result to 7 decimal places", () => {
    const trades = [
      { price_xlm: 1 / 3, volume: 1 },
      { price_xlm: 1 / 3, volume: 1 },
      { price_xlm: 1 / 3, volume: 1 },
    ];
    const result = calculateVWAP(trades);
    // 1/3 ≈ 0.3333333
    expect(result).toBe(0.3333333);
    // Ensure no more than 7 decimal places
    const decimals = result.toString().split(".")[1]?.length ?? 0;
    expect(decimals).toBeLessThanOrEqual(7);
  });

  // ── Realistic secondary market scenario ──────────────────────────────────

  test("realistic 24h trading scenario with mint and burn events", () => {
    // Simulates a token that started at 0.5 XLM and rose to ~0.85 XLM
    const trades = [
      { price_xlm: "0.5000000", volume: "500" },   // early mint
      { price_xlm: "0.6000000", volume: "300" },   // mid-day mint
      { price_xlm: "0.5500000", volume: "200" },   // burn (sell)
      { price_xlm: "0.7500000", volume: "400" },   // late mint
      { price_xlm: "0.8500000", volume: "100" },   // final mint
    ];
    // Σ(p×v) = 250 + 180 + 110 + 300 + 85 = 925
    // Σ(v)   = 500 + 300 + 200 + 400 + 100 = 1500
    // VWAP   = 925 / 1500 ≈ 0.6166667
    expect(calculateVWAP(trades)).toBeCloseTo(0.6166667, 5);
  });
});
