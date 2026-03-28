/**
 * tests/leaderboard.test.js
 *
 * Tests for leaderboard API endpoints.
 * Covers: accuracy, volume, winnings rankings, pagination, and caching.
 */

"use strict";

const request = require("supertest");
const express = require("express");
const db = require("../db");
const redis = require("../utils/redis");

jest.mock("../db");
jest.mock("../utils/redis");
jest.mock("../utils/errors", () => ({ sanitizeError: jest.fn((e) => e.message) }));

const leaderboardRouter = require("../routes/leaderboard");

describe("Leaderboard API (#420)", () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use("/api/leaderboard", leaderboardRouter);
    jest.clearAllMocks();
  });

  describe("GET /api/leaderboard - Accuracy", () => {
    test("should return accuracy leaderboard", async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          {
            wallet_address: "wallet1",
            total_bets: 10,
            wins: 8,
            accuracy_pct: 80.0,
          },
          {
            wallet_address: "wallet2",
            total_bets: 5,
            wins: 3,
            accuracy_pct: 60.0,
          },
        ],
      });

      redis.get.mockResolvedValue(null);
      redis.set.mockResolvedValue("OK");

      const response = await request(app)
        .get("/api/leaderboard?type=accuracy&limit=25&offset=0");

      expect(response.status).toBe(200);
      expect(response.body.type).toBe("accuracy");
      expect(response.body.leaderboard).toHaveLength(2);
      expect(response.body.leaderboard[0].rank).toBe(1);
      expect(response.body.leaderboard[0].accuracy_pct).toBe(80.0);
      expect(response.body.leaderboard[1].rank).toBe(2);
      expect(response.body.leaderboard[1].accuracy_pct).toBe(60.0);
    });

    test("should enforce max limit of 100", async () => {
      db.query.mockResolvedValueOnce({
        rows: [],
      });

      redis.get.mockResolvedValue(null);
      redis.set.mockResolvedValue("OK");

      const response = await request(app)
        .get("/api/leaderboard?type=accuracy&limit=200");

      expect(response.status).toBe(200);
      expect(response.body.limit).toBe(100);
    });

    test("should use default limit of 25", async () => {
      db.query.mockResolvedValueOnce({
        rows: [],
      });

      redis.get.mockResolvedValue(null);
      redis.set.mockResolvedValue("OK");

      const response = await request(app)
        .get("/api/leaderboard?type=accuracy");

      expect(response.status).toBe(200);
      expect(response.body.limit).toBe(25);
    });
  });

  describe("GET /api/leaderboard - Volume", () => {
    test("should return volume leaderboard", async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          {
            wallet_address: "wallet1",
            total_bets: 50,
            total_volume_xlm: 5000.0,
          },
          {
            wallet_address: "wallet2",
            total_bets: 30,
            total_volume_xlm: 3000.0,
          },
        ],
      });

      redis.get.mockResolvedValue(null);
      redis.set.mockResolvedValue("OK");

      const response = await request(app)
        .get("/api/leaderboard?type=volume");

      expect(response.status).toBe(200);
      expect(response.body.type).toBe("volume");
      expect(response.body.leaderboard).toHaveLength(2);
      expect(response.body.leaderboard[0].total_volume_xlm).toBe(5000.0);
      expect(response.body.leaderboard[1].total_volume_xlm).toBe(3000.0);
    });
  });

  describe("GET /api/leaderboard - Winnings", () => {
    test("should return winnings leaderboard", async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          {
            wallet_address: "wallet1",
            total_bets: 10,
            wins: 8,
            total_winnings_xlm: 1200.0,
          },
          {
            wallet_address: "wallet2",
            total_bets: 5,
            wins: 3,
            total_winnings_xlm: 600.0,
          },
        ],
      });

      redis.get.mockResolvedValue(null);
      redis.set.mockResolvedValue("OK");

      const response = await request(app)
        .get("/api/leaderboard?type=winnings");

      expect(response.status).toBe(200);
      expect(response.body.type).toBe("winnings");
      expect(response.body.leaderboard).toHaveLength(2);
      expect(response.body.leaderboard[0].total_winnings_xlm).toBe(1200.0);
      expect(response.body.leaderboard[1].total_winnings_xlm).toBe(600.0);
    });
  });

  describe("Pagination", () => {
    test("should support offset pagination", async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          {
            wallet_address: "wallet3",
            total_bets: 5,
            wins: 2,
            accuracy_pct: 40.0,
          },
        ],
      });

      redis.get.mockResolvedValue(null);
      redis.set.mockResolvedValue("OK");

      const response = await request(app)
        .get("/api/leaderboard?type=accuracy&limit=25&offset=50");

      expect(response.status).toBe(200);
      expect(response.body.offset).toBe(50);
      expect(response.body.leaderboard[0].rank).toBe(51);
    });

    test("should return correct count", async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          { wallet_address: "wallet1", total_bets: 10, wins: 8, accuracy_pct: 80.0 },
          { wallet_address: "wallet2", total_bets: 5, wins: 3, accuracy_pct: 60.0 },
          { wallet_address: "wallet3", total_bets: 3, wins: 1, accuracy_pct: 33.33 },
        ],
      });

      redis.get.mockResolvedValue(null);
      redis.set.mockResolvedValue("OK");

      const response = await request(app)
        .get("/api/leaderboard?type=accuracy");

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(3);
    });
  });

  describe("Caching", () => {
    test("should cache leaderboard for 5 minutes", async () => {
      const cachedLeaderboard = {
        type: "accuracy",
        leaderboard: [
          {
            rank: 1,
            wallet_address: "wallet1",
            total_bets: 10,
            wins: 8,
            accuracy_pct: 80.0,
          },
        ],
        limit: 25,
        offset: 0,
        count: 1,
      };

      redis.get.mockResolvedValueOnce(JSON.stringify(cachedLeaderboard));

      const response = await request(app)
        .get("/api/leaderboard?type=accuracy");

      expect(response.status).toBe(200);
      expect(response.body).toEqual(cachedLeaderboard);
      // Should not call db.query if cached
      expect(db.query).not.toHaveBeenCalled();
    });

    test("should cache different types separately", async () => {
      redis.get.mockResolvedValueOnce(null);
      db.query.mockResolvedValueOnce({ rows: [] });
      redis.set.mockResolvedValue("OK");

      await request(app).get("/api/leaderboard?type=accuracy");

      redis.get.mockResolvedValueOnce(null);
      db.query.mockResolvedValueOnce({ rows: [] });

      await request(app).get("/api/leaderboard?type=volume");

      // Should have called set twice with different cache keys
      expect(redis.set).toHaveBeenCalledTimes(2);
    });
  });

  describe("Validation", () => {
    test("should reject invalid type", async () => {
      const response = await request(app)
        .get("/api/leaderboard?type=invalid");

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("must be one of");
    });

    test("should default to accuracy type", async () => {
      db.query.mockResolvedValueOnce({
        rows: [],
      });

      redis.get.mockResolvedValue(null);
      redis.set.mockResolvedValue("OK");

      const response = await request(app).get("/api/leaderboard");

      expect(response.status).toBe(200);
      expect(response.body.type).toBe("accuracy");
    });
  });

  describe("GET /api/leaderboard/user/:walletAddress", () => {
    test("should return user position on all leaderboards", async () => {
      // Mock accuracy rank
      db.query.mockResolvedValueOnce({
        rows: [
          {
            rank: 5,
            wallet_address: "wallet1",
            total_bets: 10,
            wins: 8,
            accuracy_pct: 80.0,
          },
        ],
      });

      // Mock volume rank
      db.query.mockResolvedValueOnce({
        rows: [
          {
            rank: 3,
            wallet_address: "wallet1",
            total_bets: 10,
            total_volume_xlm: 5000.0,
          },
        ],
      });

      // Mock winnings rank
      db.query.mockResolvedValueOnce({
        rows: [
          {
            rank: 2,
            wallet_address: "wallet1",
            total_bets: 10,
            wins: 8,
            total_winnings_xlm: 1200.0,
          },
        ],
      });

      const response = await request(app)
        .get("/api/leaderboard/user/wallet1");

      expect(response.status).toBe(200);
      expect(response.body.wallet_address).toBe("wallet1");
      expect(response.body.accuracy.rank).toBe(5);
      expect(response.body.volume.rank).toBe(3);
      expect(response.body.winnings.rank).toBe(2);
    });

    test("should handle user not on leaderboard", async () => {
      // Mock all queries returning no rows
      db.query.mockResolvedValueOnce({ rows: [] });
      db.query.mockResolvedValueOnce({ rows: [] });
      db.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get("/api/leaderboard/user/unknown-wallet");

      expect(response.status).toBe(200);
      expect(response.body.accuracy).toBeNull();
      expect(response.body.volume).toBeNull();
      expect(response.body.winnings).toBeNull();
    });
  });

  describe("Error Handling", () => {
    test("should handle database errors", async () => {
      db.query.mockRejectedValueOnce(new Error("Database connection failed"));

      const response = await request(app)
        .get("/api/leaderboard?type=accuracy");

      expect(response.status).toBe(500);
      expect(response.body.error).toBeDefined();
    });
  });
});
