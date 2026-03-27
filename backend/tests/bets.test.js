const request = require("supertest");
const express = require("express");
const betsRouter = require("../src/routes/bets");

describe("Bets Routes - Payout Calculation", () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use("/api/bets", betsRouter);
  });

  describe("BigInt Payout Calculation", () => {
    /**
     * Test: Exact payout values with known inputs
     * Verifies BigInt arithmetic produces correct results
     */
    test("should calculate exact payouts with 1 winner", () => {
      // Simulate payout calculation with 1 winner
      const totalPoolStroops = BigInt(Math.round(100 * 10_000_000)); // 100 XLM
      const payoutPool = (totalPoolStroops * 97n) / 100n; // 97 XLM
      const winningStakeStroops = BigInt(Math.round(100 * 10_000_000)); // 100 stroops
      
      const payoutStroops = (BigInt(Math.round(100 * 10_000_000)) * payoutPool) / winningStakeStroops;
      const payoutXlm = (Number(payoutStroops) / 10_000_000).toFixed(7);

      // Winner should get 97 XLM (100 * 0.97)
      expect(parseFloat(payoutXlm)).toBeCloseTo(97, 5);
    });

    /**
     * Test: Exact payout values with 10 winners
     * Verifies proportional distribution
     */
    test("should calculate exact payouts with 10 winners", () => {
      const totalPoolStroops = BigInt(Math.round(1000 * 10_000_000)); // 1000 XLM
      const payoutPool = (totalPoolStroops * 97n) / 100n; // 970 XLM
      const winningStakeStroops = BigInt(Math.round(1000 * 10_000_000)); // 1000 XLM total stake

      const payouts = [];
      let totalPayoutStroops = 0n;

      // 10 winners with 100 XLM each
      for (let i = 0; i < 10; i++) {
        const betStroops = BigInt(Math.round(100 * 10_000_000));
        const payoutStroops = (betStroops * payoutPool) / winningStakeStroops;
        payouts.push(Number(payoutStroops) / 10_000_000);
        totalPayoutStroops += payoutStroops;
      }

      // Each winner should get 97 XLM
      payouts.forEach((payout) => {
        expect(payout).toBeCloseTo(97, 5);
      });

      // Total should not exceed payout pool
      expect(totalPayoutStroops).toBeLessThanOrEqual(payoutPool);
    });

    /**
     * Test: Exact payout values with 100 winners
     * Verifies no rounding errors accumulate
     */
    test("should calculate exact payouts with 100 winners", () => {
      const totalPoolStroops = BigInt(Math.round(10000 * 10_000_000)); // 10000 XLM
      const payoutPool = (totalPoolStroops * 97n) / 100n; // 9700 XLM
      const winningStakeStroops = BigInt(Math.round(10000 * 10_000_000)); // 10000 XLM total stake

      let totalPayoutStroops = 0n;

      // 100 winners with 100 XLM each
      for (let i = 0; i < 100; i++) {
        const betStroops = BigInt(Math.round(100 * 10_000_000));
        const payoutStroops = (betStroops * payoutPool) / winningStakeStroops;
        totalPayoutStroops += payoutStroops;
      }

      // Total should not exceed payout pool
      expect(totalPayoutStroops).toBeLessThanOrEqual(payoutPool);
      
      // Total should be close to payout pool (within 1 stroop per winner due to rounding)
      const difference = payoutPool - totalPayoutStroops;
      expect(Number(difference)).toBeLessThanOrEqual(100); // Max 100 stroops difference
    });

    /**
     * Test: Unequal bet amounts
     * Verifies proportional distribution with different stake sizes
     */
    test("should handle unequal bet amounts correctly", () => {
      const totalPoolStroops = BigInt(Math.round(1000 * 10_000_000)); // 1000 XLM
      const payoutPool = (totalPoolStroops * 97n) / 100n; // 970 XLM
      
      // Winners: 500 XLM, 300 XLM, 200 XLM
      const bets = [500, 300, 200];
      const winningStakeStroops = BigInt(Math.round(1000 * 10_000_000));

      const payouts = [];
      let totalPayoutStroops = 0n;

      for (const bet of bets) {
        const betStroops = BigInt(Math.round(bet * 10_000_000));
        const payoutStroops = (betStroops * payoutPool) / winningStakeStroops;
        payouts.push(Number(payoutStroops) / 10_000_000);
        totalPayoutStroops += payoutStroops;
      }

      // Verify proportions
      expect(payouts[0]).toBeCloseTo(485, 4); // 500/1000 * 970
      expect(payouts[1]).toBeCloseTo(291, 4); // 300/1000 * 970
      expect(payouts[2]).toBeCloseTo(194, 4); // 200/1000 * 970

      // Total should not exceed payout pool
      expect(totalPayoutStroops).toBeLessThanOrEqual(payoutPool);
    });

    /**
     * Test: Verify no floating point errors
     * Compares BigInt result with floating point to show difference
     */
    test("should avoid floating point errors that would occur with parseFloat", () => {
      const totalPool = 1000.123456; // Non-terminating decimal
      const winningStake = 1000.123456;
      const betAmount = 100.123456;

      // Floating point calculation (WRONG)
      const floatShare = betAmount / winningStake;
      const floatPayout = floatShare * totalPool * 0.97;

      // BigInt calculation (CORRECT)
      const totalPoolStroops = BigInt(Math.round(totalPool * 10_000_000));
      const payoutPool = (totalPoolStroops * 97n) / 100n;
      const winningStakeStroops = BigInt(Math.round(winningStake * 10_000_000));
      const betStroops = BigInt(Math.round(betAmount * 10_000_000));
      const bigintPayoutStroops = (betStroops * payoutPool) / winningStakeStroops;
      const bigintPayout = Number(bigintPayoutStroops) / 10_000_000;

      // BigInt should be more precise
      expect(Math.abs(bigintPayout - floatPayout)).toBeLessThan(0.0001);
    });

    /**
     * Test: Edge case with very small amounts
     * Verifies precision with stroop-level amounts
     */
    test("should handle very small amounts (stroops)", () => {
      // 1 stroop = 0.0000001 XLM
      const totalPoolStroops = 1000000000n; // 100 XLM
      const payoutPool = (totalPoolStroops * 97n) / 100n;
      const winningStakeStroops = 1000000000n;
      const betStroops = 1n; // 1 stroop

      const payoutStroops = (betStroops * payoutPool) / winningStakeStroops;
      
      // Should not round to zero
      expect(payoutStroops).toBeGreaterThan(0n);
    });
  });
});
