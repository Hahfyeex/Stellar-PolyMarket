"use strict";

jest.mock("../db");
jest.mock("../utils/redis");
jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const request = require("supertest");
const express = require("express");
const db = require("../db");
const redis = require("../utils/redis");
const reservesRouter = require("../routes/reserves");

const app = express();
app.use(express.json());
app.use("/api/reserves", reservesRouter);

describe("GET /api/reserves", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns total_locked from DB on cache miss", async () => {
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue("OK");
    db.query.mockResolvedValue({ rows: [{ total_locked: "12345.50" }] });

    const res = await request(app).get("/api/reserves");

    expect(res.status).toBe(200);
    expect(res.body.total_locked).toBe("12345.50");
    expect(res.body.cached).toBe(false);
  });

  it("queries only unresolved markets for total_locked", async () => {
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue("OK");
    db.query.mockResolvedValue({ rows: [{ total_locked: "0" }] });

    await request(app).get("/api/reserves");

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("resolved = FALSE")
    );
  });

  it("caches the response in Redis for 60 seconds", async () => {
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue("OK");
    db.query.mockResolvedValue({ rows: [{ total_locked: "500" }] });

    await request(app).get("/api/reserves");

    expect(redis.set).toHaveBeenCalledWith(
      "reserves:total",
      expect.any(String),
      "EX",
      60
    );
  });

  it("returns cached response when Redis has data", async () => {
    const cached = JSON.stringify({ total_locked: "9999", cached: false });
    redis.get.mockResolvedValue(cached);

    const res = await request(app).get("/api/reserves");

    expect(res.status).toBe(200);
    expect(res.body.total_locked).toBe("9999");
    expect(res.body.cached).toBe(true);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("returns 0 when no active markets exist", async () => {
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue("OK");
    db.query.mockResolvedValue({ rows: [{ total_locked: "0" }] });

    const res = await request(app).get("/api/reserves");

    expect(res.status).toBe(200);
    expect(res.body.total_locked).toBe("0");
  });

  it("returns 500 on DB error", async () => {
    redis.get.mockResolvedValue(null);
    db.query.mockRejectedValue(new Error("DB connection failed"));

    const res = await request(app).get("/api/reserves");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("DB connection failed");
  });

  it("returns 500 on Redis get error", async () => {
    redis.get.mockRejectedValue(new Error("Redis unavailable"));

    const res = await request(app).get("/api/reserves");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Redis unavailable");
  });
});

describe("GET /api/reserves/:marketId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns pool data for a valid market", async () => {
    db.query.mockResolvedValue({
      rows: [{ id: 42, total_pool: "3200.00", resolved: false }],
    });

    const res = await request(app).get("/api/reserves/42");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      market_id: 42,
      total_pool: "3200.00",
      resolved: false,
    });
  });

  it("queries by the correct market ID", async () => {
    db.query.mockResolvedValue({
      rows: [{ id: 7, total_pool: "100", resolved: false }],
    });

    await request(app).get("/api/reserves/7");

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE id = $1"),
      ["7"]
    );
  });

  it("returns 404 when market does not exist", async () => {
    db.query.mockResolvedValue({ rows: [] });

    const res = await request(app).get("/api/reserves/999");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Market not found");
  });

  it("returns resolved: true for a resolved market", async () => {
    db.query.mockResolvedValue({
      rows: [{ id: 5, total_pool: "800.00", resolved: true }],
    });

    const res = await request(app).get("/api/reserves/5");

    expect(res.status).toBe(200);
    expect(res.body.resolved).toBe(true);
  });

  it("returns 500 on DB error", async () => {
    db.query.mockRejectedValue(new Error("Query timeout"));

    const res = await request(app).get("/api/reserves/1");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Query timeout");
  });

  it("does not use Redis cache for per-market endpoint", async () => {
    db.query.mockResolvedValue({
      rows: [{ id: 1, total_pool: "100", resolved: false }],
    });

    await request(app).get("/api/reserves/1");

    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });
});
