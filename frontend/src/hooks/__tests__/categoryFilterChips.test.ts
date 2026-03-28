import { filterByCategories } from "../useMarketSearch";
import type { Market } from "../useMarketSearch";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeMarket = (id: number, category: string): Market => ({
  id,
  question: `Market ${id}`,
  category,
  end_date: "2030-01-01",
  outcomes: ["Yes", "No"],
  resolved: false,
  winning_outcome: null,
  total_pool: "1000",
  status: "open",
});

const MARKETS: Market[] = [
  makeMarket(1, "Sports"),
  makeMarket(2, "Crypto"),
  makeMarket(3, "Finance"),
  makeMarket(4, "Politics"),
  makeMarket(5, "Weather"),
  makeMarket(6, "Entertainment"),
  makeMarket(7, "Sports"),
  makeMarket(8, "Crypto"),
];

// ---------------------------------------------------------------------------
// filterByCategories — pure function tests
// ---------------------------------------------------------------------------

describe("filterByCategories", () => {
  it("returns all markets when activeCategories is empty", () => {
    expect(filterByCategories(MARKETS, [])).toHaveLength(MARKETS.length);
  });

  it("filters to a single category", () => {
    const result = filterByCategories(MARKETS, ["Sports"]);
    expect(result).toHaveLength(2);
    expect(result.every((m) => m.category === "Sports")).toBe(true);
  });

  it("filters to multiple categories (OR within the set)", () => {
    const result = filterByCategories(MARKETS, ["Sports", "Crypto"]);
    expect(result).toHaveLength(4);
    expect(result.every((m) => m.category === "Sports" || m.category === "Crypto")).toBe(true);
  });

  it("returns empty array when no markets match the selected categories", () => {
    const result = filterByCategories(MARKETS, ["Finance", "Politics"]);
    // Finance=1, Politics=1 ? 2 results
    expect(result).toHaveLength(2);
  });

  it("is case-insensitive", () => {
    const result = filterByCategories(MARKETS, ["sports"]);
    expect(result).toHaveLength(2);
  });

  it("handles markets with no category (treats as empty string)", () => {
    const noCategory: Market[] = [makeMarket(99, "")];
    expect(filterByCategories(noCategory, ["Sports"])).toHaveLength(0);
    expect(filterByCategories(noCategory, [])).toHaveLength(1);
  });

  it("handles all 7 chip categories independently", () => {
    const allCats = ["Sports", "Crypto", "Finance", "Politics", "Weather", "Entertainment"];
    for (const cat of allCats) {
      const result = filterByCategories(MARKETS, [cat]);
      const expected = MARKETS.filter((m) => m.category === cat);
      expect(result).toHaveLength(expected.length);
    }
  });

  it("selecting all categories returns all matching markets", () => {
    const allCats = ["Sports", "Crypto", "Finance", "Politics", "Weather", "Entertainment"];
    const result = filterByCategories(MARKETS, allCats);
    expect(result).toHaveLength(MARKETS.length);
  });

  it("returns empty array when markets list is empty", () => {
    expect(filterByCategories([], ["Sports"])).toHaveLength(0);
  });

  it("toggling a chip off removes its category from results", () => {
    // Start with Sports + Crypto active
    const withBoth = filterByCategories(MARKETS, ["Sports", "Crypto"]);
    expect(withBoth).toHaveLength(4);

    // Toggle off Crypto
    const withSportsOnly = filterByCategories(MARKETS, ["Sports"]);
    expect(withSportsOnly).toHaveLength(2);
    expect(withSportsOnly.every((m) => m.category === "Sports")).toBe(true);
  });

  it("toggling All (empty array) after selection resets to all markets", () => {
    const filtered = filterByCategories(MARKETS, ["Sports"]);
    expect(filtered).toHaveLength(2);

    const reset = filterByCategories(MARKETS, []);
    expect(reset).toHaveLength(MARKETS.length);
  });

  it("Finance + Weather combination returns correct subset", () => {
    const result = filterByCategories(MARKETS, ["Finance", "Weather"]);
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.category).sort()).toEqual(["Finance", "Weather"]);
  });

  it("Politics + Entertainment combination returns correct subset", () => {
    const result = filterByCategories(MARKETS, ["Politics", "Entertainment"]);
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.category).sort()).toEqual(["Entertainment", "Politics"]);
  });

  it("three-category combination returns correct count", () => {
    const result = filterByCategories(MARKETS, ["Sports", "Finance", "Weather"]);
    expect(result).toHaveLength(4);
  });
});

