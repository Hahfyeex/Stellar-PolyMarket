"use strict";

/**
 * Unit tests for GET /api/markets pagination
 * Covers:
 * - Default pagination (limit=20, offset=0)
 * - Custom limit and offset parameters
 * - Boundary values (limit=1, limit=100)
 * - Invalid parameters returning 400
 * - hasMore calculation
 * - meta object structure
 */

jest.mock("../db");
jest.mock("../utils/redis");
jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));
jest.mock("firebase-admin", () => ({ apps: [true], initializeApp: jest.fn() }));
jest.mock("../middleware/appCheck", () => (req, res, next) => next());

const request = require("supertest");
const express = require("express");
const db = require("../db");
const redis = require("../utils/redis");
const marketsRouter = require("../routes/markets");

const app = express();
app.use(express.json());
app.use("/api/markets", marketsRouter);

// Helper to create mock market data
const makeMarket = (id) => ({
  id,
  question: `Will event ${id} happen?`,
  end_date: new Date().toISOString(),
  outcomes: ["Yes", "No"],
  status: "ACTIVE",
  resolved: false,
  created_at: new Date().toISOString(),
});

describe("GET /api/markets", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("pagination defaults", () => {
    it("uses default limit of 20 and offset of 0 when no params provided", async () => {
      const totalCount = 50;
      const markets = Array.from({ length: 20 }, (_, i) => makeMarket(i + 1));

      // First call for COUNT, second call for SELECT
      db.query
        .mockResolvedValueOnce({ rows: [{ total: String(totalCount) }] })
        .mockResolvedValueOnce({ rows: markets });

      const res = await request(app).get("/api/markets");

      expect(res.status).toBe(200);
      expect(res.body.markets).toHaveLength(20);
      expect(res.body.meta).toMatchObject({
        total: totalCount,
        limit: 20,
        offset: 0,
        hasMore: true, // 20 < 50
      });

      // Verify the queries
      expect(db.query).toHaveBeenNthCalledWith(1, "SELECT COUNT(*) as total FROM markets");
      expect(db.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("LIMIT $1 OFFSET $2"),
        [20, 0]
      );
    });
  });

  describe("custom pagination parameters", () => {
    it("accepts custom limit and offset", async () => {
      const totalCount = 100;
      const markets = Array.from({ length: 10 }, (_, i) => makeMarket(i + 1));

      db.query
        .mockResolvedValueOnce({ rows: [{ total: String(totalCount) }] })
        .mockResolvedValueOnce({ rows: markets });

      const res = await request(app).get("/api/markets?limit=10&offset=30");

      expect(res.status).toBe(200);
      expect(res.body.markets).toHaveLength(10);
      expect(res.body.meta).toMatchObject({
        total: totalCount,
        limit: 10,
        offset: 30,
        hasMore: true, // 30 + 10 < 100
      });

      expect(db.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("LIMIT $1 OFFSET $2"),
        [10, 30]
      );
    });

    it("returns empty array when offset exceeds total", async () => {
      const totalCount = 20;
      const markets = [];

      db.query
        .mockResolvedValueOnce({ rows: [{ total: String(totalCount) }] })
        .mockResolvedValueOnce({ rows: markets });

      const res = await request(app).get("/api/markets?offset=50");

      expect(res.status).toBe(200);
      expect(res.body.markets).toHaveLength(0);
      expect(res.body.meta).toMatchObject({
        total: totalCount,
        limit: 20,
        offset: 50,
        hasMore: false,
      });
    });
  });

  describe("boundary values", () => {
    it("accepts limit=1 (minimum)", async () => {
      const totalCount = 1;
      const markets = [makeMarket(1)];

      db.query
        .mockResolvedValueOnce({ rows: [{ total: String(totalCount) }] })
        .mockResolvedValueOnce({ rows: markets });

      const res = await request(app).get("/api/markets?limit=1");

      expect(res.status).toBe(200);
      expect(res.body.markets).toHaveLength(1);
      expect(res.body.meta.limit).toBe(1);
      expect(res.body.meta.hasMore).toBe(false);
    });

    it("accepts limit=100 (maximum)", async () => {
      const totalCount = 150;
      const markets = Array.from({ length: 100 }, (_, i) => makeMarket(i + 1));

      db.query
        .mockResolvedValueOnce({ rows: [{ total: String(totalCount) }] })
        .mockResolvedValueOnce({ rows: markets });

      const res = await request(app).get("/api/markets?limit=100");

      expect(res.status).toBe(200);
      expect(res.body.markets).toHaveLength(100);
      expect(res.body.meta.limit).toBe(100);
      expect(res.body.meta.hasMore).toBe(true); // 100 < 150
    });

    it("accepts offset=0 explicitly", async () => {
      const totalCount = 5;
      const markets = Array.from({ length: 5 }, (_, i) => makeMarket(i + 1));

      db.query
        .mockResolvedValueOnce({ rows: [{ total: String(totalCount) }] })
        .mockResolvedValueOnce({ rows: markets });

      const res = await request(app).get("/api/markets?offset=0");

      expect(res.status).toBe(200);
      expect(res.body.meta.offset).toBe(0);
    });
  });

  describe("invalid parameters", () => {
    it("returns 400 for non-integer limit", async () => {
      const res = await request(app).get("/api/markets?limit=abc");

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_LIMIT");
      expect(res.body.error.message).toContain("limit must be");
    });

    it("returns 400 for limit=0", async () => {
      const res = await request(app).get("/api/markets?limit=0");

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_LIMIT");
    });

    it("returns 400 for limit > 100", async () => {
      const res = await request(app).get("/api/markets?limit=101");

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_LIMIT");
    });

    it("returns 400 for negative limit", async () => {
      const res = await request(app).get("/api/markets?limit=-5");

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_LIMIT");
    });

    it("returns 400 for non-integer offset", async () => {
      const res = await request(app).get("/api/markets?offset=abc");

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_OFFSET");
      expect(res.body.error.message).toContain("offset must be");
    });

    it("returns 400 for negative offset", async () => {
      const res = await request(app).get("/api/markets?offset=-10");

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_OFFSET");
    });

    it("returns 400 for decimal limit", async () => {
      const res = await request(app).get("/api/markets?limit=10.5");

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_LIMIT");
    });
  });

  describe("hasMore calculation", () => {
    it("sets hasMore to true when more results exist", async () => {
      const totalCount = 50;
      const markets = Array.from({ length: 20 }, (_, i) => makeMarket(i + 1));

      db.query
        .mockResolvedValueOnce({ rows: [{ total: String(totalCount) }] })
        .mockResolvedValueOnce({ rows: markets });

      const res = await request(app).get("/api/markets?limit=20&offset=20");

      expect(res.body.meta.hasMore).toBe(true); // 20 + 20 < 50
    });

    it("sets hasMore to false when on last page", async () => {
      const totalCount = 25;
      const markets = Array.from({ length: 5 }, (_, i) => makeMarket(i + 1));

      db.query
        .mockResolvedValueOnce({ rows: [{ total: String(totalCount) }] })
        .mockResolvedValueOnce({ rows: markets });

      const res = await request(app).get("/api/markets?limit=20&offset=20");

      expect(res.body.meta.hasMore).toBe(false); // 20 + 5 = 25, no more
    });

    it("sets hasMore to false when exact match", async () => {
      const totalCount = 20;
      const markets = Array.from({ length: 20 }, (_, i) => makeMarket(i + 1));

      db.query
        .mockResolvedValueOnce({ rows: [{ total: String(totalCount) }] })
        .mockResolvedValueOnce({ rows: markets });

      const res = await request(app).get("/api/markets");

      expect(res.body.meta.hasMore).toBe(false); // 0 + 20 = 20
    });
  });

  describe("database errors", () => {
    it("returns 500 when COUNT query fails", async () => {
      db.query.mockRejectedValueOnce(new Error("Database connection failed"));

      const res = await request(app).get("/api/markets");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Database connection failed");
    });

    it("returns 500 when SELECT query fails", async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ total: "10" }] })
        .mockRejectedValueOnce(new Error("Query timeout"));

      const res = await request(app).get("/api/markets");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Query timeout");
    });
  });
});

describe("POST /api/markets — endDate validation", () => {
  const validBody = {
    question: "Will this test market resolve successfully by the end of the year?",
    outcomes: ["Yes", "No"],
    walletAddress: "GTEST123",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Redis mock for rate limiting: first call returns 1 (under limit)
    redis.incr = jest.fn().mockResolvedValue(1);
    redis.expire = jest.fn().mockResolvedValue(1);
    redis.ttl = jest.fn().mockResolvedValue(86400);
    // DB mock: no duplicate found, then INSERT returns a market row
    db.query
      .mockResolvedValueOnce({ rows: [] }) // duplicate check
      .mockResolvedValueOnce({
        rows: [{ id: 1, ...validBody, end_date: null, created_at: new Date().toISOString() }],
      });
  });

  it("rejects a past end date with 400", async () => {
    const pastDate = new Date(Date.now() - 1000).toISOString();
    const res = await request(app)
      .post("/api/markets")
      .send({ ...validBody, endDate: pastDate });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_END_DATE");
  });

  it("rejects an end date less than 1 hour in the future with 400", async () => {
    const underOneHour = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min
    const res = await request(app)
      .post("/api/markets")
      .send({ ...validBody, endDate: underOneHour });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_END_DATE");
  });

  it("rejects an end date more than 1 year in the future with 400", async () => {
    const overOneYear = new Date(Date.now() + 366 * 24 * 3600_000).toISOString();
    const res = await request(app)
      .post("/api/markets")
      .send({ ...validBody, endDate: overOneYear });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_END_DATE");
  });

  it("accepts a valid end date exactly 2 hours in the future", async () => {
    const validDate = new Date(Date.now() + 2 * 3600_000).toISOString();
    const res = await request(app)
      .post("/api/markets")
      .send({ ...validBody, endDate: validDate });

    expect(res.status).toBe(201);
    expect(res.body.market).toBeDefined();
  });
});
