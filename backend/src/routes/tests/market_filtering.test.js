jest.mock("firebase-admin", () => ({
  apps: [],
  initializeApp: jest.fn(),
  credential: { applicationDefault: jest.fn() },
  firestore: jest.fn(() => ({})),
}));
jest.mock("../../db");
jest.mock("../../utils/redis", () => ({
  get: jest.fn(),
  set: jest.fn(),
}));
jest.mock("../../middleware/appCheck", () => (req, res, next) => next());
jest.mock("../../middleware/marketValidation", () => ({
  validateMarketCreation: (req, res, next) => next(),
  rateLimitMarketCreation: (req, res, next) => next(),
}));

const request = require("supertest");
const app = require("../../../src/index");
const db = require("../../db");

describe("Market Category Filtering and Creation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /api/markets?category=slug", () => {
    it("should filter markets by category slug", async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ total: 1 }] }) // Count query
        .mockResolvedValueOnce({
          rows: [
            { id: 1, question: "Will BTC hit 100k?", category_slug: "crypto" }
          ],
        }); // Data query

      const response = await request(app).get("/api/markets?category=crypto");

      expect(response.status).toBe(200);
      expect(response.body.markets.length).toBe(1);
      expect(response.body.markets[0].category_slug).toBe("crypto");
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("JOIN categories c"),
        expect.arrayContaining(["crypto"])
      );
    });
  });

  describe("POST /api/markets", () => {
    it("should create a market with category_id", async () => {
      const marketData = {
        question: "New Sports Market",
        endDate: "2026-12-31T23:59:59Z",
        outcomes: ["Yes", "No"],
        walletAddress: "0x123",
        categoryId: 1
      };

      db.query.mockResolvedValueOnce({
        rows: [{ id: 1, ...marketData }],
      });

      const response = await request(app).post("/api/markets").send(marketData);

      expect(response.status).toBe(201);
      expect(response.body.market.question).toBe("New Sports Market");
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO markets"),
        expect.arrayContaining([1]) // categoryId
      );
    });

    it("should fail if categoryId is missing", async () => {
      const marketData = {
        question: "New Sports Market",
        endDate: "2026-12-31T23:59:59Z",
        outcomes: ["Yes", "No"],
        walletAddress: "0x123",
        // categoryId is missing
      };

      const response = await request(app).post("/api/markets").send(marketData);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("MISSING_REQUIRED_FIELDS");
    });
  });
});
