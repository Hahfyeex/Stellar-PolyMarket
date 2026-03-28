"use strict";

/**
 * Unit tests for GET /api/markets pagination, search, filter, and sorting
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
jest.mock("firebase-admin", () => ({ apps: [true], initializeApp: jest.fn() }), { virtual: true });
jest.mock("../middleware/appCheck", () => (req, res, next) => next());

const request = require("supertest");
const express = require("express");
const db = require("../db");
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
      expect(db.query).toHaveBeenNthCalledWith(1, "SELECT COUNT(*) as total FROM markets", []);
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

    it("returns 400 for unsupported status", async () => {
      const res = await request(app).get("/api/markets?status=paused");

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_STATUS");
    });

    it("returns 400 for unsupported sort", async () => {
      const res = await request(app).get("/api/markets?sort=oldest");

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_SORT");
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

  describe("search and filters", () => {
    it("applies text search with parameterized ILIKE query", async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ total: "1" }] })
        .mockResolvedValueOnce({ rows: [makeMarket(1)] });

      const res = await request(app).get("/api/markets?q=bitcoin");

      expect(res.status).toBe(200);
      expect(db.query).toHaveBeenNthCalledWith(
        1,
        "SELECT COUNT(*) as total FROM markets WHERE question ILIKE '%' || $1 || '%'",
        ["bitcoin"]
      );
      expect(db.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("WHERE question ILIKE '%' || $1 || '%'"),
        ["bitcoin", 20, 0]
      );
    });

    it("applies category filter", async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ total: "2" }] })
        .mockResolvedValueOnce({ rows: [makeMarket(1), makeMarket(2)] });

      const res = await request(app).get("/api/markets?category=crypto");

      expect(res.status).toBe(200);
      expect(db.query).toHaveBeenNthCalledWith(
        1,
        "SELECT COUNT(*) as total FROM markets WHERE category = $1",
        ["crypto"]
      );
    });

    it("applies active status filter", async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ total: "1" }] })
        .mockResolvedValueOnce({ rows: [makeMarket(1)] });

      const res = await request(app).get("/api/markets?status=active");

      expect(res.status).toBe(200);
      expect(db.query).toHaveBeenNthCalledWith(
        1,
        "SELECT COUNT(*) as total FROM markets WHERE resolved = FALSE",
        []
      );
    });

    it("applies ending_soon status filter", async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ total: "1" }] })
        .mockResolvedValueOnce({ rows: [makeMarket(1)] });

      const res = await request(app).get("/api/markets?status=ending_soon");

      expect(res.status).toBe(200);
      expect(db.query.mock.calls[0][0]).toContain("resolved = FALSE");
      expect(db.query.mock.calls[0][0]).toContain("end_date >= NOW()");
      expect(db.query.mock.calls[0][0]).toContain("end_date <= NOW() + INTERVAL '24 hours'");
    });

    it("applies volume_desc sort", async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ total: "1" }] })
        .mockResolvedValueOnce({ rows: [makeMarket(1)] });

      const res = await request(app).get("/api/markets?sort=volume_desc");

      expect(res.status).toBe(200);
      expect(db.query.mock.calls[1][0]).toContain("ORDER BY total_pool DESC, created_at DESC");
    });

    it("applies end_date_asc sort", async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ total: "1" }] })
        .mockResolvedValueOnce({ rows: [makeMarket(1)] });

      const res = await request(app).get("/api/markets?sort=end_date_asc");

      expect(res.status).toBe(200);
      expect(db.query.mock.calls[1][0]).toContain("ORDER BY end_date ASC, created_at DESC");
    });

    it("combines search, category, status, and sort with parameterized placeholders", async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ total: "1" }] })
        .mockResolvedValueOnce({ rows: [makeMarket(1)] });

      const res = await request(app).get(
        "/api/markets?q=btc&category=crypto&status=resolved&sort=volume_desc&limit=10&offset=5"
      );

      expect(res.status).toBe(200);
      expect(db.query.mock.calls[0][0]).toBe(
        "SELECT COUNT(*) as total FROM markets WHERE question ILIKE '%' || $1 || '%' AND category = $2 AND resolved = TRUE"
      );
      expect(db.query.mock.calls[0][1]).toEqual(["btc", "crypto"]);
      expect(db.query.mock.calls[1][0]).toContain("ORDER BY total_pool DESC, created_at DESC");
      expect(db.query.mock.calls[1][1]).toEqual(["btc", "crypto", 10, 5]);
    });

    it("keeps SQL injection attempt inside parameters", async () => {
      const injection = "'; DROP TABLE markets; --";
      db.query
        .mockResolvedValueOnce({ rows: [{ total: "0" }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get(`/api/markets?q=${encodeURIComponent(injection)}`);

      expect(res.status).toBe(200);
      expect(db.query.mock.calls[0][0]).toBe(
        "SELECT COUNT(*) as total FROM markets WHERE question ILIKE '%' || $1 || '%'"
      );
      expect(db.query.mock.calls[0][1]).toEqual([injection]);
      expect(db.query.mock.calls[0][0]).not.toContain(injection);
    });
  });
});
