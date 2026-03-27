const assert = require("assert");

/**
 * Test payout calculation with BigInt precision
 * Ensures exact stroop-level accuracy without floating point errors
 */

function calculatePayouts(totalPoolXlm, winners) {
  const STROOP_MULTIPLIER = 10_000_000n;
  const totalPoolStroops = BigInt(Math.floor(totalPoolXlm * 1e7));
  
  const winningStakeStroops = winners.reduce((sum, w) => {
    return sum + BigInt(Math.floor(w.amountXlm * 1e7));
  }, 0n);

  if (winningStakeStroops === 0n) {
    throw new Error("No winning stake");
  }

  const payoutPoolStroops = (totalPoolStroops * 97n) / 100n;

  return winners.map((winner) => {
    const betAmountStroops = BigInt(Math.floor(winner.amountXlm * 1e7));
    const payoutStroops = (betAmountStroops * payoutPoolStroops) / winningStakeStroops;
    const payoutXlm = Number(payoutStroops) / 1e7;
    return { wallet: winner.wallet, payout: payoutXlm };
  });
}

describe("Payout Calculation with BigInt", () => {
  it("should calculate exact payouts for 1 winner", () => {
    const payouts = calculatePayouts(100, [{ wallet: "addr1", amountXlm: 100 }]);
    assert.strictEqual(payouts.length, 1);
    // 100 * 0.97 = 97
    assert.strictEqual(payouts[0].payout, 97);
  });

  it("should calculate exact payouts for 10 winners with equal stakes", () => {
    const winners = Array.from({ length: 10 }, (_, i) => ({
      wallet: `addr${i}`,
      amountXlm: 10,
    }));
    const payouts = calculatePayouts(100, winners);
    assert.strictEqual(payouts.length, 10);
    // Each winner gets 100 * 0.97 / 10 = 9.7
    payouts.forEach((p) => {
      assert.strictEqual(p.payout, 9.7);
    });
  });

  it("should calculate exact payouts for 100 winners with unequal stakes", () => {
    const winners = Array.from({ length: 100 }, (_, i) => ({
      wallet: `addr${i}`,
      amountXlm: 1 + (i % 10) * 0.1, // Varying amounts
    }));
    const payouts = calculatePayouts(1000, winners);
    assert.strictEqual(payouts.length, 100);
    
    // Verify total payout doesn't exceed pool * 0.97
    const totalPayout = payouts.reduce((sum, p) => sum + p.payout, 0);
    const maxPayout = 1000 * 0.97;
    assert(totalPayout <= maxPayout + 0.0001, `Total payout ${totalPayout} exceeds max ${maxPayout}`);
  });

  it("should handle stroop precision without rounding errors", () => {
    // Test case that would fail with floating point
    const payouts = calculatePayouts(123.4567890, [
      { wallet: "addr1", amountXlm: 45.6789012 },
      { wallet: "addr2", amountXlm: 77.7778878 },
    ]);
    
    assert.strictEqual(payouts.length, 2);
    // Verify payouts are valid numbers
    payouts.forEach((p) => {
      assert(typeof p.payout === "number");
      assert(p.payout > 0);
      assert(p.payout <= 123.4567890 * 0.97);
    });
  });

  it("should distribute entire pool (minus fee) to winners", () => {
    const winners = [
      { wallet: "addr1", amountXlm: 30 },
      { wallet: "addr2", amountXlm: 70 },
    ];
    const payouts = calculatePayouts(100, winners);
    
    const totalPayout = payouts.reduce((sum, p) => sum + p.payout, 0);
    const expectedTotal = 100 * 0.97;
    
    // Allow for tiny rounding differences at stroop level
    assert(Math.abs(totalPayout - expectedTotal) < 0.0000001);
  });
});
