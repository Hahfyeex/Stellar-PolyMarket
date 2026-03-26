jest.mock("../db");
jest.mock("../utils/redis");
jest.mock("../utils/logger", () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock("firebase-admin", () => ({ apps: [true], initializeApp: jest.fn() }));
jest.mock("../middleware/appCheck", () => (req, res, next) => next());

const request = require("supertest");
const express = require("express");
const db = require("../db");
const redis = require("../utils/redis");
const logger = require("../utils/logger");
const trendingRouter = require("../routes/trending");
const { sortByVolume, fetchTrendingMarkets, CACHE_TTL_SECONDS, TOP_N } = require("../routes/trending");

const app = express();
app.use(express.json());
app.use("/api/markets/trending", trendingRouter);

const makeMarket = (id, volume) => ({ market_id: id, question: `Market ${id}`, status: "ACTIVE", resolved: false, end_date: new Date().toISOString(), bet_count: 5, volume_24h: String(volume) });
const SAMPLE_ROWS = [makeMarket(3, 300), makeMarket(1, 1000), makeMarket(2, 500)];

describe("sortByVolume", () => {
  it("sorts descending by volume_24h", () => {
    expect(sortByVolume(SAMPLE_ROWS).map(r => r.market_id)).toEqual([1, 2, 3]);
  });
  it("does not mutate the original array", () => {
    const original = [...SAMPLE_ROWS];
    sortByVolume(SAMPLE_ROWS);
    expect(SAMPLE_ROWS).toEqual(original);
  });
  it("handles an empty array", () => { expect(sortByVolume([])).toEqual([]); });
  it("handles a single-element array", () => { const s = [makeMarket(1,100)]; expect(sortByVolume(s)).toEqual(s); });
  it("handles equal volumes without crashing", () => { expect(sortByVolume([makeMarket(1,100), makeMarket(2,100)])).toHaveLength(2); });
  it("handles numeric string volumes correctly", () => {
    const rows = [makeMarket(1,"50.5"), makeMarket(2,"200.75"), makeMarket(3,"0")];
    const sorted = sortByVolume(rows);
    expect(sorted[0].market_id).toBe(2);
    expect(sorted[2].market_id).toBe(3);
  });
  it("handles large arrays correctly", () => {
    const rows = Array.from({ length: 20 }, (_, i) => makeMarket(i+1, i*10));
    const sorted = sortByVolume(rows);
    expect(sorted[0].market_id).toBe(20);
    expect(sorted[19].market_id).toBe(1);
  });
});

describe("fetchTrendingMarkets", () => {
  it("calls db.query with LIMIT $1 and TOP_N", async () => {
    db.query.mockResolvedValueOnce({ rows: SAMPLE_ROWS });
    const rows = await fetchTrendingMarkets(db);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("LIMIT $1"), [TOP_N]);
    expect(rows).toEqual(SAMPLE_ROWS);
  });
  it("propagates db errors", async () => {
    db.query.mockRejectedValueOnce(new Error("DB down"));
    await expect(fetchTrendingMarkets(db)).rejects.toThrow("DB down");
  });
});

describe("exported constants", () => {
  it("TOP_N is 10", () => { expect(TOP_N).toBe(10); });
  it("CACHE_TTL_SECONDS is 300", () => { expect(CACHE_TTL_SECONDS).toBe(300); });
});

describe("GET /api/markets/trending", () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it("returns sorted markets and caches on cache miss", async () => {
    redis.get.mockResolvedValueOnce(null);
    db.query.mockResolvedValueOnce({ rows: SAMPLE_ROWS });
    redis.set.mockResolvedValueOnce("OK");
    const res = await request(app).get("/api/markets/trending");
    expect(res.status).toBe(200);
    expect(res.body.cached).toBe(false);
    expect(res.body.count).toBe(3);
    expect(res.body.markets[0].market_id).toBe(1);
    expect(res.body.markets[0].volume_24h).toBe("1000");
  });

  it("sets Redis cache with correct key and TTL", async () => {
    redis.get.mockResolvedValueOnce(null);
    db.query.mockResolvedValueOnce({ rows: SAMPLE_ROWS });
    redis.set.mockResolvedValueOnce("OK");
    await request(app).get("/api/markets/trending");
    expect(redis.set).toHaveBeenCalledWith("trending:markets:24h", expect.any(String), "EX", 300);
  });

  it("returns cached payload with cached: true on cache hit", async () => {
    const cached = { fetched_at: new Date().toISOString(), cached: false, count: 1, markets: [makeMarket(99, 9999)] };
    redis.get.mockResolvedValueOnce(JSON.stringify(cached));
    const res = await request(app).get("/api/markets/trending");
    expect(res.status).toBe(200);
    expect(res.body.cached).toBe(true);
    expect(res.body.markets[0].market_id).toBe(99);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("returns 500 and logs error when db throws", async () => {
    redis.get.mockResolvedValueOnce(null);
    db.query.mockRejectedValueOnce(new Error("Connection refused"));
    const res = await request(app).get("/api/markets/trending");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Connection refused");
    expect(logger.error).toHaveBeenCalled();
  });

  it("returns 500 when Redis.get throws", async () => {
    redis.get.mockRejectedValueOnce(new Error("Redis unavailable"));
    const res = await request(app).get("/api/markets/trending");
    expect(res.status).toBe(500);
  });

  it("returns empty markets array when no bets in last 24h", async () => {
    redis.get.mockResolvedValueOnce(null);
    db.query.mockResolvedValueOnce({ rows: [] });
    redis.set.mockResolvedValueOnce("OK");
    const res = await request(app).get("/api/markets/trending");
    expect(res.status).toBe(200);
    expect(res.body.markets).toEqual([]);
    expect(res.body.count).toBe(0);
  });

  it("includes a valid fetched_at timestamp", async () => {
    redis.get.mockResolvedValueOnce(null);
    db.query.mockResolvedValueOnce({ rows: SAMPLE_ROWS });
    redis.set.mockResolvedValueOnce("OK");
    const res = await request(app).get("/api/markets/trending");
    expect(new Date(res.body.fetched_at).toString()).not.toBe("Invalid Date");
  });
});
