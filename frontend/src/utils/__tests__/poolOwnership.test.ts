/**
 * Unit tests for poolOwnership utilities
 * Target: >90% coverage of buildOwnershipSlices and abbreviateWallet
 */
import {
  buildOwnershipSlices,
  abbreviateWallet,
  OTHERS_THRESHOLD,
  RawBet,
} from "../poolOwnership";

// ── abbreviateWallet ──────────────────────────────────────────────────────────

describe("abbreviateWallet", () => {
  it("abbreviates a long wallet address", () => {
    expect(abbreviateWallet("GABCDEFGHIJKLMNOPQRSTUVWXYZ1234")).toBe("GABC...1234");
  });

  it("returns short addresses unchanged", () => {
    expect(abbreviateWallet("GABC")).toBe("GABC");
    expect(abbreviateWallet("GABCDE1234")).toBe("GABCDE1234");
  });

  it("handles exactly 10 characters unchanged", () => {
    expect(abbreviateWallet("GABCDE1234")).toBe("GABCDE1234");
  });

  it("handles 11 characters with abbreviation", () => {
    expect(abbreviateWallet("GABCDE12345")).toBe("GABC...2345");
  });
});

// ── buildOwnershipSlices ──────────────────────────────────────────────────────

const WALLET_A = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const WALLET_B = "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const WALLET_C = "GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";

describe("buildOwnershipSlices", () => {
  it("returns empty array for empty bets", () => {
    expect(buildOwnershipSlices([], 1000)).toEqual([]);
  });

  it("returns empty array when totalPool is 0", () => {
    const bets: RawBet[] = [{ wallet_address: WALLET_A, amount: "100" }];
    expect(buildOwnershipSlices(bets, 0)).toEqual([]);
  });

  it("returns empty array when totalPool is negative", () => {
    const bets: RawBet[] = [{ wallet_address: WALLET_A, amount: "100" }];
    expect(buildOwnershipSlices(bets, -100)).toEqual([]);
  });

  it("calculates correct percentage for a single bettor", () => {
    const bets: RawBet[] = [{ wallet_address: WALLET_A, amount: "500" }];
    const slices = buildOwnershipSlices(bets, 500);
    expect(slices).toHaveLength(1);
    expect(slices[0].percentage).toBeCloseTo(100, 5);
    expect(slices[0].amount).toBe(500);
    expect(slices[0].wallet).toBe(WALLET_A);
  });

  it("aggregates multiple bets from the same wallet", () => {
    const bets: RawBet[] = [
      { wallet_address: WALLET_A, amount: "200" },
      { wallet_address: WALLET_A, amount: "300" },
    ];
    const slices = buildOwnershipSlices(bets, 500);
    expect(slices).toHaveLength(1);
    expect(slices[0].amount).toBe(500);
    expect(slices[0].percentage).toBeCloseTo(100, 5);
  });

  it("calculates correct percentages for two wallets", () => {
    const bets: RawBet[] = [
      { wallet_address: WALLET_A, amount: "750" },
      { wallet_address: WALLET_B, amount: "250" },
    ];
    const slices = buildOwnershipSlices(bets, 1000);
    const a = slices.find((s) => s.wallet === WALLET_A)!;
    const b = slices.find((s) => s.wallet === WALLET_B)!;
    expect(a.percentage).toBeCloseTo(75, 5);
    expect(b.percentage).toBeCloseTo(25, 5);
  });

  it("sorts slices descending by amount", () => {
    const bets: RawBet[] = [
      { wallet_address: WALLET_B, amount: "100" },
      { wallet_address: WALLET_A, amount: "800" },
      { wallet_address: WALLET_C, amount: "100" },
    ];
    const slices = buildOwnershipSlices(bets, 1000);
    expect(slices[0].wallet).toBe(WALLET_A);
  });

  it(`groups wallets below ${OTHERS_THRESHOLD}% into Others`, () => {
    // WALLET_A: 99%, WALLET_B: 0.5%, WALLET_C: 0.5%
    const bets: RawBet[] = [
      { wallet_address: WALLET_A, amount: "990" },
      { wallet_address: WALLET_B, amount: "5" },
      { wallet_address: WALLET_C, amount: "5" },
    ];
    const slices = buildOwnershipSlices(bets, 1000);
    const others = slices.find((s) => s.label === "Others");
    expect(others).toBeDefined();
    expect(others!.amount).toBeCloseTo(10, 5);
    expect(others!.wallet).toBeNull();
    // WALLET_A should still be its own slice
    expect(slices.find((s) => s.wallet === WALLET_A)).toBeDefined();
  });

  it("does not create Others slice when all wallets are above threshold", () => {
    const bets: RawBet[] = [
      { wallet_address: WALLET_A, amount: "500" },
      { wallet_address: WALLET_B, amount: "500" },
    ];
    const slices = buildOwnershipSlices(bets, 1000);
    expect(slices.find((s) => s.label === "Others")).toBeUndefined();
    expect(slices).toHaveLength(2);
  });

  it("handles numeric amount values (not just strings)", () => {
    const bets: RawBet[] = [{ wallet_address: WALLET_A, amount: 400 }];
    const slices = buildOwnershipSlices(bets, 400);
    expect(slices[0].amount).toBe(400);
  });

  it("skips bets with zero or negative amounts", () => {
    const bets: RawBet[] = [
      { wallet_address: WALLET_A, amount: "500" },
      { wallet_address: WALLET_B, amount: "0" },
      { wallet_address: WALLET_C, amount: "-10" },
    ];
    const slices = buildOwnershipSlices(bets, 500);
    expect(slices.find((s) => s.wallet === WALLET_B)).toBeUndefined();
    expect(slices.find((s) => s.wallet === WALLET_C)).toBeUndefined();
  });

  it("skips bets with NaN amounts", () => {
    const bets: RawBet[] = [
      { wallet_address: WALLET_A, amount: "500" },
      { wallet_address: WALLET_B, amount: "abc" },
    ];
    const slices = buildOwnershipSlices(bets, 500);
    expect(slices.find((s) => s.wallet === WALLET_B)).toBeUndefined();
  });

  it("Others slice percentage sums correctly with significant slices", () => {
    const bets: RawBet[] = [
      { wallet_address: WALLET_A, amount: "980" },
      { wallet_address: WALLET_B, amount: "5" },
      { wallet_address: WALLET_C, amount: "15" },
    ];
    const slices = buildOwnershipSlices(bets, 1000);
    const total = slices.reduce((s, sl) => s + sl.percentage, 0);
    expect(total).toBeCloseTo(100, 3);
  });

  it("abbreviates wallet labels correctly", () => {
    const bets: RawBet[] = [{ wallet_address: WALLET_A, amount: "100" }];
    const slices = buildOwnershipSlices(bets, 100);
    expect(slices[0].label).not.toBe(WALLET_A);
    expect(slices[0].label).toContain("...");
  });
});
