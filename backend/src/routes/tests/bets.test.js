jest.mock("firebase-admin", () => ({
  apps: [],
  initializeApp: jest.fn(),
  credential: { applicationDefault: jest.fn() },
  firestore: jest.fn(() => ({})),
}));
jest.mock("../../db");
jest.mock("../../utils/redis", () => ({ get: jest.fn(), set: jest.fn(), del: jest.fn() }));

const request = require("supertest");
const app = require("../../index");
const db = require("../../db");
const axios = require("axios");

jest.mock("axios");

describe("POST /api/bets", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should reject a bet with an invalid Stellar wallet address", async () => {
    const response = await request(app).post("/api/bets").send({
      marketId: 1,
      outcomeIndex: 0,
      amount: 100,
      walletAddress: "INVALID_ADDRESS",
      transaction_hash: "dummy_hash",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid Stellar wallet address format");
  });

  it("should reject a bet if the transaction hash does not match", async () => {
    axios.get.mockResolvedValueOnce({
      data: {
        source_account: "GVALIDADDRESS1234567890",
        amount: "50",
      },
    });

    const response = await request(app).post("/api/bets").send({
      marketId: 1,
      outcomeIndex: 0,
      amount: 100,
      walletAddress: "GVALIDADDRESS1234567890",
      transaction_hash: "dummy_hash",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(
      "On-chain transaction not found or does not match bet details"
    );
  });

  it("should accept a valid bet with a matching transaction hash", async () => {
    axios.get.mockResolvedValueOnce({
      data: {
        source_account: "GVALIDADDRESS1234567890",
        amount: "100",
      },
    });

    db.query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Market exists
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Insert bet
      .mockResolvedValueOnce({ rows: [{ total_pool: 100 }] }); // Update pool

    const response = await request(app).post("/api/bets").send({
      marketId: 1,
      outcomeIndex: 0,
      amount: 100,
      walletAddress: "GVALIDADDRESS1234567890",
      transaction_hash: "dummy_hash",
    });

    expect(response.status).toBe(201);
    expect(response.body.bet).toBeDefined();
  });
});
