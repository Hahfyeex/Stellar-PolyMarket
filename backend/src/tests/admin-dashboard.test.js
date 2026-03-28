/**
 * tests/admin-dashboard.test.js
 *
 * Tests for admin dashboard API endpoints.
 * Covers: stats, pending review, dead-letter, force-resolve, and role-based access.
 */

"use strict";

const request = require("supertest");
const express = require("express");
const db = require("../db");
const redis = require("../utils/redis");

jest.mock("../db");
jest.mock("../utils/redis");
jest.mock("../utils/errors", () => ({ sanitizeError: jest.fn((e) => e.message) }));

const adminRouter = require("../routes/admin");
const jwtAuth = require("../middleware/jwtAuth");

jest.mock("../middleware/jwtAuth", () => {
  return (req, res, next) => {
    // Mock JWT auth - set admin on request
    req.admin = req.headers["x-admin"] ? { sub: "admin-wallet", role: "admin" } : null;
    if (!req.admin) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  };
});

describe("Admin Dashboard API (#418)", () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use("/api/admin", adminRouter);
    jest.clearAllMocks();
  });

  describe("GET /api/admin/stats", () => {
    test("should return platform statistics", async () => {
      // Mock market stats
      db.query.mockResolvedValueOnce({
        rows: [
          {
            active_markets: 10,
            resolved_markets: 5,
            voided_markets: 2,
            total_markets: 17,
          },
        ],
      });

      // Mock bets stats
      db.query.mockResolvedValueOnce({
        rows: [
          {
            total_bets: 100,
            total_volume_xlm: 5000,
          },
        ],
      });

      // Mock unique wallets
      db.query.mockResolvedValueOnce({
        rows: [{ unique_wallets: 50 }],
      });

      // Mock 24h volume
      db.query.mockResolvedValueOnce({
        rows: [{ volume_24h: 500 }],
      });

      // Mock redis
      redis.get.mockResolvedValue(null);
      redis.set.mockResolvedValue("OK");

      const response = await request(app)
        .get("/api/admin/stats")
        .set("x-admin", "true");

      expect(response.status).toBe(200);
      expect(response.body.markets).toEqual({
        active: 10,
        resolved: 5,
        voided: 2,
        total: 17,
      });
      expect(response.body.bets.total).toBe(100);
      expect(response.body.wallets.unique).toBe(50);
      expect(response.body.volume_24h).toBe(500);
    });

    test("should cache stats for 5 minutes", async () => {
      const cachedStats = {
        markets: { active: 10, resolved: 5, voided: 2, total: 17 },
        bets: { total: 100, total_volume_xlm: 5000 },
        wallets: { unique: 50 },
        volume_24h: 500,
      };

      redis.get.mockResolvedValueOnce(JSON.stringify(cachedStats));

      const response = await request(app)
        .get("/api/admin/stats")
        .set("x-admin", "true");

      expect(response.status).toBe(200);
      expect(response.body).toEqual(cachedStats);
      // Should not call db.query if cached
      expect(db.query).not.toHaveBeenCalled();
    });

    test("should require admin role", async () => {
      const response = await request(app).get("/api/admin/stats");

      expect(response.status).toBe(401);
    });
  });

  describe("GET /api/admin/pending-review", () => {
    test("should return pending review markets", async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          {
            market_id: 1,
            question: "Will BTC reach $100k?",
            error_message: "Oracle timeout",
            created_at: new Date(),
          },
        ],
      });

      const response = await request(app)
        .get("/api/admin/pending-review")
        .set("x-admin", "true");

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].market_id).toBe(1);
    });

    test("should require admin role", async () => {
      const response = await request(app).get("/api/admin/pending-review");

      expect(response.status).toBe(401);
    });
  });

  describe("GET /api/admin/dead-letter", () => {
    test("should return dead-lettered markets", async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          {
            market_id: 2,
            error: "Contract call failed",
            retry_count: 5,
            created_at: new Date(),
          },
        ],
      });

      const response = await request(app)
        .get("/api/admin/dead-letter")
        .set("x-admin", "true");

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].market_id).toBe(2);
    });

    test("should require admin role", async () => {
      const response = await request(app).get("/api/admin/dead-letter");

      expect(response.status).toBe(401);
    });
  });

  describe("POST /api/admin/markets/:id/force-resolve", () => {
    test("should force-resolve a market", async () => {
      // Mock market fetch
      db.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            resolved: false,
            outcomes: ["Yes", "No"],
          },
        ],
      });

      // Mock update
      db.query.mockResolvedValueOnce({});

      // Mock redis delete
      redis.del.mockResolvedValue(1);

      const response = await request(app)
        .post("/api/admin/markets/1/force-resolve")
        .set("x-admin", "true")
        .send({ winning_outcome: 0 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.winning_outcome).toBe(0);
    });

    test("should reject invalid outcome index", async () => {
      // Mock market fetch
      db.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            resolved: false,
            outcomes: ["Yes", "No"],
          },
        ],
      });

      const response = await request(app)
        .post("/api/admin/markets/1/force-resolve")
        .set("x-admin", "true")
        .send({ winning_outcome: 5 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("out of range");
    });

    test("should reject already resolved market", async () => {
      // Mock market fetch
      db.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            resolved: true,
            outcomes: ["Yes", "No"],
          },
        ],
      });

      const response = await request(app)
        .post("/api/admin/markets/1/force-resolve")
        .set("x-admin", "true")
        .send({ winning_outcome: 0 });

      expect(response.status).toBe(409);
      expect(response.body.error).toContain("already resolved");
    });

    test("should require admin role", async () => {
      const response = await request(app)
        .post("/api/admin/markets/1/force-resolve")
        .send({ winning_outcome: 0 });

      expect(response.status).toBe(401);
    });
  });

  describe("POST /api/admin/pending-review", () => {
    test("should add market to pending review", async () => {
      db.query.mockResolvedValueOnce({});

      const response = await request(app)
        .post("/api/admin/pending-review")
        .set("x-admin", "true")
        .send({
          market_id: 1,
          question: "Will BTC reach $100k?",
          error_message: "Oracle timeout",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test("should require all fields", async () => {
      const response = await request(app)
        .post("/api/admin/pending-review")
        .set("x-admin", "true")
        .send({
          market_id: 1,
          question: "Will BTC reach $100k?",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("required");
    });

    test("should require admin role", async () => {
      const response = await request(app)
        .post("/api/admin/pending-review")
        .send({
          market_id: 1,
          question: "Will BTC reach $100k?",
          error_message: "Oracle timeout",
        });

      expect(response.status).toBe(401);
    });
  });

  describe("GET /api/admin/audit-log", () => {
    test("should return audit log", async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            admin_wallet: "admin-wallet",
            action_type: "FORCE_RESOLVE_MARKET",
            target_id: 1,
            created_at: new Date(),
          },
        ],
      });

      const response = await request(app)
        .get("/api/admin/audit-log")
        .set("x-admin", "true");

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(1);
    });

    test("should filter by action type", async () => {
      db.query.mockResolvedValueOnce({
        rows: [],
      });

      const response = await request(app)
        .get("/api/admin/audit-log?actionType=FORCE_RESOLVE_MARKET")
        .set("x-admin", "true");

      expect(response.status).toBe(200);
    });

    test("should require admin role", async () => {
      const response = await request(app).get("/api/admin/audit-log");

      expect(response.status).toBe(401);
    });
  });
});
