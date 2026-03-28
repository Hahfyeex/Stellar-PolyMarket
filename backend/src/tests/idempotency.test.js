"use strict";

jest.mock("../db", () => ({ query: jest.fn() }));
jest.mock("../utils/redis", () => ({ get: jest.fn(), set: jest.fn(), del: jest.fn() }));
jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));
jest.mock("../bots/eventBus", () => ({ emit: jest.fn() }));
jest.mock("../utils/errors", () => ({ sanitizeError: jest.fn((e) => e.message) }));
jest.mock("@stellar/stellar-sdk", () => ({
  StrKey: { isValidEd25519PublicKey: jest.fn(() => true) },
}));

const request = require("supertest");
const express = require("express");
const db = require("../db");
const redis = require("../utils/redis");

const app = express();
app.use(express.json());
app.use("/api/bets", require("../routes/bets"));

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const VALID_WALLET = "GABC1234567890123456789012345678901234567890123456789012"; // 56 chars, starts with G

const betPayload = { marketId: 1, outcomeIndex: 0, amount: 10, walletAddress: VALID_WALLET };

// Simulate a successful DB sequence for placing a bet
function mockSuccessfulBet(
  betRow = { id: 42, market_id: 1, wallet_address: VALID_WALLET, outcome_index: 0, amount: 10 }
) {
  db.query
    .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // market check
    .mockResolvedValueOnce({ rows: [] }) // duplicate bet check
    .mockResolvedValueOnce({ rows: [betRow] }) // INSERT bet
    .mockResolvedValueOnce({ rows: [] }) // UPDATE total_pool
    .mockResolvedValueOnce({ rows: [{ total_pool: 100 }] }); // pool check
}

beforeEach(() => jest.clearAllMocks());

describe("POST /api/bets — idempotency key handling", () => {
  test("invalid UUID format returns 400", async () => {
    const res = await request(app)
      .post("/api/bets")
      .set("X-Idempotency-Key", "not-a-uuid")
      .send(betPayload);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/UUID/);
    expect(db.query).not.toHaveBeenCalled();
  });

  test("duplicate key returns cached response without hitting DB", async () => {
    const cached = { status: 201, body: { bet: { id: 42 } } };
    redis.get.mockResolvedValue(JSON.stringify(cached));

    const res = await request(app)
      .post("/api/bets")
      .set("X-Idempotency-Key", VALID_UUID)
      .send(betPayload);

    expect(res.status).toBe(201);
    expect(res.body.bet.id).toBe(42);
    expect(db.query).not.toHaveBeenCalled();
    expect(redis.get).toHaveBeenCalledWith(`idem:${VALID_UUID}`);
  });

  test("new key processes bet and caches response with 24h TTL", async () => {
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue("OK");
    redis.del.mockResolvedValue(1);
    mockSuccessfulBet();

    const res = await request(app)
      .post("/api/bets")
      .set("X-Idempotency-Key", VALID_UUID)
      .send(betPayload);

    expect(res.status).toBe(201);
    expect(res.body.bet).toBeDefined();
    expect(redis.set).toHaveBeenCalledWith(
      `idem:${VALID_UUID}`,
      expect.stringContaining('"status":201'),
      "EX",
      86400
    );
  });

  test("no idempotency key processes normally without caching", async () => {
    redis.del.mockResolvedValue(1);
    mockSuccessfulBet();

    const res = await request(app).post("/api/bets").send(betPayload);

    expect(res.status).toBe(201);
    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });
});
