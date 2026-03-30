"use strict";

/**
 * Tests for the automated resolver worker and oracle modules.
 * All external dependencies (DB, HTTP, timers) are mocked.
 */

jest.mock("../db");
jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const db = require("../db");
const logger = require("../utils/logger");

// ── helpers ───────────────────────────────────────────────────────────────────

function makeMarket(overrides = {}) {
  return {
    id: 1,
    question: "Will BTC reach $100000?",
    category: "crypto",
    end_date: new Date(Date.now() - 1000).toISOString(),
    resolved: false,
    outcomes: ["Yes", "No"],
    ...overrides,
  };
}

// ── price oracle ──────────────────────────────────────────────────────────────

describe("price oracle", () => {
  const nock = require("nock");
  const { resolve, parseQuestion } = require("../oracles/price");

  afterEach(() => nock.cleanAll());

  test("parseQuestion extracts symbol and target price", () => {
    expect(parseQuestion("Will BTC reach $100000?")).toEqual({
      symbol: "BTC",
      targetPrice: 100000,
    });
    expect(parseQuestion("Will ETH exceed $5,000 this year?")).toEqual({
      symbol: "ETH",
      targetPrice: 5000,
    });
    expect(parseQuestion("No match here")).toBeNull();
  });

  test("returns 0 (Yes) when current price >= target", async () => {
    nock("https://api.coingecko.com")
      .get("/api/v3/simple/price")
      .query(true)
      .reply(200, { bitcoin: { usd: 105000 } });

    const result = await resolve(makeMarket({ question: "Will BTC reach $100000?" }));
    expect(result).toBe(0);
  });

  test("returns 1 (No) when current price < target", async () => {
    nock("https://api.coingecko.com")
      .get("/api/v3/simple/price")
      .query(true)
      .reply(200, { bitcoin: { usd: 80000 } });

    const result = await resolve(makeMarket({ question: "Will BTC reach $100000?" }));
    expect(result).toBe(1);
  });

  test("throws when price data is missing", async () => {
    nock("https://api.coingecko.com").get("/api/v3/simple/price").query(true).reply(200, {});

    await expect(resolve(makeMarket())).rejects.toThrow("No price data returned");
  });

  test("throws when question cannot be parsed", async () => {
    await expect(resolve(makeMarket({ question: "Will Arsenal win?" }))).rejects.toThrow(
      "Cannot parse price target"
    );
  });

  test("throws for unknown coin symbol", async () => {
    // XRP matches the regex but is not in COIN_MAP
    await expect(resolve(makeMarket({ question: "Will XRP reach $10?" }))).rejects.toThrow(
      "Unknown coin symbol"
    );
  });
});

// ── sports oracle ─────────────────────────────────────────────────────────────

describe("sports oracle", () => {
  const nock = require("nock");
  const { resolve, parseQuestion } = require("../oracles/sports");

  afterEach(() => nock.cleanAll());

  test("parseQuestion extracts team name", () => {
    expect(parseQuestion("Will Arsenal win the Premier League?")).toBe("Arsenal");
    expect(parseQuestion("No match")).toBeNull();
  });

  test("returns 0 (Yes) when team won", async () => {
    nock("https://v3.football.api-sports.io")
      .get("/teams")
      .query(true)
      .reply(200, { response: [{ team: { id: 42, name: "Arsenal" } }] });

    nock("https://v3.football.api-sports.io")
      .get("/fixtures")
      .query(true)
      .reply(200, {
        response: [
          {
            teams: { home: { id: 42 }, away: { id: 99 } },
            goals: { home: 2, away: 1 },
          },
        ],
      });

    const result = await resolve(
      makeMarket({ question: "Will Arsenal win the Premier League?", category: "sports" })
    );
    expect(result).toBe(0);
  });

  test("returns 1 (No) when team lost", async () => {
    nock("https://v3.football.api-sports.io")
      .get("/teams")
      .query(true)
      .reply(200, { response: [{ team: { id: 42, name: "Arsenal" } }] });

    nock("https://v3.football.api-sports.io")
      .get("/fixtures")
      .query(true)
      .reply(200, {
        response: [
          {
            teams: { home: { id: 42 }, away: { id: 99 } },
            goals: { home: 0, away: 2 },
          },
        ],
      });

    const result = await resolve(makeMarket({ question: "Will Arsenal win?", category: "sports" }));
    expect(result).toBe(1);
  });

  test("throws when team not found", async () => {
    nock("https://v3.football.api-sports.io")
      .get("/teams")
      .query(true)
      .reply(200, { response: [] });

    await expect(
      resolve(makeMarket({ question: "Will Arsenal win?", category: "sports" }))
    ).rejects.toThrow("Team not found");
  });

  test("throws when no finished fixtures", async () => {
    nock("https://v3.football.api-sports.io")
      .get("/teams")
      .query(true)
      .reply(200, { response: [{ team: { id: 42 } }] });

    nock("https://v3.football.api-sports.io")
      .get("/fixtures")
      .query(true)
      .reply(200, { response: [] });

    await expect(
      resolve(makeMarket({ question: "Will Arsenal win?", category: "sports" }))
    ).rejects.toThrow("No finished fixtures");
  });

  test("throws when question cannot be parsed", async () => {
    await expect(
      resolve(makeMarket({ question: "Will BTC hit $100k?", category: "sports" }))
    ).rejects.toThrow("Cannot parse team name");
  });
});

// ── oracle registry ───────────────────────────────────────────────────────────

describe("oracle registry", () => {
  const { resolveMarket, REGISTRY } = require("../oracles");

  test("routes crypto category to price oracle", () => {
    expect(REGISTRY["crypto"]).toBeDefined();
  });

  test("routes sports category to sports oracle", () => {
    expect(REGISTRY["sports"]).toBeDefined();
  });

  test("throws for unknown category", async () => {
    await expect(resolveMarket(makeMarket({ category: "unknown" }))).rejects.toThrow(
      "No oracle registered for category: unknown"
    );
  });
});

// ── resolver worker ───────────────────────────────────────────────────────────

describe("resolver worker", () => {
  let resolver;
  let oracles;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    // Re-mock db after resetModules
    jest.mock("../db");
    jest.mock("../utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

    // Mock oracles so resolveWithRetry uses our spy
    jest.mock("../oracles");
    oracles = require("../oracles");

    // Patch delay to be instant
    jest.mock("../workers/resolver", () => {
      const actual = jest.requireActual("../workers/resolver");
      return { ...actual, delay: jest.fn().mockResolvedValue(undefined) };
    });

    resolver = require("../workers/resolver");
  });

  // ── resolveWithRetry ────────────────────────────────────────────────────────

  test("resolveWithRetry returns result on first attempt", async () => {
    oracles.resolveMarket.mockResolvedValueOnce(0);
    const result = await resolver.resolveWithRetry(makeMarket());
    expect(result).toBe(0);
    expect(oracles.resolveMarket).toHaveBeenCalledTimes(1);
  });

  test("resolveWithRetry retries on failure and succeeds on 2nd attempt", async () => {
    oracles.resolveMarket.mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(1);

    const result = await resolver.resolveWithRetry(makeMarket());
    expect(result).toBe(1);
    expect(oracles.resolveMarket).toHaveBeenCalledTimes(2);
  });

  test("resolveWithRetry throws after 3 failures", async () => {
    oracles.resolveMarket.mockRejectedValue(new Error("api down"));
    await expect(resolver.resolveWithRetry(makeMarket())).rejects.toThrow("api down");
    expect(oracles.resolveMarket).toHaveBeenCalledTimes(3);
  });

  // ── deadLetter ──────────────────────────────────────────────────────────────

  test("deadLetter inserts into dead_letter_queue", async () => {
    const db = require("../db");
    db.query.mockResolvedValueOnce({ rows: [] });
    await resolver.deadLetter(makeMarket(), new Error("oracle failed"));
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO dead_letter_queue"),
      expect.arrayContaining([1, "crypto", "oracle failed", 3])
    );
  });

  // ── checkExpiredMarkets ─────────────────────────────────────────────────────

  test("checkExpiredMarkets resolves expired markets", async () => {
    const db = require("../db");
    const market = makeMarket();
    db.query.mockResolvedValueOnce({ rows: [market] }).mockResolvedValueOnce({ rows: [] });

    oracles.resolveMarket.mockResolvedValueOnce(0);

    await resolver.checkExpiredMarkets();

    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE markets"), [0, 1]);
  });

  test("checkExpiredMarkets dead-letters after all retries fail", async () => {
    const db = require("../db");
    const market = makeMarket();
    db.query.mockResolvedValueOnce({ rows: [market] }).mockResolvedValueOnce({ rows: [] });

    oracles.resolveMarket.mockRejectedValue(new Error("fail"));

    await resolver.checkExpiredMarkets();

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO dead_letter_queue"),
      expect.any(Array)
    );
  });

  test("checkExpiredMarkets handles DB query error gracefully", async () => {
    const db = require("../db");
    const log = require("../utils/logger");
    db.query.mockRejectedValueOnce(new Error("connection refused"));
    await expect(resolver.checkExpiredMarkets()).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalled();
  });

  test("checkExpiredMarkets does nothing when no expired markets", async () => {
    const db = require("../db");
    db.query.mockResolvedValueOnce({ rows: [] });
    await resolver.checkExpiredMarkets();
    expect(oracles.resolveMarket).not.toHaveBeenCalled();
  });
});

// ── high-value threshold ──────────────────────────────────────────────────────

describe("high-value threshold resolution", () => {
  let resolver;
  let oracles;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    jest.mock("../db");
    jest.mock("../utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
    jest.mock("../utils/notifications", () => ({ triggerNotification: jest.fn() }));
    jest.mock("../oracles");

    oracles = require("../oracles");

    jest.mock("../workers/resolver", () => {
      const actual = jest.requireActual("../workers/resolver");
      return { ...actual, delay: jest.fn().mockResolvedValue(undefined) };
    });

    resolver = require("../workers/resolver");
  });

  test("HIGH_VALUE_THRESHOLD is exported and defaults to 100000000000", () => {
    expect(resolver.HIGH_VALUE_THRESHOLD).toBe(BigInt("100000000000"));
  });

  test("below threshold resolves immediately", async () => {
    const db = require("../db");
    const market = makeMarket({ total_pool: "100" }); // 100 XLM = 1_000_000_000 stroops, well below threshold
    db.query
      .mockResolvedValueOnce({ rows: [market] }) // SELECT expired markets
      .mockResolvedValueOnce({ rows: [] }); // UPDATE markets

    oracles.resolveMarket.mockResolvedValueOnce(0);

    await resolver.checkExpiredMarkets();

    const updateCall = db.query.mock.calls.find((c) => c[0].includes("RESOLVED"));
    expect(updateCall).toBeDefined();
    expect(updateCall[1]).toEqual([0, 1]);
  });

  test("above threshold sets PENDING_CONFIRMATION", async () => {
    const db = require("../db");
    const market = makeMarket({ total_pool: "20000" }); // 20000 XLM = 200_000_000_000 stroops, above threshold
    db.query
      .mockResolvedValueOnce({ rows: [market] }) // SELECT expired markets
      .mockResolvedValueOnce({ rows: [] }); // UPDATE markets (PENDING_CONFIRMATION)

    oracles.resolveMarket.mockResolvedValueOnce(1);

    await resolver.checkExpiredMarkets();

    const updateCall = db.query.mock.calls.find((c) => c[0].includes("PENDING_CONFIRMATION"));
    expect(updateCall).toBeDefined();
    expect(updateCall[1]).toEqual([1, 1]);
  });

  test("high-value market triggers admin alert notification", async () => {
    const db = require("../db");
    const notifications = require("../utils/notifications");
    const market = makeMarket({ total_pool: "20000", question: "Will BTC reach $100k?" });
    db.query.mockResolvedValueOnce({ rows: [market] }).mockResolvedValueOnce({ rows: [] });

    oracles.resolveMarket.mockResolvedValueOnce(0);

    await resolver.checkExpiredMarkets();

    expect(notifications.triggerNotification).toHaveBeenCalledWith(
      null,
      "HIGH_VALUE_RESOLUTION",
      expect.stringContaining("requires admin confirmation"),
      1
    );
  });

  test("below threshold does NOT trigger admin alert", async () => {
    const db = require("../db");
    const notifications = require("../utils/notifications");
    const market = makeMarket({ total_pool: "100" });
    db.query.mockResolvedValueOnce({ rows: [market] }).mockResolvedValueOnce({ rows: [] });

    oracles.resolveMarket.mockResolvedValueOnce(0);

    await resolver.checkExpiredMarkets();

    expect(notifications.triggerNotification).not.toHaveBeenCalled();
  });

  test("exact threshold value triggers PENDING_CONFIRMATION", async () => {
    const db = require("../db");
    // 10000 XLM = 100_000_000_000 stroops = exactly the threshold
    const market = makeMarket({ total_pool: "10000" });
    db.query.mockResolvedValueOnce({ rows: [market] }).mockResolvedValueOnce({ rows: [] });

    oracles.resolveMarket.mockResolvedValueOnce(0);

    await resolver.checkExpiredMarkets();

    const updateCall = db.query.mock.calls.find((c) => c[0].includes("PENDING_CONFIRMATION"));
    expect(updateCall).toBeDefined();
  });
});

// ── admin route ───────────────────────────────────────────────────────────────

describe("POST /api/admin/markets/:id/resolve", () => {
  const request = require("supertest");
  const express = require("express");
  const jwt = require("jsonwebtoken");

  const JWT_SECRET = "test-secret";
  process.env.JWT_SECRET = JWT_SECRET;

  const adminRouter = require("../routes/admin");
  const app = express();
  app.use(express.json());
  app.use("/api/admin", adminRouter);

  const token = jwt.sign({ sub: "admin" }, JWT_SECRET);

  beforeEach(() => jest.clearAllMocks());

  test("returns 401 without token", async () => {
    const res = await request(app)
      .post("/api/admin/markets/1/resolve")
      .send({ winning_outcome: 0 });
    expect(res.status).toBe(401);
  });

  test("returns 400 for missing winning_outcome", async () => {
    const res = await request(app)
      .post("/api/admin/markets/1/resolve")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test("returns 404 when market not found", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post("/api/admin/markets/99/resolve")
      .set("Authorization", `Bearer ${token}`)
      .send({ winning_outcome: 0 });
    expect(res.status).toBe(404);
  });

  test("returns 409 when market already resolved", async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ ...makeMarket(), resolved: true, outcomes: ["Yes", "No"] }],
    });
    const res = await request(app)
      .post("/api/admin/markets/1/resolve")
      .set("Authorization", `Bearer ${token}`)
      .send({ winning_outcome: 0 });
    expect(res.status).toBe(409);
  });

  test("returns 400 for out-of-range outcome index", async () => {
    db.query.mockResolvedValueOnce({ rows: [{ ...makeMarket(), outcomes: ["Yes", "No"] }] });
    const res = await request(app)
      .post("/api/admin/markets/1/resolve")
      .set("Authorization", `Bearer ${token}`)
      .send({ winning_outcome: 5 });
    expect(res.status).toBe(400);
  });

  test("resolves market and returns 200", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ ...makeMarket(), outcomes: ["Yes", "No"] }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/api/admin/markets/1/resolve")
      .set("Authorization", `Bearer ${token}`)
      .send({ winning_outcome: 1 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, winning_outcome: 1 });
  });

  test("GET /api/admin/dead-letter returns queue items", async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, market_id: 5, error: "timeout" }] });
    const res = await request(app)
      .get("/api/admin/dead-letter")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });
});
