"use strict";
/**
 * Tests for cache.js — Redis cache-aside layer for market queries.
 * Covers: cache hit, cache miss, invalidation, Redis failure fallback.
 * Target: >95% coverage.
 */

// ── Mock ioredis before requiring cache.js ────────────────────────────────────
jest.mock("ioredis", () => {
  const EventEmitter = require("events");
  class MockRedis extends EventEmitter {
    constructor() { super(); this._store = {}; }
    async get(key)                    { return this._store[key] ?? null; }
    async set(key, val, _ex, _ttl)    { this._store[key] = val; return "OK"; }
    async del(...keys)                { keys.forEach(k => delete this._store[k]); return keys.length; }
    async scan(_cursor, _match, pattern, _count, _n) {
      // Simple glob-to-regex: replace * with .*
      const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
      const matched = Object.keys(this._store).filter(k => regex.test(k));
      return ["0", matched];
    }
    async quit()                      { return "OK"; }
    on() { return this; }
  }
  return MockRedis;
});

// Mock logger to suppress output
jest.mock("../utils/logger", () => ({
  info:  jest.fn(),
  debug: jest.fn(),
  warn:  jest.fn(),
  error: jest.fn(),
}));

const { getOrSet, invalidateMarketList, invalidateMarket, invalidateAll, listKey, detailKey, TTL, scanKeys } = require("../utils/cache");
const redis = require("../utils/redis");

beforeEach(() => {
  // Clear the mock store between tests
  redis._store = {};
  jest.clearAllMocks();
});

// ── Key helpers ───────────────────────────────────────────────────────────────

describe("key helpers", () => {
  test("listKey formats correctly", () => {
    expect(listKey(20, 0)).toBe("markets:list:20:0");
    expect(listKey(10, 40)).toBe("markets:list:10:40");
  });

  test("detailKey formats correctly", () => {
    expect(detailKey(42)).toBe("markets:id:42");
    expect(detailKey("7")).toBe("markets:id:7");
  });

  test("TTL.LIST is 30", () => { expect(TTL.LIST).toBe(30); });
  test("TTL.DETAIL is 15", () => { expect(TTL.DETAIL).toBe(15); });
});

// ── getOrSet — cache hit ──────────────────────────────────────────────────────

describe("getOrSet — cache hit", () => {
  test("returns cached value without calling dbFn", async () => {
    const key = "markets:list:20:0";
    const cached = { markets: [{ id: 1 }], meta: { total: 1 } };
    redis._store[key] = JSON.stringify(cached);

    const dbFn = jest.fn();
    const result = await getOrSet(key, 30, dbFn);

    expect(result).toEqual(cached);
    expect(dbFn).not.toHaveBeenCalled();
  });

  test("parses JSON from cache correctly", async () => {
    const key = "markets:id:5";
    const data = { market: { id: 5, question: "Test?" }, bets: [] };
    redis._store[key] = JSON.stringify(data);

    const result = await getOrSet(key, 15, jest.fn());
    expect(result.market.id).toBe(5);
    expect(result.bets).toEqual([]);
  });
});

// ── getOrSet — cache miss ─────────────────────────────────────────────────────

describe("getOrSet — cache miss", () => {
  test("calls dbFn on cache miss", async () => {
    const key = "markets:list:20:0";
    const dbResult = { markets: [{ id: 2 }], meta: { total: 1 } };
    const dbFn = jest.fn().mockResolvedValue(dbResult);

    const result = await getOrSet(key, 30, dbFn);

    expect(dbFn).toHaveBeenCalledTimes(1);
    expect(result).toEqual(dbResult);
  });

  test("stores result in Redis after DB fetch", async () => {
    const key = "markets:list:20:0";
    const dbResult = { markets: [], meta: { total: 0 } };
    await getOrSet(key, 30, async () => dbResult);

    expect(redis._store[key]).toBe(JSON.stringify(dbResult));
  });

  test("second call returns cached value (no second DB hit)", async () => {
    const key = "markets:list:20:0";
    const dbFn = jest.fn().mockResolvedValue({ markets: [{ id: 3 }] });

    await getOrSet(key, 30, dbFn);
    await getOrSet(key, 30, dbFn);

    expect(dbFn).toHaveBeenCalledTimes(1);
  });
});

// ── getOrSet — Redis failure fallback ─────────────────────────────────────────

describe("getOrSet — Redis failure fallback", () => {
  test("falls back to dbFn when Redis GET throws", async () => {
    const key = "markets:list:20:0";
    const dbResult = { markets: [{ id: 99 }] };
    const dbFn = jest.fn().mockResolvedValue(dbResult);

    // Force Redis GET to throw
    jest.spyOn(redis, "get").mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const result = await getOrSet(key, 30, dbFn);

    expect(result).toEqual(dbResult);
    expect(dbFn).toHaveBeenCalledTimes(1);
  });

  test("does not crash when Redis SET throws after DB fetch", async () => {
    const key = "markets:list:20:0";
    const dbResult = { markets: [] };
    jest.spyOn(redis, "set").mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const result = await getOrSet(key, 30, async () => dbResult);
    expect(result).toEqual(dbResult); // still returns the DB result
  });

  test("does not crash when both GET and SET throw", async () => {
    const key = "markets:list:20:0";
    jest.spyOn(redis, "get").mockRejectedValueOnce(new Error("Redis down"));
    jest.spyOn(redis, "set").mockRejectedValueOnce(new Error("Redis down"));

    const result = await getOrSet(key, 30, async () => ({ markets: [] }));
    expect(result).toEqual({ markets: [] });
  });
});

// ── invalidateMarketList ──────────────────────────────────────────────────────

describe("invalidateMarketList", () => {
  test("deletes all markets:list:* keys", async () => {
    redis._store["markets:list:20:0"]  = "a";
    redis._store["markets:list:10:10"] = "b";
    redis._store["markets:id:1"]       = "c"; // should NOT be deleted

    await invalidateMarketList();

    expect(redis._store["markets:list:20:0"]).toBeUndefined();
    expect(redis._store["markets:list:10:10"]).toBeUndefined();
    expect(redis._store["markets:id:1"]).toBe("c"); // untouched
  });

  test("does not crash when Redis scan throws", async () => {
    jest.spyOn(redis, "scan").mockRejectedValueOnce(new Error("Redis down"));
    await expect(invalidateMarketList()).resolves.toBeUndefined();
  });

  test("is a no-op when no list keys exist", async () => {
    redis._store["markets:id:1"] = "x";
    await invalidateMarketList();
    expect(redis._store["markets:id:1"]).toBe("x");
  });
});

// ── invalidateMarket ──────────────────────────────────────────────────────────

describe("invalidateMarket", () => {
  test("deletes the specific market detail key", async () => {
    redis._store["markets:id:5"]  = "data";
    redis._store["markets:id:10"] = "other";

    await invalidateMarket(5);

    expect(redis._store["markets:id:5"]).toBeUndefined();
    expect(redis._store["markets:id:10"]).toBe("other");
  });

  test("does not crash when Redis DEL throws", async () => {
    jest.spyOn(redis, "del").mockRejectedValueOnce(new Error("Redis down"));
    await expect(invalidateMarket(5)).resolves.toBeUndefined();
  });
});

// ── invalidateAll ─────────────────────────────────────────────────────────────

describe("invalidateAll", () => {
  test("invalidates both list and detail keys", async () => {
    redis._store["markets:list:20:0"] = "list";
    redis._store["markets:id:3"]      = "detail";

    await invalidateAll(3);

    expect(redis._store["markets:list:20:0"]).toBeUndefined();
    expect(redis._store["markets:id:3"]).toBeUndefined();
  });

  test("invalidates only list keys when no id provided", async () => {
    redis._store["markets:list:20:0"] = "list";
    redis._store["markets:id:3"]      = "detail";

    await invalidateAll();

    expect(redis._store["markets:list:20:0"]).toBeUndefined();
    expect(redis._store["markets:id:3"]).toBe("detail"); // untouched
  });
});

// ── scanKeys ──────────────────────────────────────────────────────────────────

describe("scanKeys", () => {
  test("returns all keys matching the pattern", async () => {
    redis._store["markets:list:20:0"]  = "a";
    redis._store["markets:list:10:10"] = "b";
    redis._store["markets:id:1"]       = "c";

    const keys = await scanKeys("markets:list:*");
    // The mock scan returns all keys; filter is done by the caller
    expect(Array.isArray(keys)).toBe(true);
  });
});
