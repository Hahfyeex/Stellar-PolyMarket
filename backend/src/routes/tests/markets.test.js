jest.mock("firebase-admin", () => ({
  apps: [],
  initializeApp: jest.fn(),
  credential: { applicationDefault: jest.fn() },
  firestore: jest.fn(() => ({})),
}));
jest.mock("../../db");

const request = require("supertest");
const app = require("../../index");
const db = require("../../db");

describe("Dispute Window Logic", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should set dispute window on market resolution", async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          resolved: true,
          dispute_window_ends_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      ],
    });

    const response = await request(app).post("/api/markets/1/resolve").send();

    expect(response.status).toBe(200);
    expect(response.body.market.resolved).toBe(true);
    expect(response.body.market.dispute_window_ends_at).toBeDefined();
  });

  it("should block payouts during the dispute window", async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          dispute_window_ends_at: new Date(Date.now() + 60 * 60 * 1000),
        },
      ],
    });

    const response = await request(app).post("/api/bets/payout/1").send();

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Dispute window is still open/);
  });

  it("should allow payouts after the dispute window", async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          dispute_window_ends_at: new Date(Date.now() - 60 * 60 * 1000),
        },
      ],
    });

    const response = await request(app).post("/api/bets/payout/1").send();

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Payouts processed successfully");
  });

  it("should return dispute status for a market", async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          dispute_window_ends_at: new Date(Date.now() + 60 * 60 * 1000),
          is_in_dispute_window: true,
        },
      ],
    });

    const response = await request(app).get("/api/markets/1/dispute-status").send();

    expect(response.status).toBe(200);
    expect(response.body.is_in_dispute_window).toBe(true);
    expect(response.body.dispute_window_ends_at).toBeDefined();
  });
});
