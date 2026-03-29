"use strict";

const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");
const axios = require("axios");

jest.mock("axios");
jest.mock("../utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const anchorRouter = require("../routes/anchor");

const app = express();
app.use(express.json());
app.use("/api/anchor", anchorRouter);

const token = jwt.sign({ sub: "GABCDE" }, "test-secret");

describe("Anchor endpoints", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = "test-secret";
  });

  it("returns supported assets and limits", async () => {
    const res = await request(app)
      .get("/api/anchor/info")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.supported_assets).toBeDefined();
    expect(res.body.deposit).toMatchObject({ min: 1, max: 10000 });
  });

  it("requires auth", async () => {
    const res = await request(app).get("/api/anchor/info");
    expect(res.status).toBe(401);
  });

  it("starts a deposit flow and returns a URL", async () => {
    const res = await request(app)
      .post("/api/anchor/deposit")
      .set("Authorization", `Bearer ${token}`)
      .send({ wallet: "GABC", asset: "XLM", amount: 50 });

    expect(res.status).toBe(200);
    expect(res.body.url).toContain("sep24/interactive/deposit");
  });

  it("returns anchor transactions history", async () => {
    axios.get.mockResolvedValueOnce({ data: [{ id: "tx1" }] });

    const res = await request(app)
      .get("/api/anchor/transactions?wallet=GABC")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.transactions).toEqual([{ id: "tx1" }]);
  });
});
