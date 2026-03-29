"use strict";

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
const StellarSdk = require("@stellar/stellar-sdk");
const redis = require("../utils/redis");

// Generate a server keypair for tests
const serverKeypair = StellarSdk.Keypair.random();
const clientKeypair = StellarSdk.Keypair.random();
const NETWORK = StellarSdk.Networks.TESTNET;

process.env.STELLAR_SERVER_SECRET = serverKeypair.secret();
process.env.STELLAR_NETWORK = "testnet";
process.env.JWT_SECRET = "test-secret";

const authRouter = require("../routes/auth");
const app = express();
app.use(express.json());
app.use("/api/auth", authRouter);

/** Build a valid signed SEP-10 challenge XDR for the given client keypair */
function buildChallenge(clientPublicKey = clientKeypair.publicKey()) {
  const now = Math.floor(Date.now() / 1000);
  const tx = new StellarSdk.TransactionBuilder(
    new StellarSdk.Account(serverKeypair.publicKey(), "0"),
    { fee: StellarSdk.BASE_FEE, networkPassphrase: NETWORK }
  )
    .addOperation(
      StellarSdk.Operation.manageData({
        name: "polymarket auth",
        value: StellarSdk.Keypair.random().publicKey(),
        source: clientPublicKey,
      })
    )
    .setTimebounds(now, now + 300)
    .build();

  tx.sign(serverKeypair);
  return tx;
}

function signChallenge(tx, keypair = clientKeypair) {
  tx.sign(keypair);
  return tx.toEnvelope().toXDR("base64");
}

describe("GET /api/auth/challenge", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 400 when wallet param is missing", async () => {
    const res = await request(app).get("/api/auth/challenge");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/wallet/i);
  });

  it("returns 400 for an invalid Stellar address", async () => {
    const res = await request(app).get("/api/auth/challenge?wallet=INVALID");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid stellar/i);
  });

  it("returns a base64 XDR challenge and stores it in Redis", async () => {
    redis.set.mockResolvedValueOnce("OK");

    const res = await request(app).get(
      `/api/auth/challenge?wallet=${clientKeypair.publicKey()}`
    );

    expect(res.status).toBe(200);
    expect(res.body.transaction).toBeDefined();
    expect(res.body.network_passphrase).toBe(NETWORK);
    expect(redis.set).toHaveBeenCalledWith(
      `sep10:challenge:${clientKeypair.publicKey()}`,
      expect.any(String),
      "EX",
      300
    );
  });
});

describe("POST /api/auth/token", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 400 when transaction body is missing", async () => {
    const res = await request(app).post("/api/auth/token").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/transaction is required/i);
  });

  it("returns 401 when challenge is not found in Redis (expired)", async () => {
    const tx = buildChallenge();
    const xdr = signChallenge(tx);

    redis.get.mockResolvedValueOnce(null); // not in Redis

    const res = await request(app).post("/api/auth/token").send({ transaction: xdr });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/expired or not found/i);
  });

  it("returns 401 on replay attack (challenge already used)", async () => {
    const tx = buildChallenge();
    const xdr = signChallenge(tx);

    // Simulate mismatch — stored XDR differs (already deleted/replaced)
    redis.get.mockResolvedValueOnce("different-xdr-value");

    const res = await request(app).post("/api/auth/token").send({ transaction: xdr });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/mismatch/i);
  });

  it("returns 401 when client signature is invalid", async () => {
    const tx = buildChallenge();
    // Sign with a DIFFERENT keypair (not the source account)
    const wrongKeypair = StellarSdk.Keypair.random();
    const xdr = signChallenge(tx, wrongKeypair);

    redis.get.mockResolvedValueOnce(xdr); // stored matches submitted

    const res = await request(app).post("/api/auth/token").send({ transaction: xdr });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid signature/i);
  });

  it("issues a JWT with 24h expiry for a regular user on valid signature", async () => {
    const tx = buildChallenge();
    const xdr = signChallenge(tx); // signed by clientKeypair (the source)

    redis.get.mockResolvedValueOnce(xdr);
    redis.del.mockResolvedValueOnce(1);

    const res = await request(app).post("/api/auth/token").send({ transaction: xdr });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.expires_in).toBe(86400);

    // Verify JWT payload
    const jwt = require("jsonwebtoken");
    const payload = jwt.verify(res.body.token, "test-secret");
    expect(payload.sub).toBe(clientKeypair.publicKey());
    expect(payload.role).toBe("user");

    // Challenge must be deleted after use
    expect(redis.del).toHaveBeenCalledWith(`sep10:challenge:${clientKeypair.publicKey()}`);
  });

  it("issues a JWT with 1h expiry for an admin wallet", async () => {
    const adminKeypair = StellarSdk.Keypair.random();
    process.env.ADMIN_WALLETS = adminKeypair.publicKey();

    // Re-require to pick up new env var
    jest.resetModules();
    const freshRouter = require("../routes/auth");
    const freshApp = express();
    freshApp.use(express.json());
    freshApp.use("/api/auth", freshRouter);

    const tx = buildChallenge(adminKeypair.publicKey());
    tx.sign(adminKeypair);
    const xdr = tx.toEnvelope().toXDR("base64");

    redis.get.mockResolvedValueOnce(xdr);
    redis.del.mockResolvedValueOnce(1);

    const res = await request(freshApp).post("/api/auth/token").send({ transaction: xdr });

    expect(res.status).toBe(200);
    expect(res.body.expires_in).toBe(3600);

    const jwt = require("jsonwebtoken");
    const payload = jwt.verify(res.body.token, "test-secret");
    expect(payload.role).toBe("admin");

    delete process.env.ADMIN_WALLETS;
  });
});
