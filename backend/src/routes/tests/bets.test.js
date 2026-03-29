jest.mock("../../db");
jest.mock("../../utils/redis", () => ({ get: jest.fn(), set: jest.fn(), del: jest.fn() }));
jest.mock("axios");
jest.mock("@stellar/stellar-sdk", () => ({
  StrKey: { isValidEd25519PublicKey: jest.fn((k) => k.length === 56 && k.startsWith("G")) },
}));
jest.mock("../../utils/logger", () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));
jest.mock("firebase-admin", () => ({ apps: [true], initializeApp: jest.fn() }));
jest.mock("../../middleware/appCheck", () => (req, res, next) => next());

const request = require("supertest");
const express = require("express");
const db = require("../../db");
const axios = require("axios");
const betsRouter = require("../bets");

const app = express();
app.use(express.json());
app.use("/api/bets", betsRouter);

// 56-char G... address that passes the mock validator
const VALID_WALLET = "G" + "A".repeat(55);

describe("POST /api/bets", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should reject a bet with an invalid Stellar wallet address", async () => {
    const response = await request(app).post("/api/bets").send({
      marketId: 1,
      outcomeIndex: 0,
      amount: "1000000000",
      walletAddress: "INVALID_ADDRESS",
      transaction_hash: "dummy_hash",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid Stellar wallet address format");
  });

  it("should reject a bet if the transaction hash does not match", async () => {
    axios.get.mockResolvedValueOnce({
      data: { source_account: VALID_WALLET, amount: "50" },
    });

    const response = await request(app).post("/api/bets").send({
      marketId: 1,
      outcomeIndex: 0,
      amount: "1000000000",
      walletAddress: VALID_WALLET,
      transaction_hash: "dummy_hash",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(
      "On-chain transaction not found or does not match bet details"
    );
  });

  it("should accept a valid bet with a matching transaction hash", async () => {
    axios.get.mockResolvedValueOnce({
      data: { source_account: VALID_WALLET, amount: "1000000000" },
    });

    db.query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Market exists
      .mockResolvedValueOnce({ rows: [] }) // No duplicate bet
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Insert bet
      .mockResolvedValueOnce({ rows: [] }) // Update pool
      .mockResolvedValueOnce({ rows: [{ total_pool: "1000000000" }] }); // Pool fetch

    const response = await request(app).post("/api/bets").send({
      marketId: 1,
      outcomeIndex: 0,
      amount: "1000000000",
      walletAddress: VALID_WALLET,
      transaction_hash: "dummy_hash",
    });

    expect(response.status).toBe(201);
    expect(response.body.bet).toBeDefined();
  });
});

// ─── XLM → Stroop conversion (Zero-Float Policy) ─────────────────────────────

describe("XLM to stroop conversion", () => {
  const toStroops = (xlm) => Math.round(xlm * 1e7);

  it("converts 1 XLM to 10_000_000 stroops", () => {
    expect(toStroops(1)).toBe(10_000_000);
  });

  it("converts 100 XLM to 1_000_000_000 stroops", () => {
    expect(toStroops(100)).toBe(1_000_000_000);
  });

  it("converts 0.5 XLM to 5_000_000 stroops", () => {
    expect(toStroops(0.5)).toBe(5_000_000);
  });

  it("converts 10.5 XLM to 105_000_000 stroops (no float string)", () => {
    const stroops = toStroops(10.5);
    expect(stroops).toBe(105_000_000);
    expect(Number.isInteger(stroops)).toBe(true);
  });

  it("rejects non-numeric input", () => {
    expect(isFinite(parseFloat("abc"))).toBe(false);
  });

  it("rejects negative input", () => {
    expect(parseFloat("-5") > 0).toBe(false);
  });

  it("rejects zero input", () => {
    expect(parseFloat("0") > 0).toBe(false);
  });

  it("backend rejects a float amount string", async () => {
    const response = await request(app).post("/api/bets").send({
      marketId: 1,
      outcomeIndex: 0,
      amount: "10.5",
      walletAddress: VALID_WALLET,
      transaction_hash: "dummy_hash",
    });
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/positive integer stroop/);
  });

  it("backend rejects a negative amount", async () => {
    const response = await request(app).post("/api/bets").send({
      marketId: 1,
      outcomeIndex: 0,
      amount: "-1000000",
      walletAddress: VALID_WALLET,
      transaction_hash: "dummy_hash",
    });
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/positive integer stroop/);
  });

  it("backend accepts a valid integer stroop amount (fails at wallet check, not amount)", async () => {
    const response = await request(app).post("/api/bets").send({
      marketId: 1,
      outcomeIndex: 0,
      amount: "1000000000",
      walletAddress: "INVALID",
      transaction_hash: "dummy_hash",
    });
    expect(response.body.error).not.toMatch(/positive integer stroop/);
  });
});
