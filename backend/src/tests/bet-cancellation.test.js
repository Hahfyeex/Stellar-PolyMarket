"use strict";

jest.mock("../db");
jest.mock("../utils/redis");
jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));
jest.mock("../utils/errors", () => ({ sanitizeError: (err) => err.message }));
jest.mock("../utils/sorobanClient", () => ({
  getMarketStatus: jest.fn().mockResolvedValue("Active"),
}));
jest.mock("../websocket/marketUpdates", () => ({ broadcastBetPlaced: jest.fn() }));
jest.mock("../bots/eventBus", () => ({ emit: jest.fn() }));
jest.mock("axios");
jest.mock("firebase-admin", () => ({ apps: [true], initializeApp: jest.fn() }));
jest.mock("../middleware/appCheck", () => (req, res, next) => next());

const request = require("supertest");
const express = require("express");
const db = require("../db");
const redis = require("../utils/redis");
const betsRouter = require("../routes/bets");

const app = express();
app.use(express.json());
app.use("/api/bets", betsRouter);

const WALLET = "GABC1234567890123456789012345678901234567890123456";
const future = new Date(Date.now() + 60_000).toISOString();
const past = new Date(Date.now() - 60_000).toISOString();

const makeBet = (overrides = {}) => ({
  id: 1,
  market_id: 10,
  wallet_address: WALLET,
  outcome_index: 0,
  amount: "100",
  paid_out: false,
  cancelled_at: null,
  grace_period_ends_at: future,
  ...overrides,
});

beforeEach(() => jest.clearAllMocks());

describe("DELETE /api/bets/:id — bet cancellation within grace period", () => {
  it("returns 400 when walletAddress is missing", async () => {
    const res = await request(app).delete("/api/bets/1").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/walletAddress/);
  });

  it("returns 404 when bet not found or wallet mismatch", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete("/api/bets/1").send({ walletAddress: WALLET });
    expect(res.status).toBe(404);
  });

  it("returns 409 when bet is already cancelled", async () => {
    db.query.mockResolvedValueOnce({ rows: [makeBet({ cancelled_at: past })] });
    const res = await request(app).delete("/api/bets/1").send({ walletAddress: WALLET });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already cancelled/);
  });

  it("returns 409 when bet is already paid out", async () => {
    db.query.mockResolvedValueOnce({ rows: [makeBet({ paid_out: true })] });
    const res = await request(app).delete("/api/bets/1").send({ walletAddress: WALLET });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/paid out/);
  });

  it("returns 400 when grace period has expired", async () => {
    db.query.mockResolvedValueOnce({ rows: [makeBet({ grace_period_ends_at: past })] });
    const res = await request(app).delete("/api/bets/1").send({ walletAddress: WALLET });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Grace period/);
  });

  it("returns 400 when grace_period_ends_at is null", async () => {
    db.query.mockResolvedValueOnce({ rows: [makeBet({ grace_period_ends_at: null })] });
    const res = await request(app).delete("/api/bets/1").send({ walletAddress: WALLET });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Grace period/);
  });

  it("cancels bet, refunds pool, invalidates cache, returns success", async () => {
    const bet = makeBet();
    db.query
      .mockResolvedValueOnce({ rows: [bet] }) // SELECT bet
      .mockResolvedValueOnce({ rows: [] }) // UPDATE bets cancelled_at
      .mockResolvedValueOnce({ rows: [] }); // UPDATE markets total_pool

    redis.del = jest.fn().mockResolvedValue(1);

    const res = await request(app).delete("/api/bets/1").send({ walletAddress: WALLET });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.bet_id).toBe(1);
    expect(res.body.refunded_amount).toBe("100");

    // Verify cancelled_at update
    expect(db.query.mock.calls[1][0]).toContain("cancelled_at = NOW()");
    // Verify pool deduction
    expect(db.query.mock.calls[2][0]).toContain("total_pool = total_pool - $1");
    expect(db.query.mock.calls[2][1]).toEqual(["100", 10]);
    // Verify cache invalidation
    expect(redis.del).toHaveBeenCalledWith(`portfolio:${WALLET}`);
  });

  it("returns 500 on db error", async () => {
    db.query.mockRejectedValueOnce(new Error("db fail"));
    const res = await request(app).delete("/api/bets/1").send({ walletAddress: WALLET });
    expect(res.status).toBe(500);
  });
});

describe("POST /api/bets — grace_period_ends_at is set on bet creation", () => {
  const axios = require("axios");

  const validBody = {
    marketId: 10,
    outcomeIndex: 0,
    amount: "100",
    walletAddress: WALLET,
    transaction_hash: "abc123",
  };

  it("inserts bet with grace_period_ends_at", async () => {
    axios.get = jest.fn().mockResolvedValue({
      data: { source_account: WALLET, amount: "100" },
    });

    db.query
      .mockResolvedValueOnce({
        rows: [{ id: 10, contract_address: null, outcomes: ["Yes", "No"] }],
      }) // market check
      .mockResolvedValueOnce({ rows: [] }) // duplicate check
      .mockResolvedValueOnce({
        rows: [{ id: 1, market_id: 10, amount: "100", grace_period_ends_at: future }],
      }) // INSERT
      .mockResolvedValueOnce({ rows: [{ total_pool: "100" }] }) // UPDATE pool
      .mockResolvedValueOnce({ rows: [{ total_pool: "100" }] }); // pool check

    redis.get = jest.fn().mockResolvedValue(null);
    redis.set = jest.fn().mockResolvedValue("OK");
    redis.del = jest.fn().mockResolvedValue(1);

    const res = await request(app).post("/api/bets").send(validBody);

    expect(res.status).toBe(201);

    const insertCall = db.query.mock.calls.find((c) => c[0].includes("INSERT INTO bets"));
    expect(insertCall[0]).toContain("grace_period_ends_at");
  });
});
