/**
 * Unit tests for simulateBet utilities
 * Target: 95%+ coverage on parseSimulationResponse, isSimulationStale, formatXlm
 */
import {
  parseSimulationResponse,
  isSimulationStale,
  formatXlm,
  STROOPS_PER_XLM,
  PLATFORM_FEE_RATE,
  STALE_LEDGER_THRESHOLD,
} from "../simulateBet";

// ── parseSimulationResponse ───────────────────────────────────────────────────

describe("parseSimulationResponse", () => {
  const BASE = { minResourceFee: "10000", latestLedger: 500 };

  // Happy path
  it("returns success=true for a valid response", () => {
    const r = parseSimulationResponse(BASE, 100, 400, 1000);
    expect(r.success).toBe(true);
    expect(r.error).toBeNull();
  });

  it("calculates estimatedPayout using the correct formula", () => {
    // share = 100 / (400+100) = 0.2; payout = 0.2 * 1000 * 0.97 = 194
    const r = parseSimulationResponse(BASE, 100, 400, 1000);
    expect(r.estimatedPayout).toBeCloseTo(194, 4);
  });

  it("applies 3% platform fee (0.97 multiplier)", () => {
    // share = 100/200 = 0.5; payout = 0.5 * 200 * 0.97 = 97
    const r = parseSimulationResponse(BASE, 100, 100, 200);
    expect(r.estimatedPayout).toBeCloseTo(97, 4);
  });

  it("converts minResourceFee stroops to XLM correctly", () => {
    const r = parseSimulationResponse({ ...BASE, minResourceFee: "10000000" }, 100, 400, 1000);
    expect(r.networkFeeXlm).toBeCloseTo(1, 5); // 10_000_000 stroops = 1 XLM
  });

  it("extracts latestLedger as ledgerSequence", () => {
    const r = parseSimulationResponse({ ...BASE, latestLedger: 12345 }, 100, 400, 1000);
    expect(r.ledgerSequence).toBe(12345);
  });

  it("sets ledgerSequence to null when latestLedger is missing", () => {
    const r = parseSimulationResponse({ minResourceFee: "1000" }, 100, 400, 1000);
    expect(r.ledgerSequence).toBeNull();
  });

  it("sets ledgerSequence to null when latestLedger is not a number", () => {
    const r = parseSimulationResponse({ ...BASE, latestLedger: "abc" }, 100, 400, 1000);
    expect(r.ledgerSequence).toBeNull();
  });

  // Error cases
  it("returns success=false when response has error field", () => {
    const r = parseSimulationResponse({ error: "HostError: contract panic" }, 100, 400, 1000);
    expect(r.success).toBe(false);
    expect(r.error).toBe("HostError: contract panic");
    expect(r.estimatedPayout).toBe(0);
    expect(r.networkFeeXlm).toBe(0);
  });

  it("returns success=false when stakeAmount is 0", () => {
    const r = parseSimulationResponse(BASE, 0, 400, 1000);
    expect(r.success).toBe(false);
    expect(r.error).toBe("Invalid pool or stake amount");
  });

  it("returns success=false when stakeAmount is negative", () => {
    const r = parseSimulationResponse(BASE, -10, 400, 1000);
    expect(r.success).toBe(false);
  });

  it("returns success=false when totalPool is 0", () => {
    const r = parseSimulationResponse(BASE, 100, 0, 0);
    expect(r.success).toBe(false);
  });

  it("returns success=false when totalPool is negative", () => {
    const r = parseSimulationResponse(BASE, 100, 400, -100);
    expect(r.success).toBe(false);
  });

  it("handles missing minResourceFee gracefully (defaults to 0)", () => {
    const r = parseSimulationResponse({ latestLedger: 100 }, 100, 400, 1000);
    expect(r.networkFeeXlm).toBe(0);
    expect(r.success).toBe(true);
  });

  it("handles non-numeric minResourceFee gracefully", () => {
    const r = parseSimulationResponse({ ...BASE, minResourceFee: "abc" }, 100, 400, 1000);
    expect(r.networkFeeXlm).toBe(0);
  });

  it("estimatedPayout is never negative", () => {
    const r = parseSimulationResponse(BASE, 1, 999999, 1000);
    expect(r.estimatedPayout).toBeGreaterThanOrEqual(0);
  });

  it("handles poolForOutcome = 0 (new outcome)", () => {
    // share = stake / (0 + stake) = 1.0 → full pool
    const r = parseSimulationResponse(BASE, 50, 0, 500);
    expect(r.estimatedPayout).toBeCloseTo(500 * 0.97, 4);
  });

  it("handles very large stake", () => {
    const r = parseSimulationResponse(BASE, 1_000_000, 400, 1000);
    // share ≈ 1; payout ≈ 1000 * 0.97 = 970
    expect(r.estimatedPayout).toBeCloseTo(970, 0);
  });

  it("handles fractional stake", () => {
    const r = parseSimulationResponse(BASE, 0.001, 400, 1000);
    expect(r.estimatedPayout).toBeGreaterThan(0);
  });

  it("matches manual formula exactly", () => {
    const stake = 250, pool = 750, total = 2000;
    const expected = (stake / (pool + stake)) * total * (1 - PLATFORM_FEE_RATE);
    const r = parseSimulationResponse(BASE, stake, pool, total);
    expect(r.estimatedPayout).toBeCloseTo(expected, 10);
  });

  it("STROOPS_PER_XLM constant is 10_000_000", () => {
    expect(STROOPS_PER_XLM).toBe(10_000_000);
  });

  it("PLATFORM_FEE_RATE constant is 0.03", () => {
    expect(PLATFORM_FEE_RATE).toBeCloseTo(0.03, 10);
  });
});

// ── isSimulationStale ─────────────────────────────────────────────────────────

describe("isSimulationStale", () => {
  it("returns false when both ledgers are null", () => {
    expect(isSimulationStale(null, null)).toBe(false);
  });

  it("returns false when simulatedAtLedger is null", () => {
    expect(isSimulationStale(null, 100)).toBe(false);
  });

  it("returns false when currentLedger is null", () => {
    expect(isSimulationStale(100, null)).toBe(false);
  });

  it("returns false when ledger delta is within threshold", () => {
    expect(isSimulationStale(100, 102, 3)).toBe(false);
    expect(isSimulationStale(100, 103, 3)).toBe(false);
  });

  it("returns true when ledger delta exceeds threshold", () => {
    expect(isSimulationStale(100, 104, 3)).toBe(true);
    expect(isSimulationStale(100, 200, 3)).toBe(true);
  });

  it("uses STALE_LEDGER_THRESHOLD as default", () => {
    expect(isSimulationStale(100, 100 + STALE_LEDGER_THRESHOLD)).toBe(false);
    expect(isSimulationStale(100, 100 + STALE_LEDGER_THRESHOLD + 1)).toBe(true);
  });

  it("returns false when current ledger equals simulated ledger", () => {
    expect(isSimulationStale(100, 100)).toBe(false);
  });

  it("STALE_LEDGER_THRESHOLD constant is 3", () => {
    expect(STALE_LEDGER_THRESHOLD).toBe(3);
  });
});

// ── formatXlm ─────────────────────────────────────────────────────────────────

describe("formatXlm", () => {
  it("formats a whole number", () => {
    expect(formatXlm(10)).toBe("10 XLM");
  });

  it("formats a decimal up to 4 places", () => {
    expect(formatXlm(1.23456789)).toBe("1.2346 XLM");
  });

  it("strips trailing zeros", () => {
    expect(formatXlm(1.5)).toBe("1.5 XLM");
    expect(formatXlm(2.0)).toBe("2 XLM");
  });

  it("returns 0 XLM for 0", () => {
    expect(formatXlm(0)).toBe("0 XLM");
  });

  it("returns 0 XLM for negative values", () => {
    expect(formatXlm(-5)).toBe("0 XLM");
  });

  it("returns 0 XLM for NaN", () => {
    expect(formatXlm(NaN)).toBe("0 XLM");
  });

  it("returns 0 XLM for Infinity", () => {
    expect(formatXlm(Infinity)).toBe("0 XLM");
  });

  it("handles very small values", () => {
    expect(formatXlm(0.00001)).toBe("0 XLM"); // rounds to 0 at 4dp
  });

  it("handles very large values", () => {
    expect(formatXlm(1000000)).toBe("1000000 XLM");
  });
});
