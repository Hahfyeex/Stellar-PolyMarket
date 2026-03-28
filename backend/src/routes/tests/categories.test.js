jest.mock("firebase-admin", () => ({
  apps: [],
  initializeApp: jest.fn(),
  credential: { applicationDefault: jest.fn() },
  firestore: jest.fn(() => ({})),
}));
jest.mock("../../db");

const request = require("supertest");
// We need to mock appCheck middleware because it's used in index.js
jest.mock("../../middleware/appCheck", () => (req, res, next) => next());

const app = require("../../../src/index");
const db = require("../../db");

describe("Categories API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("GET /api/categories should return all categories with counts", async () => {
    const mockCategories = [
      { id: 1, name: "Crypto", slug: "crypto", icon_name: "crypto-icon", market_count: 5 },
      { id: 2, name: "Sports", slug: "sports", icon_name: "sports-icon", market_count: 2 }
    ];

    db.query.mockResolvedValueOnce({ rows: mockCategories });

    const response = await request(app).get("/api/categories");

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBe(2);
    expect(response.body[0].name).toBe("Crypto");
    expect(response.body[0].market_count).toBe(5);
  });

  it("GET /api/categories should handle database errors", async () => {
    db.query.mockRejectedValueOnce(new Error("DB Error"));

    const response = await request(app).get("/api/categories");

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("DATABASE_ERROR");
  });
});
