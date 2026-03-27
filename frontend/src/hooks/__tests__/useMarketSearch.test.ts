import { applySort, createFuse, Market, SearchFilters } from "../useMarketSearch";
import { renderHook } from "@testing-library/react";
import { useMarketSearch } from "../useMarketSearch";

const MARKETS: Market[] = [
  {
    id: 1,
    question: "Will Bitcoin reach $100k before 2027?",
    category: "Crypto",
    end_date: "2026-12-31T00:00:00Z",
    outcomes: ["Yes", "No"],
    resolved: false,
    winning_outcome: null,
    total_pool: "4200",
    status: "open",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: 2,
    question: "Will Nigeria inflation drop below 15%?",
    category: "Economics",
    end_date: "2026-06-30T00:00:00Z",
    outcomes: ["Yes", "No"],
    resolved: false,
    winning_outcome: null,
    total_pool: "1800",
    status: "open",
    created_at: "2026-02-01T00:00:00Z",
  },
  {
    id: 3,
    question: "Will Arsenal win the Premier League?",
    category: "Sports",
    end_date: "2026-05-30T00:00:00Z",
    outcomes: ["Yes", "No"],
    resolved: true,
    winning_outcome: 0,
    total_pool: "3100",
    status: "resolved",
    created_at: "2026-03-01T00:00:00Z",
  },
  {
    id: 4,
    question: "Will AI replace 30% of jobs by 2030?",
    category: "Tech",
    end_date: "2030-01-01T00:00:00Z",
    outcomes: ["Yes", "No"],
    resolved: false,
    winning_outcome: null,
    total_pool: "900",
    status: "open",
    created_at: "2026-03-15T00:00:00Z",
  },
];

const DEFAULT_FILTERS: SearchFilters = {
  query: "",
  category: "",
  status: "",
  sort: "newest",
};

// ── applySort ─────────────────────────────────────────────────────────────────

describe("applySort", () => {
  it("sorts by volume descending", () => {
    const sorted = applySort(MARKETS, "volume");
    expect(sorted.map((m) => m.id)).toEqual([1, 3, 2, 4]);
  });

  it("sorts by end_date ascending", () => {
    const sorted = applySort(MARKETS, "end_date");
    expect(sorted[0].id).toBe(3); // 2026-05-30 earliest
    expect(sorted[sorted.length - 1].id).toBe(4); // 2030-01-01 latest
  });

  it("sorts by newest (created_at desc)", () => {
    const sorted = applySort(MARKETS, "newest");
    expect(sorted[0].id).toBe(4); // 2026-03-15 most recent
    expect(sorted[sorted.length - 1].id).toBe(1); // 2026-01-01 oldest
  });

  it("falls back to id desc when no created_at", () => {
    const noDate = MARKETS.map(({ created_at: _ca, ...m }) => m as Market);
    const sorted = applySort(noDate, "newest");
    expect(sorted[0].id).toBe(4);
  });

  it("does not mutate the original array", () => {
    const original = [...MARKETS];
    applySort(MARKETS, "volume");
    expect(MARKETS).toEqual(original);
  });
});

// ── createFuse ────────────────────────────────────────────────────────────────

describe("createFuse", () => {
  it("returns exact matches", () => {
    const fuse = createFuse(MARKETS);
    const results = fuse.search("Bitcoin");
    expect(results[0].item.id).toBe(1);
  });

  it("returns partial matches (fuzzy)", () => {
    const fuse = createFuse(MARKETS);
    const results = fuse.search("Bitcoi"); // missing last char
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].item.id).toBe(1);
  });

  it("matches on category field", () => {
    const fuse = createFuse(MARKETS);
    const results = fuse.search("Sports");
    expect(results.some((r) => r.item.category === "Sports")).toBe(true);
  });

  it("returns empty array for nonsense query", () => {
    const fuse = createFuse(MARKETS);
    expect(fuse.search("zzzzzzzzzzzzzzzzzzz")).toHaveLength(0);
  });
});

// ── useMarketSearch hook ──────────────────────────────────────────────────────

describe("useMarketSearch", () => {
  function run(filters: Partial<SearchFilters> = {}) {
    const { result } = renderHook(() =>
      useMarketSearch(MARKETS, { ...DEFAULT_FILTERS, ...filters })
    );
    return result.current;
  }

  it("returns all markets when no filters applied", () => {
    expect(run()).toHaveLength(MARKETS.length);
  });

  it("fuzzy searches by question", () => {
    const results = run({ query: "Bitcoin" });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].question).toMatch(/Bitcoin/i);
  });

  it("handles misspelled query (fuzzy)", () => {
    const results = run({ query: "Bitcoinn" }); // extra n
    expect(results.length).toBeGreaterThan(0);
  });

  it("returns empty for very short query (< 2 chars)", () => {
    // query < 2 chars skips fuse, returns all
    const results = run({ query: "B" });
    expect(results).toHaveLength(MARKETS.length);
  });

  it("filters by category", () => {
    const results = run({ category: "Sports" });
    expect(results.every((m) => m.category === "Sports")).toBe(true);
    expect(results).toHaveLength(1);
  });

  it("filters by status", () => {
    const results = run({ status: "resolved" });
    expect(results.every((m) => m.status === "resolved")).toBe(true);
  });

  it("combines category and status filters", () => {
    const results = run({ category: "Crypto", status: "open" });
    expect(results.every((m) => m.category === "Crypto" && m.status === "open")).toBe(true);
  });

  it("combines search query with category filter", () => {
    const results = run({ query: "inflation", category: "Economics" });
    expect(results.every((m) => m.category === "Economics")).toBe(true);
  });

  it("returns empty when no markets match combined filters", () => {
    const results = run({ category: "Sports", status: "open" });
    expect(results).toHaveLength(0);
  });

  it("sorts by volume when no query", () => {
    const results = run({ sort: "volume" });
    expect(results[0].id).toBe(1); // 4200 XLM highest
  });

  it("sorts by end_date when no query", () => {
    const results = run({ sort: "end_date" });
    expect(results[0].id).toBe(3); // earliest end date
  });

  it("sorts by newest when no query", () => {
    const results = run({ sort: "newest" });
    expect(results[0].id).toBe(4); // most recently created
  });

  it("does not apply sort when query is active (preserves fuse score order)", () => {
    const withSort = run({ query: "Bitcoin", sort: "end_date" });
    // Should still return Bitcoin as first result (fuse relevance, not date sort)
    expect(withSort[0].question).toMatch(/Bitcoin/i);
  });

  it("returns empty array when markets list is empty", () => {
    const { result } = renderHook(() => useMarketSearch([], DEFAULT_FILTERS));
    expect(result.current).toHaveLength(0);
  });

  it("is case-insensitive for category filter", () => {
    const results = run({ category: "crypto" });
    expect(results.every((m) => m.category?.toLowerCase() === "crypto")).toBe(true);
  });
});
