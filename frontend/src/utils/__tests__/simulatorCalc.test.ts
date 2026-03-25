/**
 * Unit tests for simulatorCalc utility
 * Target: >90% coverage of calculation logic including edge cases
 */
import { calculateSimulator } from "../simulatorCalc";

describe("calculateSimulator", () => {
  // ── Happy path ──────────────────────────────────────────────────────────────

  it("calculates correct payout for a basic scenario", () => {
    // stake=100, outcomePool=400, totalPool=1000
    // share = 100 / (400+100) = 0.2
    // payout = 0.2 * 1000 * 0.97 = 194
    const r = calculateSimulator(100, 400, 1000);
    expect(r.projectedPayout).toBeCloseTo(194, 5);
  });

  it("calculates correct profit (payout - stake)", () => {
    const r = calculateSimulator(100, 400, 1000);
    expect(r.projectedProfit).toBeCloseTo(94, 5);
  });

  it("calculates implied probability correctly", () => {
    // outcomePool=400, totalPool=1000 → 40%
    const r = calculateSimulator(100, 400, 1000);
    expect(r.impliedProbability).toBeCloseTo(40, 5);
  });

  it("applies 3% fee (0.97 multiplier)", () => {
    // If fee were 0%, payout = 0.5 * 200 = 100; with fee = 97
    const r = calculateSimulator(100, 100, 200);
    expect(r.projectedPayout).toBeCloseTo(97, 5);
  });

  it("returns negative profit when stake exceeds payout", () => {
    // Very small pool, large stake → low share
    const r = calculateSimulator(1000, 10, 20);
    // share = 1000/1010 ≈ 0.99; payout = 0.99 * 20 * 0.97 ≈ 19.21
    expect(r.projectedProfit).toBeLessThan(0);
  });

  it("returns positive profit when odds are favourable", () => {
    // stake=10, outcomePool=10, totalPool=1000
    // share = 10/20 = 0.5; payout = 0.5*1000*0.97 = 485
    const r = calculateSimulator(10, 10, 1000);
    expect(r.projectedProfit).toBeGreaterThan(0);
  });

  // ── Implied probability bounds ───────────────────────────────────────────────

  it("clamps implied probability to 100 when outcomePool >= totalPool", () => {
    const r = calculateSimulator(10, 1000, 1000);
    expect(r.impliedProbability).toBe(100);
  });

  it("returns 0 implied probability when outcomePool is 0", () => {
    const r = calculateSimulator(10, 0, 1000);
    expect(r.impliedProbability).toBe(0);
  });

  // ── Edge cases ───────────────────────────────────────────────────────────────

  it("returns zeroed result when stakeAmount is 0", () => {
    const r = calculateSimulator(0, 400, 1000);
    expect(r.projectedPayout).toBe(0);
    expect(r.projectedProfit).toBe(0);
    expect(r.impliedProbability).toBe(0);
  });

  it("returns zeroed result when stakeAmount is negative", () => {
    const r = calculateSimulator(-50, 400, 1000);
    expect(r.projectedPayout).toBe(0);
  });

  it("returns zeroed result when totalPool is 0", () => {
    const r = calculateSimulator(100, 0, 0);
    expect(r.projectedPayout).toBe(0);
  });

  it("returns zeroed result when totalPool is negative", () => {
    const r = calculateSimulator(100, 400, -100);
    expect(r.projectedPayout).toBe(0);
  });

  it("handles poolForOutcome = 0 (new outcome, no prior bets)", () => {
    // share = stake / (0 + stake) = 1.0 → full pool
    const r = calculateSimulator(50, 0, 500);
    expect(r.projectedPayout).toBeCloseTo(500 * 0.97, 5);
    expect(r.impliedProbability).toBe(0);
  });

  it("returns zeroed result for NaN stake", () => {
    const r = calculateSimulator(NaN, 400, 1000);
    expect(r.projectedPayout).toBe(0);
  });

  it("returns zeroed result for Infinity stake", () => {
    const r = calculateSimulator(Infinity, 400, 1000);
    expect(r.projectedPayout).toBe(0);
  });

  it("returns zeroed result for Infinity totalPool", () => {
    const r = calculateSimulator(100, 400, Infinity);
    expect(r.projectedPayout).toBe(0);
  });

  it("handles very small stake (fractional XLM)", () => {
    const r = calculateSimulator(0.001, 400, 1000);
    expect(r.projectedPayout).toBeGreaterThan(0);
    expect(r.projectedPayout).toBeLessThan(1);
  });

  it("handles very large stake", () => {
    const r = calculateSimulator(1_000_000, 400, 1000);
    // share ≈ 1; payout ≈ 1000 * 0.97 = 970
    expect(r.projectedPayout).toBeCloseTo(970, 0);
  });

  it("projectedPayout is never negative", () => {
    const r = calculateSimulator(1, 999999, 1000);
    expect(r.projectedPayout).toBeGreaterThanOrEqual(0);
  });

  // ── Formula accuracy ─────────────────────────────────────────────────────────

  it("matches manual formula calculation exactly", () => {
    const stake = 250;
    const pool = 750;
    const total = 2000;
    const expected = (stake / (pool + stake)) * total * 0.97;
    const r = calculateSimulator(stake, pool, total);
    expect(r.projectedPayout).toBeCloseTo(expected, 10);
  });

  it("implied probability matches manual formula", () => {
    const pool = 300;
    const total = 800;
    const expected = (pool / total) * 100;
    const r = calculateSimulator(10, pool, total);
    expect(r.impliedProbability).toBeCloseTo(expected, 10);
  });
});
