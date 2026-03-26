/**
 * Unit tests for marketDiscovery.ts
 * Covers: detectCategory, isMarketHot, rankMarkets
 * Target: >90% line/branch/function coverage
 */
import {
  detectCategory,
  isMarketHot,
  rankMarkets,
  DiscoverableMarket,
  MarketCategory,
} from "../marketDiscovery";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeMarket(
  overrides: Partial<DiscoverableMarket> & { id: number; question: string; category: MarketCategory }
): DiscoverableMarket {
  return {
    end_date: "2027-01-01T00:00:00Z",
    total_pool: "1000",
    resolved: false,
    volumeLast24h: 500,
    volumeLastHour: 100,
    volumePrevHour: 80,
    ...overrides,
  };
}

// ── detectCategory ────────────────────────────────────────────────────────────

describe("detectCategory", () => {
  it("detects Sports from football keyword", () => {
    expect(detectCategory("Will Arsenal win the Premier League?")).toBe("Sports");
  });

  it("detects Sports from 'champion'", () => {
    expect(detectCategory("Who will be champion of the NBA?")).toBe("Sports");
  });

  it("detects Crypto from bitcoin", () => {
    expect(detectCategory("Will Bitcoin reach $100k before 2027?")).toBe("Crypto");
  });

  it("detects Crypto from xlm", () => {
    expect(detectCategory("Will XLM hit $1 this year?")).toBe("Crypto");
  });

  it("detects Finance from inflation", () => {
    expect(detectCategory("Will Nigeria inflation drop below 15%?")).toBe("Finance");
  });

  it("detects Finance from 'interest rate'", () => {
    expect(detectCategory("Will the Fed raise interest rate in Q3?")).toBe("Finance");
  });

  it("detects Politics from election", () => {
    expect(detectCategory("Who will win the 2026 US election?")).toBe("Politics");
  });

  it("detects Politics from 'president'", () => {
    expect(detectCategory("Will the president sign the bill?")).toBe("Politics");
  });

  it("detects Weather from hurricane", () => {
    expect(detectCategory("Will a hurricane hit Florida this season?")).toBe("Weather");
  });

  it("detects Weather from temperature", () => {
    expect(detectCategory("Will average temperature exceed 30°C in July?")).toBe("Weather");
  });

  it("defaults to Finance for unrecognised questions", () => {
    expect(detectCategory("Something completely unrelated")).toBe("Finance");
  });

  it("is case-insensitive", () => {
    expect(detectCategory("BITCOIN PRICE PREDICTION")).toBe("Crypto");
  });
});

// ── isMarketHot ───────────────────────────────────────────────────────────────

describe("isMarketHot", () => {
  it("returns true when volume grew more than 20%", () => {
    expect(isMarketHot({ volumeLastHour: 121, volumePrevHour: 100 })).toBe(true);
  });

  it("returns false when volume grew exactly 20% (not strictly greater)", () => {
    expect(isMarketHot({ volumeLastHour: 120, volumePrevHour: 100 })).toBe(false);
  });

  it("returns false when volume grew less than 20%", () => {
    expect(isMarketHot({ volumeLastHour: 110, volumePrevHour: 100 })).toBe(false);
  });

  it("returns false when volume dropped", () => {
    expect(isMarketHot({ volumeLastHour: 50, volumePrevHour: 100 })).toBe(false);
  });

  it("returns false when prevHour is 0 (avoids false positives on new markets)", () => {
    expect(isMarketHot({ volumeLastHour: 999, volumePrevHour: 0 })).toBe(false);
  });

  it("returns false when both are 0", () => {
    expect(isMarketHot({ volumeLastHour: 0, volumePrevHour: 0 })).toBe(false);
  });
});

// ── rankMarkets ───────────────────────────────────────────────────────────────

describe("rankMarkets", () => {
  const markets: DiscoverableMarket[] = [
    makeMarket({ id: 1, question: "BTC to 100k?", category: "Crypto", volumeLast24h: 10000 }),
    makeMarket({ id: 2, question: "Arsenal win?", category: "Sports", volumeLast24h: 5000 }),
    makeMarket({ id: 3, question: "Inflation drop?", category: "Finance", volumeLast24h: 2000 }),
    makeMarket({ id: 4, question: "Election result?", category: "Politics", volumeLast24h: 8000 }),
    makeMarket({ id: 5, question: "Hurricane season?", category: "Weather", volumeLast24h: 1000 }),
    makeMarket({ id: 6, question: "ETH price?", category: "Crypto", volumeLast24h: 6000 }),
    makeMarket({ id: 7, question: "Fed rate hike?", category: "Finance", volumeLast24h: 3000 }),
  ];

  it("returns at most topN markets (default 6)", () => {
    const result = rankMarkets(markets, {});
    expect(result.length).toBe(6);
  });

  it("respects custom topN", () => {
    expect(rankMarkets(markets, {}, 3).length).toBe(3);
  });

  it("excludes resolved markets", () => {
    const withResolved = [
      ...markets,
      makeMarket({ id: 99, question: "Resolved market", category: "Crypto", volumeLast24h: 99999, resolved: true }),
    ];
    const result = rankMarkets(withResolved, {});
    expect(result.find((m) => m.id === 99)).toBeUndefined();
  });

  it("ranks by score descending — volume-only when no history", () => {
    const result = rankMarkets(markets, {});
    // id:1 has highest volume (10000 → score 10), id:4 next (8000 → 8)
    expect(result[0].id).toBe(1);
    expect(result[1].id).toBe(4);
  });

  it("boosts markets matching user category history", () => {
    // User has 5 Sports interactions → Sports score += 10
    const result = rankMarkets(markets, { Sports: 5 });
    // id:2 Sports: score = (5*2) + (5000/1000) = 10 + 5 = 15
    // id:1 Crypto: score = (0*2) + (10000/1000) = 0 + 10 = 10
    expect(result[0].id).toBe(2);
  });

  it("uses pool size as tiebreaker when scores are equal", () => {
    const tied = [
      makeMarket({ id: 10, question: "BTC?", category: "Crypto", volumeLast24h: 1000, total_pool: "500" }),
      makeMarket({ id: 11, question: "ETH?", category: "Crypto", volumeLast24h: 1000, total_pool: "800" }),
    ];
    const result = rankMarkets(tied, {}, 2);
    expect(result[0].id).toBe(11); // higher pool wins tiebreak
  });

  it("attaches isHot=true to trending markets", () => {
    const hotMarket = makeMarket({
      id: 20, question: "Hot market?", category: "Crypto",
      volumeLast24h: 5000, volumeLastHour: 200, volumePrevHour: 100,
    });
    const result = rankMarkets([hotMarket], {}, 1);
    expect(result[0].isHot).toBe(true);
  });

  it("attaches isHot=false to non-trending markets", () => {
    const coolMarket = makeMarket({
      id: 21, question: "Cool market?", category: "Finance",
      volumeLast24h: 1000, volumeLastHour: 50, volumePrevHour: 100,
    });
    const result = rankMarkets([coolMarket], {}, 1);
    expect(result[0].isHot).toBe(false);
  });

  it("returns empty array when all markets are resolved", () => {
    const allResolved = markets.map((m) => ({ ...m, resolved: true }));
    expect(rankMarkets(allResolved, {})).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    expect(rankMarkets([], {})).toEqual([]);
  });

  it("attaches correct score to each market", () => {
    const m = makeMarket({ id: 30, question: "XLM?", category: "Crypto", volumeLast24h: 3000 });
    // categoryMatches=2, volumeLast24h=3000 → score = (2*2) + (3000/1000) = 4 + 3 = 7
    const result = rankMarkets([m], { Crypto: 2 }, 1);
    expect(result[0].score).toBeCloseTo(7);
  });
});
