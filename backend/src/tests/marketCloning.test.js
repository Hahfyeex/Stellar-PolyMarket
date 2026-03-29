"use strict";

/**
 * Unit tests for POST /api/markets/:id/clone
 * Covers:
 * - Successful cloning (resetting state, new date)
 * - Error handling for missing source market
 * - Error handling for database failures
 * - Cache invalidation trigger
 * Closes #612
 */

jest.mock("../db");
jest.mock("../utils/cache", () => ({
  invalidateAll: jest.fn(),
}));
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
const marketsRouter = require("../routes/markets");
const { invalidateAll } = require("../utils/cache");

const app = express();
app.use(express.json());
app.use("/api/markets", marketsRouter);

describe("POST /api/markets/:id/clone", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const sourceMarket = {
    id: 1,
    question: "Will it rain in London next week?",
    end_date: "2023-01-01T00:00:00Z",
    outcomes: ["Yes", "No"],
    total_pool: "1000",
    resolved: true,
    status: "RESOLVED"
  };

  it("successfully clones a market and resets state", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [sourceMarket] }) // find source
      .mockResolvedValueOnce({ 
        rows: [{ 
          ...sourceMarket, 
          id: 2, 
          resolved: false, 
          total_pool: 0,
          status: 'ACTIVE' 
        }] 
      }); // insert child

    const res = await request(app).post("/api/markets/1/clone");

    expect(res.status).toBe(201);
    expect(res.body.market.id).toBe(2);
    expect(res.body.market.question).toBe(sourceMarket.question);
    expect(res.body.market.resolved).toBe(false);
    expect(res.body.market.total_pool).toBe(0);
    expect(res.body.market.status).toBe('ACTIVE');
    expect(invalidateAll).toHaveBeenCalled();

    // Verify INSERT values
    const insertCall = db.query.mock.calls[1];
    expect(insertCall[1]).toContain(sourceMarket.question);
    expect(insertCall[1][2]).toEqual(sourceMarket.outcomes); // outcomes array
  });

  it("returns 404 if source market does not exist", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/api/markets/999/clone");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("MARKET_NOT_FOUND");
  });

  it("returns 500 if database fails", async () => {
    db.query.mockRejectedValueOnce(new Error("DB Connection Error"));

    const res = await request(app).post("/api/markets/1/clone");

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("CLONE_FAILED");
  });
});
