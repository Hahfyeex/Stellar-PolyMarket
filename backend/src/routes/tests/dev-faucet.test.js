jest.mock("../../utils/redis", () => ({
  set: jest.fn(),
  del: jest.fn(),
}));
jest.mock("axios");
jest.mock("../../utils/logger", () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const express = require("express");
const request = require("supertest");
const axios = require("axios");
const redis = require("../../utils/redis");
const devRouter = require("../dev");

const app = express();
app.use("/api/dev", devRouter);

const VALID_WALLET = "G" + "A".repeat(55);

describe("GET /api/dev/faucet", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env.NODE_ENV = originalEnv;
  });

  test("funds wallet in development and returns friendbot payload with transaction hash", async () => {
    process.env.NODE_ENV = "development";
    redis.set.mockResolvedValue("OK");
    axios.get.mockResolvedValue({
      data: {
        hash: "tx_hash_123",
        successful: true,
      },
    });

    const res = await request(app).get("/api/dev/faucet").query({ wallet: VALID_WALLET });

    expect(res.status).toBe(200);
    expect(res.body.transaction_hash).toBe("tx_hash_123");
    expect(redis.set).toHaveBeenCalledWith(
      `faucet:wallet:${VALID_WALLET}`,
      expect.any(String),
      "EX",
      3600,
      "NX"
    );
    expect(axios.get).toHaveBeenCalledWith("https://friendbot.stellar.org", {
      params: { addr: VALID_WALLET },
    });
  });

  test("returns 403 when NODE_ENV is production", async () => {
    process.env.NODE_ENV = "production";

    const res = await request(app).get("/api/dev/faucet").query({ wallet: VALID_WALLET });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Faucet is only available in development.");
    expect(redis.set).not.toHaveBeenCalled();
    expect(axios.get).not.toHaveBeenCalled();
  });

  test("returns 429 when wallet is rate-limited", async () => {
    process.env.NODE_ENV = "test";
    redis.set.mockResolvedValue(null);

    const res = await request(app).get("/api/dev/faucet").query({ wallet: VALID_WALLET });

    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/Rate limit exceeded/);
    expect(axios.get).not.toHaveBeenCalled();
  });
});
