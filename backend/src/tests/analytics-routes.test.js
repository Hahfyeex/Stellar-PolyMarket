const request = require("supertest");
const express = require("express");

// ── Mocks ────────────────────────────────────────────────────────────────────
jest.mock("../db");
jest.mock("../utils/redis");
jest.mock("../middleware/jwtAuth", () => (req, _res, next) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return _res.status(401).json({ error: "Missing or invalid Authorization header" });
  }
  req.admin = { sub: "test-admin" };
  next();
});

const db = require("../db");
const redis = require("../utils/redis");
const analyticsRouter = require("../routes/analytics");
const {
  buildVolumeQuery,
  VALID_PERIODS,
  VALID_GRANULARITIES,
  CACHE_TTL,
} = require("../routes/analytics");

// ── App setup ────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use("/api/analytics", analyticsRouter);

const AUTH = { Authorization: "Bearer valid-token" };

beforeEach(() => {
  jest.clearAllMocks();
  redis.get = jest.fn().mockResolvedValue(null);
  redis.set = jest.fn().mockResolvedValue("OK");
});

// ── buildVolumeQuery unit tests ───────────────────────────────────────────────
describe("buildVolumeQuery", () => {
  test.each(VALID_PERIODS)("generates valid SQL for period=%s", (period) => {
    const sql = buildVolumeQuery(period, "day");
    expect(sql).toContain("DATE_TRUNC('day', created_at)");
    expect(sql).toContain("SUM(amount)");
    expect(sql).toContain("COUNT(*)");
    expect(sql).toContain("GROUP BY period");
    expect(sql).toContain("ORDER BY period ASC");
  });

  test.each(VALID_GRANULARITIES)("generates valid SQL for granularity=%s", (granularity) => {
    const sql = buildVolumeQuery("7d", granularity);
    expect(sql).toContain(`DATE_TRUNC('${granularity}', created_at)`);
  });

  test("includes WHERE clause for bounded periods", () => {
    expect(buildVolumeQuery("1d", "hour")).toContain("WHERE created_at >= NOW() - INTERVAL '1 day'");
    expect(buildVolumeQuery("7d", "day")).toContain("WHERE created_at >= NOW() - INTERVAL '7 days'");
    expect(buildVolumeQuery("30d", "week")).toContain("WHERE created_at >= NOW() - INTERVAL '30 days'");
  });

  test("omits WHERE clause for period=all", () => {
    const sql = buildVolumeQuery("all", "day");
    expect(sql).not.toContain("WHERE");
  });
});

// ── Constants ─────────────────────────────────────────────────────────────────
describe("module constants", () => {
  test("VALID_PERIODS contains all required values", () => {
    expect(VALID_PERIODS).toEqual(expect.arrayContaining(["1d", "7d", "30d", "all"]));
  });

  test("VALID_GRANULARITIES contains all required values", () => {
    expect(VALID_GRANULARITIES).toEqual(expect.arrayContaining(["hour", "day", "week"]));
  });

  test("CACHE_TTL is 300 seconds", () => {
    expect(CACHE_TTL).toBe(300);
  });
});

// ── GET /api/analytics/volume ─────────────────────────────────────────────────
describe("GET /api/analytics/volume", () => {
  const mockRows = [
    { period: "2024-01-01T00:00:00.000Z", volume: "500", bet_count: 5 },
    { period: "2024-01-02T00:00:00.000Z", volume: "800", bet_count: 8 },
  ];

  test("returns 401 without auth token", async () => {
    const res = await request(app).get("/api/analytics/volume");
    expect(res.status).toBe(401);
  });

  test("returns aggregated volume data with defaults", async () => {
    db.query = jest.fn().mockResolvedValue({ rows: mockRows });

    const res = await request(app).get("/api/analytics/volume").set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.period).toBe("7d");
    expect(res.body.granularity).toBe("day");
    expect(res.body.data).toEqual(mockRows);
    expect(res.body.cached).toBe(false);
  });

  test.each([
    ["1d", "hour"],
    ["7d", "day"],
    ["30d", "week"],
    ["all", "day"],
  ])("accepts period=%s granularity=%s", async (period, granularity) => {
    db.query = jest.fn().mockResolvedValue({ rows: [] });

    const res = await request(app)
      .get(`/api/analytics/volume?period=${period}&granularity=${granularity}`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.period).toBe(period);
    expect(res.body.granularity).toBe(granularity);
  });

  test("returns 400 for invalid period", async () => {
    const res = await request(app)
      .get("/api/analytics/volume?period=invalid")
      .set(AUTH);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/period/);
  });

  test("returns 400 for invalid granularity", async () => {
    const res = await request(app)
      .get("/api/analytics/volume?granularity=minute")
      .set(AUTH);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/granularity/);
  });

  test("serves from Redis cache when available", async () => {
    const cached = { period: "7d", granularity: "day", data: mockRows, cached: false };
    redis.get = jest.fn().mockResolvedValue(JSON.stringify(cached));

    const res = await request(app).get("/api/analytics/volume").set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.cached).toBe(true);
    expect(db.query).not.toHaveBeenCalled();
  });

  test("caches response in Redis with correct TTL", async () => {
    db.query = jest.fn().mockResolvedValue({ rows: mockRows });

    await request(app).get("/api/analytics/volume?period=1d&granularity=hour").set(AUTH);

    expect(redis.set).toHaveBeenCalledWith(
      "analytics:volume:1d:hour",
      expect.any(String),
      "EX",
      300
    );
  });

  test("uses distinct cache keys per period+granularity combination", async () => {
    db.query = jest.fn().mockResolvedValue({ rows: [] });

    await request(app).get("/api/analytics/volume?period=1d&granularity=hour").set(AUTH);
    await request(app).get("/api/analytics/volume?period=30d&granularity=week").set(AUTH);

    const keys = redis.set.mock.calls.map((c) => c[0]);
    expect(keys).toContain("analytics:volume:1d:hour");
    expect(keys).toContain("analytics:volume:30d:week");
  });

  test("returns 500 on db error", async () => {
    db.query = jest.fn().mockRejectedValue(new Error("db down"));

    const res = await request(app).get("/api/analytics/volume").set(AUTH);
    expect(res.status).toBe(500);
  });
});

// ── GET /api/analytics/top-markets ───────────────────────────────────────────
describe("GET /api/analytics/top-markets", () => {
  const mockMarkets = Array.from({ length: 10 }, (_, i) => ({
    id: i + 1,
    question: `Market ${i + 1}`,
    status: "ACTIVE",
    total_pool: (10 - i) * 1000,
    resolved: false,
    end_date: "2025-01-01T00:00:00.000Z",
  }));

  test("returns 401 without auth token", async () => {
    const res = await request(app).get("/api/analytics/top-markets");
    expect(res.status).toBe(401);
  });

  test("returns top 10 markets by total_pool", async () => {
    db.query = jest.fn().mockResolvedValue({ rows: mockMarkets });

    const res = await request(app).get("/api/analytics/top-markets").set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.markets).toHaveLength(10);
    expect(res.body.limit).toBe(10);
    expect(res.body.cached).toBe(false);
  });

  test("respects custom limit param", async () => {
    db.query = jest.fn().mockResolvedValue({ rows: mockMarkets.slice(0, 5) });

    const res = await request(app).get("/api/analytics/top-markets?limit=5").set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(5);
    const [, params] = db.query.mock.calls[0];
    expect(params[0]).toBe(5);
  });

  test("caps limit at 100", async () => {
    db.query = jest.fn().mockResolvedValue({ rows: [] });

    await request(app).get("/api/analytics/top-markets?limit=999").set(AUTH);

    const [, params] = db.query.mock.calls[0];
    expect(params[0]).toBe(100);
  });

  test("serves from Redis cache when available", async () => {
    const cached = { limit: 10, markets: mockMarkets, cached: false };
    redis.get = jest.fn().mockResolvedValue(JSON.stringify(cached));

    const res = await request(app).get("/api/analytics/top-markets").set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.cached).toBe(true);
    expect(db.query).not.toHaveBeenCalled();
  });

  test("caches response in Redis with correct TTL", async () => {
    db.query = jest.fn().mockResolvedValue({ rows: mockMarkets });

    await request(app).get("/api/analytics/top-markets").set(AUTH);

    expect(redis.set).toHaveBeenCalledWith(
      "analytics:top-markets:10",
      expect.any(String),
      "EX",
      300
    );
  });

  test("returns 500 on db error", async () => {
    db.query = jest.fn().mockRejectedValue(new Error("db down"));

    const res = await request(app).get("/api/analytics/top-markets").set(AUTH);
    expect(res.status).toBe(500);
  });
});
