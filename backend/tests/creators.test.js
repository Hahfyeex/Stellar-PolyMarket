const request = require("supertest");
const express = require("express");
const db = require("../src/db");
const creatorsRouter = require("../src/routes/creators");

describe("Creator Reputation Tests", () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use("/api/creators", creatorsRouter);
  });

  describe("calculateReputation formula", () => {
    const { calculateReputation } = require("../src/utils/creators");

    test("0 markets = 0 score", () => {
      const score = calculateReputation({ markets_created: 0 });
      expect(score).toBe(0);
    });

    test("perfect record = 100 score", () => {
      const score = calculateReputation({
        markets_created: 10,
        markets_resolved_correctly: 10,
      });
      expect(score).toBe(100);
    });

    test("disputed penalty", () => {
      const score = calculateReputation({
        markets_created: 10,
        markets_resolved_correctly: 10,
        markets_disputed: 2,
      });
      expect(score).toBe(90); // 100 - 10
    });

    test("voided penalty", () => {
      const score = calculateReputation({
        markets_created: 10,
        markets_resolved_correctly: 10,
        markets_voided: 1,
      });
      expect(score).toBe(90); // 100 - 10
    });

    test("clamps to 0", () => {
      const score = calculateReputation({
        markets_created: 10,
        markets_resolved_correctly: 0,
        markets_disputed: 10,
      });
      expect(score).toBe(0);
    });

    test("clamps to 100", () => {
      const score = calculateReputation({
        markets_created: 10,
        markets_resolved_correctly: 15,
      });
      expect(score).toBe(100);
    });
  });

  describe("GET /api/creators/:wallet/reputation", () => {
    beforeEach(async () => {
      // Insert test creator
      await db.query(
        `INSERT INTO market_creators (wallet_address, markets_created, markets_resolved_correctly, 
         markets_disputed, markets_voided, reputation_score) 
         VALUES ('TESTWALLET0000000000000000000000000000000000000000', 5, 4, 1, 0, 75.00)`
      );
    });

    test("returns reputation breakdown for existing creator", async () => {
      const res = await request(app)
        .get("/api/creators/TESTWALLET0000000000000000000000000000000000000000/reputation");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("reputation_score", 75);
      expect(res.body.breakdown).toHaveProperty("accuracy_pct", "80.00");
      expect(res.body.breakdown.penalties.disputes).toBe(5);
    });

    test("returns 404 for non-existent wallet", async () => {
      const res = await request(app)
        .get("/api/creators/NONEXISTENT/reputation");

      expect(res.status).toBe(404);
    });

    test("rejects invalid wallet format", async () => {
      const res = await request(app).get("/api/creators/invalid/reputation");
      expect(res.status).toBe(400);
    });
  });
});
