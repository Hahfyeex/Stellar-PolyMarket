"use strict";

/**
 * Tests for soft-delete market feature:
 * - DELETE /api/markets/:id (soft delete)
 * - GET /api/markets excludes soft-deleted
 * - GET /api/markets/:id excludes soft-deleted
 * - POST /api/bets rejects bets on soft-deleted markets
 * - GET /api/admin/markets/deleted lists soft-deleted markets
 */

jest.mock("../db", () => ({ query: jest.fn() }));
jest.mock("../utils/redis", () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn(),
  del: jest.fn(),
}));
jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));
jest.mock("../utils/cache", () => ({
  getOrSet: jest.fn((_k, _t, fn) => fn()),
  invalidateAll: jest.fn(),
  invalidateMarket: jest.fn(),
  listKey: jest.fn(() => "list-key"),
  detailKey: jest.fn(() => "detail-key"),
  TTL: { LIST: 60, DETAIL: 60 },
}));
jest.mock("../middleware/marketValidation", () => ({
  validateMarketCreation: (_req, _res, next) => next(),
  rateLimitMarketCreation: (_req, _res, next) => next(),
}));
jest.mock("../bots/eventBus", () => ({ emit: jest.fn() }));
jest.mock("../utils/notifications", () => ({ triggerNotification: jest.fn() }));
jest.mock("../utils/math", () => ({ calculateOdds: jest.fn(() => []) }));
jest.mock("../utils/analytics", () => ({ calculateConfidenceScore: jest.fn(() => 0) }));
jest.mock("@stellar/stellar-sdk", () => ({
  StrKey: { isValidEd25519PublicKey: jest.fn(() => true) },
}));
jest.mock("../utils/errors", () => ({ sanitizeError: jest.fn((e) => e.message) }));

const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");
const db = require("../db");

const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";
const adminToken = `Bearer ${jwt.sign({ sub: "admin" }, JWT_SECRET)}`;

// ── App setup ───────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use("/api/markets", require("../routes/markets"));
app.use("/api/bets", require("../routes/bets"));
app.use("/api/admin", require("../routes/admin"));

beforeEach(() => jest.clearAllMocks());

// ── DELETE /api/markets/:id ─────────────────────────────────────────────────
describe("DELETE /api/markets/:id", () => {
  test("returns 401 without JWT", async () => {
    const res = await request(app).delete("/api/markets/1");
    expect(res.status).toBe(401);
  });

  test("soft-deletes a market and returns 200", async () => {
    const market = { id: 1, question: "Test?", deleted_at: new Date().toISOString() };
    db.query.mockResolvedValue({ rows: [market] });

    const res = await request(app).delete("/api/markets/1").set("Authorization", adminToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("deleted_at = NOW()"), ["1"]);
  });

  test("returns 404 when market not found or already deleted", async () => {
    db.query.mockResolvedValue({ rows: [] });

    const res = await request(app).delete("/api/markets/99").set("Authorization", adminToken);

    expect(res.status).toBe(404);
  });

  test("returns 500 on db error", async () => {
    db.query.mockRejectedValue(new Error("DB down"));

    const res = await request(app).delete("/api/markets/1").set("Authorization", adminToken);

    expect(res.status).toBe(500);
  });
});

// ── GET /api/markets excludes soft-deleted ──────────────────────────────────
describe("GET /api/markets excludes soft-deleted", () => {
  test("query includes deleted_at IS NULL filter", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ total: "2" }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, question: "Active?" }] });

    await request(app).get("/api/markets");

    const countCall = db.query.mock.calls[0][0];
    const selectCall = db.query.mock.calls[1][0];
    expect(countCall).toContain("deleted_at IS NULL");
    expect(selectCall).toContain("deleted_at IS NULL");
  });
});

// ── GET /api/markets/:id excludes soft-deleted ──────────────────────────────
describe("GET /api/markets/:id excludes soft-deleted", () => {
  test("returns 404 for soft-deleted market", async () => {
    // Simulate DB returning no rows (deleted_at IS NULL filter excludes it)
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/api/markets/1");

    expect(res.status).toBe(404);
    const call = db.query.mock.calls[0][0];
    expect(call).toContain("deleted_at IS NULL");
  });
});

// ── POST /api/bets rejects soft-deleted markets ─────────────────────────────
describe("POST /api/bets on soft-deleted market", () => {
  test("rejects bet with 400 when market is soft-deleted", async () => {
    // Market query returns empty (soft-deleted market excluded by deleted_at IS NULL)
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/api/bets").send({
      marketId: 1,
      outcomeIndex: 0,
      amount: 10,
      walletAddress: "GABC1234567890123456789012345678901234567890123456789012",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/deleted/);
    const call = db.query.mock.calls[0][0];
    expect(call).toContain("deleted_at IS NULL");
  });
});

// ── GET /api/admin/markets/deleted ──────────────────────────────────────────
describe("GET /api/admin/markets/deleted", () => {
  test("returns 401 without JWT", async () => {
    const res = await request(app).get("/api/admin/markets/deleted");
    expect(res.status).toBe(401);
  });

  test("returns list of soft-deleted markets", async () => {
    const rows = [{ id: 2, question: "Deleted market?", deleted_at: "2026-01-01T00:00:00Z" }];
    db.query.mockResolvedValue({ rows });

    const res = await request(app)
      .get("/api/admin/markets/deleted")
      .set("Authorization", adminToken);

    expect(res.status).toBe(200);
    expect(res.body.markets).toHaveLength(1);
    expect(res.body.markets[0].id).toBe(2);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("deleted_at IS NOT NULL"));
  });

  test("returns 500 on db error", async () => {
    db.query.mockRejectedValue(new Error("DB down"));

    const res = await request(app)
      .get("/api/admin/markets/deleted")
      .set("Authorization", adminToken);

    expect(res.status).toBe(500);
  });
});
