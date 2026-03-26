/**
 * Unit tests for slippageCalc utilities.
 * All payout calculations use BigInt — zero floating-point operations.
 * Target: >90% coverage of all calculation paths.
 */
import {
  toStroops,
  calcPayoutStroops,
  isSlippageExceeded,
  stroopsToXlm,
} from "../slippageCalc";

// ─── toStroops ────────────────────────────────────────────────────────────────

describe("toStroops", () => {
  it("converts whole XLM to stroops", () => {
    expect(toStroops(1)).toBe(10_000_000n);
    expect(toStroops(10)).toBe(100_000_000n);
  });

  it("converts fractional XLM correctly (7 decimal places)", () => {
    expect(toStroops(0.5)).toBe(5_000_000n);
    expect(toStroops(1.5)).toBe(15_000_000n);
    expect(toStroops(0.0000001)).toBe(1n); // 1 stroop
  });

  it("rounds at the 7th decimal to avoid truncation", () => {
    // 0.00000015 XLM → 1.5 stroops → rounds to 2
    expect(toStroops(0.00000015)).toBe(2n);
  });

  it("converts zero", () => {
    expect(toStroops(0)).toBe(0n);
  });
});

// ─── stroopsToXlm ─────────────────────────────────────────────────────────────

describe("stroopsToXlm", () => {
  it("converts stroops back to XLM float", () => {
    expect(stroopsToXlm(10_000_000n)).toBe(1);
    expect(stroopsToXlm(5_000_000n)).toBe(0.5);
    expect(stroopsToXlm(1n)).toBeCloseTo(0.0000001, 7);
  });

  it("converts zero", () => {
    expect(stroopsToXlm(0n)).toBe(0);
  });
});

// ─── calcPayoutStroops ────────────────────────────────────────────────────────

describe("calcPayoutStroops", () => {
  // Helper: convert XLM inputs and call
  function calc(stake: number, outcomePool: number, totalPool: number): bigint {
    return calcPayoutStroops(toStroops(stake), toStroops(outcomePool), toStroops(totalPool));
  }

  it("calculates correct payout for basic scenario", () => {
    // stake=100, outcomePool=400, totalPool=1000
    // share = 100/500 = 0.2; payout = 0.2 * 1000 * 0.97 = 194 XLM
    const result = calc(100, 400, 1000);
    expect(stroopsToXlm(result)).toBeCloseTo(194, 4);
  });

  it("applies 3% fee (97/100 multiplier)", () => {
    // stake=100, outcomePool=100, totalPool=200
    // share = 0.5; payout = 0.5 * 200 * 0.97 = 97 XLM
    const result = calc(100, 100, 200);
    expect(stroopsToXlm(result)).toBeCloseTo(97, 4);
  });

  it("returns 0n when stake is zero", () => {
    expect(calc(0, 400, 1000)).toBe(0n);
  });

  it("returns 0n when stake is negative (via toStroops)", () => {
    expect(calcPayoutStroops(-1n, toStroops(400), toStroops(1000))).toBe(0n);
  });

  it("returns 0n when totalPool is zero", () => {
    expect(calc(100, 0, 0)).toBe(0n);
  });

  it("returns 0n when totalPool is negative", () => {
    expect(calcPayoutStroops(toStroops(100), toStroops(400), -1n)).toBe(0n);
  });

  it("handles outcomePool = 0 (new outcome)", () => {
    // share = stake / (0 + stake) = 1.0; payout = totalPool * 0.97
    const result = calc(50, 0, 500);
    expect(stroopsToXlm(result)).toBeCloseTo(500 * 0.97, 4);
  });

  it("handles very small stake (1 stroop)", () => {
    const result = calcPayoutStroops(1n, toStroops(400), toStroops(1000));
    expect(result).toBeGreaterThan(0n);
  });

  it("handles large values without overflow", () => {
    // 1 million XLM stake
    const result = calc(1_000_000, 400, 1_000_000);
    expect(stroopsToXlm(result)).toBeGreaterThan(0);
  });

  it("uses pure BigInt — result is a bigint", () => {
    expect(typeof calc(100, 400, 1000)).toBe("bigint");
  });
});

// ─── isSlippageExceeded ───────────────────────────────────────────────────────

describe("isSlippageExceeded", () => {
  // Helper: build stroop values from XLM
  function check(expected: number, current: number, tolerance: number): boolean {
    return isSlippageExceeded(toStroops(expected), toStroops(current), tolerance);
  }

  it("returns false when payout is unchanged", () => {
    expect(check(100, 100, 0.5)).toBe(false);
  });

  it("returns false when payout improved", () => {
    expect(check(100, 110, 0.5)).toBe(false);
  });

  it("returns false when drift is within tolerance (0.5%)", () => {
    // 0.4% drift — within 0.5% tolerance
    expect(check(100, 99.6, 0.5)).toBe(false);
  });

  it("returns true when drift exceeds tolerance (0.5%)", () => {
    // 1% drift — exceeds 0.5% tolerance
    expect(check(100, 99, 0.5)).toBe(true);
  });

  it("returns true when drift exceeds 1% tolerance", () => {
    // 2% drift — exceeds 1% tolerance
    expect(check(100, 98, 1)).toBe(true);
  });

  it("returns false when drift is exactly at tolerance boundary", () => {
    // Exactly 1% drift with 1% tolerance — should NOT exceed (strict >)
    // 1% of 100 = 1; current = 99
    // Due to BigInt integer division this may be false at exact boundary
    expect(check(100, 99, 1)).toBe(false);
  });

  it("returns true when drift exceeds 2% tolerance", () => {
    // 3% drift — exceeds 2% tolerance
    expect(check(100, 97, 2)).toBe(true);
  });

  it("returns false when expected payout is zero", () => {
    expect(isSlippageExceeded(0n, 0n, 0.5)).toBe(false);
  });

  it("handles custom tolerance (e.g. 0.1%)", () => {
    // 0.2% drift — exceeds 0.1% tolerance
    expect(check(100, 99.8, 0.1)).toBe(true);
  });

  it("handles custom tolerance (e.g. 5%)", () => {
    // 4% drift — within 5% tolerance
    expect(check(100, 96, 5)).toBe(false);
  });

  it("handles very small amounts (stroop precision)", () => {
    // 1 stroop expected, 0 current — 100% drift
    expect(isSlippageExceeded(1n, 0n, 0.5)).toBe(true);
  });

  it("all 4 preset tolerances work correctly", () => {
    // 0.5% preset: 0.6% drift → exceeded
    expect(check(1000, 994, 0.5)).toBe(true);
    // 1% preset: 0.9% drift → not exceeded
    expect(check(1000, 991, 1)).toBe(false);
    // 2% preset: 2.1% drift → exceeded
    expect(check(1000, 979, 2)).toBe(true);
    // Custom 3%: 2.9% drift → not exceeded
    expect(check(1000, 971, 3)).toBe(false);
  });
});
