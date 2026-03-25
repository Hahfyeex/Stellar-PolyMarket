const express = require("express");
const request = require("supertest"); // I'll check if supertest is available, if not I'll just mock the router
const db = require("../db");
const betsRouter = require("../routes/bets");

jest.mock("../db");
jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

describe("GET /api/bets/my-positions", () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use("/api/bets", betsRouter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("should return 400 if walletAddress is missing", async () => {
    const response = await request(app).get("/api/bets/my-positions");
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("walletAddress is required");
  });

  test("should return paginated user positions", async () => {
    const mockBets = [
      { id: 10, question: "Q1", amount: 100, market_status: "ACTIVE" },
      { id: 9, question: "Q2", amount: 50, market_status: "ACTIVE" },
    ];

    db.query.mockResolvedValueOnce({ rows: mockBets });

    const response = await request(app).get("/api/bets/my-positions?walletAddress=ADDR1&limit=2");

    expect(response.status).toBe(200);
    expect(response.body.positions).toHaveLength(2);
    expect(response.body.next_cursor).toBe(9);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE b.wallet_address = $1"),
      ["ADDR1", null, 2]
    );
  });

  test("should return next page using cursor", async () => {
    const mockBets = [
      { id: 8, question: "Q3", amount: 30, market_status: "ACTIVE" },
    ];

    db.query.mockResolvedValueOnce({ rows: mockBets });

    const response = await request(app).get("/api/bets/my-positions?walletAddress=ADDR1&cursor=9&limit=1");

    expect(response.status).toBe(200);
    expect(response.body.positions[0].id).toBe(8);
    expect(response.body.next_cursor).toBe(8);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("AND ($2::integer IS NULL OR b.id < $2)"),
      ["ADDR1", 9, 1]
    );
  });

  test("should return null next_cursor if no more bets", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const response = await request(app).get("/api/bets/my-positions?walletAddress=ADDR1");

    expect(response.status).toBe(200);
    expect(response.body.positions).toHaveLength(0);
    expect(response.body.next_cursor).toBeNull();
  });

  test("should handle database errors", async () => {
    db.query.mockRejectedValueOnce(new Error("DB Error"));

    const response = await request(app).get("/api/bets/my-positions?walletAddress=ADDR1");

    expect(response.status).toBe(500);
    expect(response.body.error).toBe("DB Error");
  });
});

describe("Other bets endpoints", () => {
  let app;
  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use("/api/bets", betsRouter);
  });

  test("POST /api/bets - success", async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }) // market check
      .mockResolvedValueOnce({ rows: [{ id: 101 }] }); // recording bet

    const response = await request(app).post("/api/bets").send({
      marketId: 1,
      outcomeIndex: 0,
      amount: "10.5",
      walletAddress: "ADDR_W"
    });

    expect(response.status).toBe(201);
    expect(response.body.bet.id).toBe(101);
  });

  test("POST /api/bets - invalid input", async () => {
    const response = await request(app).post("/api/bets").send({});
    expect(response.status).toBe(400);
  });

  test("POST /api/bets - market not found", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const response = await request(app).post("/api/bets").send({
      marketId: 99, outcomeIndex: 0, amount: "10", walletAddress: "W"
    });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Market not found");
  });

  test("POST /api/bets/payout/:marketId - success", async () => {
    db.query.mockResolvedValueOnce({ rows: [{ winning_outcome: 0, total_pool: 1000 }] }) // market
      .mockResolvedValueOnce({ rows: [{ amount: 100, wallet_address: "ADDR_W" }] }); // winners

    const response = await request(app).post("/api/bets/payout/1");
    expect(response.status).toBe(200);
    expect(response.body.payouts[0].wallet).toBe("ADDR_W");
    expect(response.body.payouts[0].payout).toBe("970.0000000"); // 1000 * 0.97
  });

  test("POST /api/bets/payout/:marketId - not resolved", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const response = await request(app).post("/api/bets/payout/1");
    expect(response.status).toBe(400);
  });

  test("GET /api/bets/recent - success", async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, question: "Q" }] });
    const response = await request(app).get("/api/bets/recent");
    expect(response.status).toBe(200);
    expect(response.body.activity).toHaveLength(1);
  });

  test("GET /api/bets/recent - db error", async () => {
    db.query.mockRejectedValueOnce(new Error("Fail"));
    const response = await request(app).get("/api/bets/recent");
    expect(response.status).toBe(500);
  });

  test("POST /api/bets - db error on insert", async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockRejectedValueOnce(new Error("Fail"));
    const response = await request(app).post("/api/bets").send({
      marketId: 1, outcomeIndex: 0, amount: "10", walletAddress: "W"
    });
    expect(response.status).toBe(500);
  });

  test("POST /api/bets/payout/:marketId - db error", async () => {
    db.query.mockRejectedValueOnce(new Error("Fail"));
    const response = await request(app).post("/api/bets/payout/1");
    expect(response.status).toBe(500);
  });
});
