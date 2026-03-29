"use strict";

/**
 * Unit tests for GraphQL resolvers.
 * All DB calls are mocked. DataLoaders are provided via a mock context.
 * Coverage target: >95%
 */

jest.mock("../db");
jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
// Prevent pubsub from requiring real EventEmitter issues in test
jest.mock("../graphql/pubsub", () => ({
  subscribe: jest.fn(),
  publish: jest.fn(),
}));

const db = require("../db");
const pubsub = require("../graphql/pubsub");
const resolvers = require("../graphql/resolvers");

// ── helpers ───────────────────────────────────────────────────────────────────

function makeMarket(overrides = {}) {
  return {
    id: 1,
    question: "Will BTC reach $100k?",
    outcomes: ["Yes", "No"],
    end_date: new Date(Date.now() + 86400000).toISOString(),
    resolved: false,
    winning_outcome: null,
    total_pool: "0",
    status: "open",
    category: "crypto",
    contract_address: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeBet(overrides = {}) {
  return {
    id: 1,
    market_id: 1,
    wallet_address: "GABC123",
    outcome_index: 0,
    amount: "1000000",
    paid_out: false,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeUser(overrides = {}) {
  return {
    wallet_address: "GABC123",
    total_staked: "5000000",
    total_won: "2000000",
    bet_count: 5,
    win_count: 2,
    first_seen: new Date().toISOString(),
    last_seen: new Date().toISOString(),
    ...overrides,
  };
}

function makeLoaders(overrides = {}) {
  return {
    market: { load: jest.fn() },
    betsByMarket: { load: jest.fn() },
    betsByWallet: { load: jest.fn() },
    betCount: { load: jest.fn() },
    ...overrides,
  };
}

beforeEach(() => jest.clearAllMocks());

// ── Query.market ──────────────────────────────────────────────────────────────

describe("Query.market", () => {
  test("returns market when found", async () => {
    const market = makeMarket();
    db.query.mockResolvedValueOnce({ rows: [market] });
    const result = await resolvers.Query.market(null, { id: 1 });
    expect(result).toEqual(market);
    expect(db.query).toHaveBeenCalledWith("SELECT * FROM markets WHERE id = $1", [1]);
  });

  test("returns null when not found", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const result = await resolvers.Query.market(null, { id: 99 });
    expect(result).toBeNull();
  });
});

// ── Query.markets ─────────────────────────────────────────────────────────────

describe("Query.markets", () => {
  test("returns all markets with no filters", async () => {
    const markets = [makeMarket(), makeMarket({ id: 2 })];
    db.query.mockResolvedValueOnce({ rows: markets });
    const result = await resolvers.Query.markets(null, {});
    expect(result).toHaveLength(2);
  });

  test("filters by status", async () => {
    db.query.mockResolvedValueOnce({ rows: [makeMarket()] });
    await resolvers.Query.markets(null, { status: "open" });
    expect(db.query.mock.calls[0][0]).toContain("status = $1");
    expect(db.query.mock.calls[0][1]).toContain("open");
  });

  test("filters by category", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await resolvers.Query.markets(null, { category: "sports" });
    expect(db.query.mock.calls[0][0]).toContain("category = $1");
  });

  test("filters by both status and category", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await resolvers.Query.markets(null, { status: "open", category: "crypto" });
    expect(db.query.mock.calls[0][0]).toContain("WHERE");
    expect(db.query.mock.calls[0][0]).toContain("AND");
  });

  test("applies limit and offset", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await resolvers.Query.markets(null, { limit: 10, offset: 5 });
    const params = db.query.mock.calls[0][1];
    expect(params).toContain(10);
    expect(params).toContain(5);
  });
});

// ── Query.bets ────────────────────────────────────────────────────────────────

describe("Query.bets", () => {
  test("returns all bets with no filters", async () => {
    db.query.mockResolvedValueOnce({ rows: [makeBet()] });
    const result = await resolvers.Query.bets(null, {});
    expect(result).toHaveLength(1);
  });

  test("filters by market_id", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await resolvers.Query.bets(null, { market_id: 1 });
    expect(db.query.mock.calls[0][0]).toContain("market_id = $1");
  });

  test("filters by wallet_address", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await resolvers.Query.bets(null, { wallet_address: "GABC" });
    expect(db.query.mock.calls[0][0]).toContain("wallet_address = $1");
  });

  test("filters by both market_id and wallet_address", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await resolvers.Query.bets(null, { market_id: 1, wallet_address: "GABC" });
    expect(db.query.mock.calls[0][0]).toContain("AND");
  });
});

// ── Query.betsByWallet ────────────────────────────────────────────────────────

describe("Query.betsByWallet", () => {
  test("returns bets for wallet", async () => {
    const bets = [makeBet(), makeBet({ id: 2 })];
    db.query.mockResolvedValueOnce({ rows: bets });
    const result = await resolvers.Query.betsByWallet(null, { wallet_address: "GABC123" });
    expect(result).toHaveLength(2);
  });

  test("applies limit and offset", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await resolvers.Query.betsByWallet(null, { wallet_address: "GABC", limit: 5, offset: 10 });
    expect(db.query.mock.calls[0][1]).toEqual(["GABC", 5, 10]);
  });
});

// ── Query.betsByMarket ────────────────────────────────────────────────────────

describe("Query.betsByMarket", () => {
  test("returns bets for market", async () => {
    db.query.mockResolvedValueOnce({ rows: [makeBet()] });
    const result = await resolvers.Query.betsByMarket(null, { market_id: 1 });
    expect(result).toHaveLength(1);
  });
});

// ── Query.marketStats ─────────────────────────────────────────────────────────

describe("Query.marketStats", () => {
  test("returns aggregated stats", async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [{ bet_count: "10", unique_bettors: "5", total_pool: "50000" }],
      })
      .mockResolvedValueOnce({
        rows: [
          { outcome_index: 0, total_stake: "30000", bet_count: "6" },
          { outcome_index: 1, total_stake: "20000", bet_count: "4" },
        ],
      });

    const result = await resolvers.Query.marketStats(null, { market_id: 1 });
    expect(result.market_id).toBe(1);
    expect(result.bet_count).toBe(10);
    expect(result.unique_bettors).toBe(5);
    expect(result.total_pool).toBe("50000");
    expect(result.outcome_stakes).toHaveLength(2);
    expect(result.outcome_stakes[0]).toEqual({
      outcome_index: 0,
      total_stake: "30000",
      bet_count: 6,
    });
  });
});

// ── Query.user ────────────────────────────────────────────────────────────────

describe("Query.user", () => {
  test("returns user when found", async () => {
    const user = makeUser();
    db.query.mockResolvedValueOnce({ rows: [user] });
    const result = await resolvers.Query.user(null, { wallet_address: "GABC123" });
    expect(result).toEqual(user);
  });

  test("returns null when not found", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const result = await resolvers.Query.user(null, { wallet_address: "GXXX" });
    expect(result).toBeNull();
  });
});

// ── Query.leaderboard ─────────────────────────────────────────────────────────

describe("Query.leaderboard", () => {
  const accuracyRow = {
    wallet_address: "GABC",
    total_bets: "10",
    wins: "7",
    accuracy_pct: "70.00",
  };
  const volumeRow = {
    wallet_address: "GABC",
    total_bets: "10",
    total_volume_xlm: "500.00",
  };
  const winningsRow = {
    wallet_address: "GABC",
    total_bets: "10",
    wins: "7",
    total_winnings_xlm: "350.00",
  };

  test("returns accuracy leaderboard by default", async () => {
    db.query.mockResolvedValueOnce({ rows: [accuracyRow] });
    const result = await resolvers.Query.leaderboard(null, {});
    expect(result[0].rank).toBe(1);
    expect(result[0].accuracy_pct).toBe("70.00");
    expect(db.query.mock.calls[0][0]).toContain("accuracy_pct");
  });

  test("returns volume leaderboard", async () => {
    db.query.mockResolvedValueOnce({ rows: [volumeRow] });
    const result = await resolvers.Query.leaderboard(null, { type: "volume" });
    expect(result[0].total_volume_xlm).toBe("500.00");
    expect(db.query.mock.calls[0][0]).toContain("total_volume_xlm");
  });

  test("returns winnings leaderboard", async () => {
    db.query.mockResolvedValueOnce({ rows: [winningsRow] });
    const result = await resolvers.Query.leaderboard(null, { type: "winnings" });
    expect(result[0].total_winnings_xlm).toBe("350.00");
    expect(db.query.mock.calls[0][0]).toContain("total_winnings_xlm");
  });

  test("falls back to accuracy for unknown type", async () => {
    db.query.mockResolvedValueOnce({ rows: [accuracyRow] });
    await resolvers.Query.leaderboard(null, { type: "unknown" });
    expect(db.query.mock.calls[0][0]).toContain("accuracy_pct");
  });

  test("applies offset to rank", async () => {
    db.query.mockResolvedValueOnce({ rows: [accuracyRow] });
    const result = await resolvers.Query.leaderboard(null, { offset: 10 });
    expect(result[0].rank).toBe(11);
  });

  test("returns empty array when no entries", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const result = await resolvers.Query.leaderboard(null, {});
    expect(result).toEqual([]);
  });
});

// ── Query.events ──────────────────────────────────────────────────────────────

describe("Query.events", () => {
  const eventRow = {
    id: 1,
    contract_id: "CXXX",
    topic: "BetPlaced",
    payload: { amount: 1000 },
    ledger_seq: 100,
    ledger_time: new Date().toISOString(),
    tx_hash: "abc123",
    event_index: 0,
    created_at: new Date().toISOString(),
  };

  test("returns events with payload serialized to string", async () => {
    db.query.mockResolvedValueOnce({ rows: [eventRow] });
    const result = await resolvers.Query.events(null, {});
    expect(typeof result[0].payload).toBe("string");
    expect(JSON.parse(result[0].payload)).toEqual({ amount: 1000 });
  });

  test("filters by contract_id", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await resolvers.Query.events(null, { contract_id: "CXXX" });
    expect(db.query.mock.calls[0][0]).toContain("contract_id = $1");
  });

  test("filters by topic", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await resolvers.Query.events(null, { topic: "BetPlaced" });
    expect(db.query.mock.calls[0][0]).toContain("topic = $1");
  });

  test("filters by both contract_id and topic", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await resolvers.Query.events(null, { contract_id: "CXXX", topic: "BetPlaced" });
    expect(db.query.mock.calls[0][0]).toContain("AND");
  });
});

// ── Query.categories ──────────────────────────────────────────────────────────

describe("Query.categories", () => {
  test("returns categories with market counts", async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        { name: "crypto", market_count: "5" },
        { name: "sports", market_count: "3" },
      ],
    });
    const result = await resolvers.Query.categories();
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: "crypto", market_count: 5 });
  });

  test("returns empty array when no categories", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const result = await resolvers.Query.categories();
    expect(result).toEqual([]);
  });
});

// ── Field resolvers ───────────────────────────────────────────────────────────

describe("Market field resolvers", () => {
  test("Market.bets uses betsByMarket DataLoader", async () => {
    const loaders = makeLoaders();
    loaders.betsByMarket.load.mockResolvedValueOnce([makeBet()]);
    const result = await resolvers.Market.bets(makeMarket(), null, { loaders });
    expect(loaders.betsByMarket.load).toHaveBeenCalledWith(1);
    expect(result).toHaveLength(1);
  });

  test("Market.bet_count uses betCount DataLoader", async () => {
    const loaders = makeLoaders();
    loaders.betCount.load.mockResolvedValueOnce(7);
    const result = await resolvers.Market.bet_count(makeMarket(), null, { loaders });
    expect(loaders.betCount.load).toHaveBeenCalledWith(1);
    expect(result).toBe(7);
  });
});

describe("Bet field resolvers", () => {
  test("Bet.market uses market DataLoader", async () => {
    const loaders = makeLoaders();
    const market = makeMarket();
    loaders.market.load.mockResolvedValueOnce(market);
    const result = await resolvers.Bet.market(makeBet(), null, { loaders });
    expect(loaders.market.load).toHaveBeenCalledWith(1);
    expect(result).toEqual(market);
  });
});

describe("User field resolvers", () => {
  test("User.bets uses betsByWallet DataLoader", async () => {
    const loaders = makeLoaders();
    loaders.betsByWallet.load.mockResolvedValueOnce([makeBet()]);
    const result = await resolvers.User.bets(makeUser(), null, { loaders });
    expect(loaders.betsByWallet.load).toHaveBeenCalledWith("GABC123");
    expect(result).toHaveLength(1);
  });
});

// ── Subscriptions ─────────────────────────────────────────────────────────────

describe("Subscriptions", () => {
  test("onBetPlaced.subscribe calls pubsub.subscribe with correct args", () => {
    const mockIter = {};
    pubsub.subscribe.mockReturnValueOnce(mockIter);
    const result = resolvers.Subscription.onBetPlaced.subscribe(null, { marketId: 5 });
    expect(pubsub.subscribe).toHaveBeenCalledWith("betPlaced", 5);
    expect(result).toBe(mockIter);
  });

  test("onBetPlaced.resolve returns payload as-is", () => {
    const payload = { market_id: 5, wallet_address: "G123", outcome_index: 0, amount: "1000" };
    expect(resolvers.Subscription.onBetPlaced.resolve(payload)).toBe(payload);
  });

  test("onMarketResolved.subscribe calls pubsub.subscribe with correct args", () => {
    const mockIter = {};
    pubsub.subscribe.mockReturnValueOnce(mockIter);
    const result = resolvers.Subscription.onMarketResolved.subscribe(null, { marketId: 10 });
    expect(pubsub.subscribe).toHaveBeenCalledWith("marketResolved", 10);
    expect(result).toBe(mockIter);
  });

  test("onMarketResolved.resolve returns payload as-is", () => {
    const payload = { market_id: 10, winning_outcome: 1, total_pool: "50000" };
    expect(resolvers.Subscription.onMarketResolved.resolve(payload)).toBe(payload);
  });

  test("onOddsChanged.subscribe calls pubsub.subscribe with correct args", () => {
    const mockIter = {};
    pubsub.subscribe.mockReturnValueOnce(mockIter);
    const result = resolvers.Subscription.onOddsChanged.subscribe(null, { marketId: 3 });
    expect(pubsub.subscribe).toHaveBeenCalledWith("oddsChanged", 3);
    expect(result).toBe(mockIter);
  });

  test("onOddsChanged.resolve returns payload as-is", () => {
    const payload = { market_id: 3, odds_bps: ["5000", "5000"] };
    expect(resolvers.Subscription.onOddsChanged.resolve(payload)).toBe(payload);
  });
});

// ── DataLoaders ───────────────────────────────────────────────────────────────

describe("DataLoaders", () => {
  const { createLoaders } = require("../graphql/dataLoaders");

  test("createLoaders returns all four loaders", () => {
    const loaders = createLoaders();
    expect(loaders).toHaveProperty("market");
    expect(loaders).toHaveProperty("betsByMarket");
    expect(loaders).toHaveProperty("betsByWallet");
    expect(loaders).toHaveProperty("betCount");
  });

  test("market loader batches and returns rows by id", async () => {
    db.query.mockResolvedValueOnce({
      rows: [makeMarket({ id: 1 }), makeMarket({ id: 2 })],
    });
    const loaders = createLoaders();
    const [m1, m2] = await Promise.all([loaders.market.load(1), loaders.market.load(2)]);
    expect(m1.id).toBe(1);
    expect(m2.id).toBe(2);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  test("market loader returns null for missing id", async () => {
    db.query.mockResolvedValueOnce({ rows: [makeMarket({ id: 1 })] });
    const loaders = createLoaders();
    const [m1, m99] = await Promise.all([loaders.market.load(1), loaders.market.load(99)]);
    expect(m1.id).toBe(1);
    expect(m99).toBeNull();
  });

  test("betsByMarket loader batches and groups by market_id", async () => {
    db.query.mockResolvedValueOnce({
      rows: [makeBet({ id: 1, market_id: 1 }), makeBet({ id: 2, market_id: 2 })],
    });
    const loaders = createLoaders();
    const [bets1, bets2] = await Promise.all([
      loaders.betsByMarket.load(1),
      loaders.betsByMarket.load(2),
    ]);
    expect(bets1).toHaveLength(1);
    expect(bets2).toHaveLength(1);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  test("betsByMarket loader returns empty array for market with no bets", async () => {
    db.query.mockResolvedValueOnce({ rows: [makeBet({ market_id: 1 })] });
    const loaders = createLoaders();
    const [bets1, bets99] = await Promise.all([
      loaders.betsByMarket.load(1),
      loaders.betsByMarket.load(99),
    ]);
    expect(bets1).toHaveLength(1);
    expect(bets99).toEqual([]);
  });

  test("betsByWallet loader batches and groups by wallet_address", async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        makeBet({ id: 1, wallet_address: "GABC" }),
        makeBet({ id: 2, wallet_address: "GXYZ" }),
      ],
    });
    const loaders = createLoaders();
    const [betsA, betsX] = await Promise.all([
      loaders.betsByWallet.load("GABC"),
      loaders.betsByWallet.load("GXYZ"),
    ]);
    expect(betsA).toHaveLength(1);
    expect(betsX).toHaveLength(1);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  test("betCount loader batches and returns counts by market_id", async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        { market_id: 1, count: "3" },
        { market_id: 2, count: "7" },
      ],
    });
    const loaders = createLoaders();
    const [c1, c2] = await Promise.all([
      loaders.betCount.load(1),
      loaders.betCount.load(2),
    ]);
    expect(c1).toBe(3);
    expect(c2).toBe(7);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  test("betCount loader returns 0 for market with no bets", async () => {
    db.query.mockResolvedValueOnce({ rows: [{ market_id: 1, count: "5" }] });
    const loaders = createLoaders();
    const [c1, c99] = await Promise.all([
      loaders.betCount.load(1),
      loaders.betCount.load(99),
    ]);
    expect(c1).toBe(5);
    expect(c99).toBe(0);
  });
});
