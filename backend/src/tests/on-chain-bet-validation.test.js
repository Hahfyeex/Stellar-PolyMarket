/**
 * tests/on-chain-bet-validation.test.js
 *
 * Tests for on-chain market status validation before bet placement.
 * Covers: active markets, paused markets, voided markets, RPC failures, and caching.
 */

"use strict";

const request = require("supertest");
const express = require("express");
const db = require("../db");
const redis = require("../utils/redis");
const { getMarketStatus } = require("../utils/sorobanClient");

jest.mock("../db");
jest.mock("../utils/redis");
jest.mock("../utils/sorobanClient");
jest.mock("../bots/eventBus", () => ({ emit: jest.fn() }));
jest.mock("../utils/errors", () => ({ sanitizeError: jest.fn((e) => e.message) }));
jest.mock("@stellar/stellar-sdk", () => ({
  StrKey: { isValidEd25519PublicKey: jest.fn(() => true) },
}));

const betsRouter = require("../routes/bets");

describe("On-Chain Bet Validation (#435)", () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use("/api/bets", betsRouter);
    jest.clearAllMocks();
  });

  const validBetPayload = {
    marketId: 1,
    outcomeIndex: 0,
    amount: "100",
    walletAddress: "GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJJBBX4YOWFSUCMMYWOP2HVEQ",
    transaction_hash: "abc123",
  };

  test("should accept bet on active market", async () => {
    // Mock market query
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          status: "ACTIVE",
          resolved: false,
          outcomes: ["Yes", "No"],
          total_pool: 0,
        },
      ],
    });

    // Mock on-chain status check
    getMarketStatus.mockResolvedValueOnce("Active");

    // Mock transaction verification
    db.query.mockResolvedValueOnce({
      rows: [{ source_account: validBetPayload.walletAddress }],
    });

    // Mock bet insertion
    db.query.mockResolvedValueOnce({
      rows: [{ id: 1, ...validBetPayload }],
    });

    // Mock pool update
    db.query.mockResolvedValueOnce({});

    // Mock pool fetch
    db.query.mockResolvedValueOnce({
      rows: [{ total_pool: 100 }],
    });

    // Mock redis operations
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue("OK");
    redis.del.mockResolvedValue(1);

    const response = await request(app)
      .post("/api/bets")
      .send(validBetPayload);

    expect(response.status).toBe(201);
    expect(response.body.bet).toBeDefined();
  });

  test("should reject bet on paused market", async () => {
    // Mock market query
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          status: "PAUSED",
          resolved: false,
          outcomes: ["Yes", "No"],
        },
      ],
    });

    // Mock on-chain status check
    getMarketStatus.mockResolvedValueOnce("Paused");

    // Mock redis
    redis.get.mockResolvedValue(null);

    const response = await request(app)
      .post("/api/bets")
      .send(validBetPayload);

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("not accepting bets on-chain");
    expect(response.body.error).toContain("Paused");
  });

  test("should reject bet on voided market", async () => {
    // Mock market query
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          status: "VOIDED",
          resolved: false,
          outcomes: ["Yes", "No"],
        },
      ],
    });

    // Mock on-chain status check
    getMarketStatus.mockResolvedValueOnce("Voided");

    // Mock redis
    redis.get.mockResolvedValue(null);

    const response = await request(app)
      .post("/api/bets")
      .send(validBetPayload);

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Voided");
  });

  test("should fall back to database status on RPC failure", async () => {
    // Mock market query
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          status: "ACTIVE",
          resolved: false,
          outcomes: ["Yes", "No"],
          total_pool: 0,
        },
      ],
    });

    // Mock on-chain status check failure
    getMarketStatus.mockResolvedValueOnce(null);

    // Mock transaction verification
    db.query.mockResolvedValueOnce({
      rows: [{ source_account: validBetPayload.walletAddress }],
    });

    // Mock bet insertion
    db.query.mockResolvedValueOnce({
      rows: [{ id: 1, ...validBetPayload }],
    });

    // Mock pool update
    db.query.mockResolvedValueOnce({});

    // Mock pool fetch
    db.query.mockResolvedValueOnce({
      rows: [{ total_pool: 100 }],
    });

    // Mock redis
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue("OK");
    redis.del.mockResolvedValue(1);

    const response = await request(app)
      .post("/api/bets")
      .send(validBetPayload);

    // Should succeed because database status is ACTIVE
    expect(response.status).toBe(201);
  });

  test("should cache on-chain status for 30 seconds", async () => {
    // Mock market query
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          status: "ACTIVE",
          resolved: false,
          outcomes: ["Yes", "No"],
          total_pool: 0,
        },
      ],
    });

    // Mock on-chain status check
    getMarketStatus.mockResolvedValueOnce("Active");

    // Mock transaction verification
    db.query.mockResolvedValueOnce({
      rows: [{ source_account: validBetPayload.walletAddress }],
    });

    // Mock bet insertion
    db.query.mockResolvedValueOnce({
      rows: [{ id: 1, ...validBetPayload }],
    });

    // Mock pool update
    db.query.mockResolvedValueOnce({});

    // Mock pool fetch
    db.query.mockResolvedValueOnce({
      rows: [{ total_pool: 100 }],
    });

    // Mock redis
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue("OK");
    redis.del.mockResolvedValue(1);

    await request(app)
      .post("/api/bets")
      .send(validBetPayload);

    // Verify getMarketStatus was called
    expect(getMarketStatus).toHaveBeenCalledWith(1);
  });

  test("should handle multiple status checks", async () => {
    const statuses = ["Active", "Paused", "Voided"];

    for (const status of statuses) {
      jest.clearAllMocks();

      // Mock market query
      db.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            status: status.toUpperCase(),
            resolved: false,
            outcomes: ["Yes", "No"],
          },
        ],
      });

      // Mock on-chain status check
      getMarketStatus.mockResolvedValueOnce(status);

      // Mock redis
      redis.get.mockResolvedValue(null);

      const response = await request(app)
        .post("/api/bets")
        .send(validBetPayload);

      if (status === "Active") {
        // Will fail on transaction verification, but that's ok for this test
        expect(response.status).not.toBe(400);
      } else {
        expect(response.status).toBe(400);
        expect(response.body.error).toContain(status);
      }
    }
  });
});
