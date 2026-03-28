"use strict";

jest.mock("../db");
jest.mock("../utils/redis");
jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));
jest.mock("firebase-admin", () => ({ apps: [true], initializeApp: jest.fn() }));
jest.mock("../middleware/appCheck", () => (req, res, next) => next());
jest.mock("../utils/notifications", () => ({ triggerNotification: jest.fn() }));

const request = require("supertest");
const express = require("express");
const db = require("../db");
const marketsRouter = require("../routes/markets");

const app = express();
app.use(express.json());
app.use("/api/markets", marketsRouter);

const MARKET = { id: 1, question: "Test?", status: "ACTIVE", winning_outcome: null };
const PROPOSED_MARKET = { ...MARKET, status: "PROPOSED", winning_outcome: 0 };

// Helper: mock a successful state-change UPDATE then a history INSERT
function mockStateChange(updatedMarket) {
  db.query
    .mockResolvedValueOnce({ rows: [updatedMarket] }) // UPDATE markets
    .mockResolvedValueOnce({ rows: [] }); // INSERT history
}

beforeEach(() => jest.clearAllMocks());

// ─── POST /propose ────────────────────────────────────────────────────────────

describe("POST /api/markets/:id/propose", () => {
  it("returns 400 when proposedOutcome is missing", async () => {
    const res = await request(app).post("/api/markets/1/propose").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/proposedOutcome/);
  });

  it("returns 404 when market not found", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/api/markets/1/propose").send({ proposedOutcome: 0 });
    expect(res.status).toBe(404);
  });

  it("records PROPOSED history and returns market", async () => {
    mockStateChange(PROPOSED_MARKET);
    const res = await request(app)
      .post("/api/markets/1/propose")
      .send({ proposedOutcome: 0, actorWallet: "GABC1234" });

    expect(res.status).toBe(200);
    expect(res.body.market.status).toBe("PROPOSED");

    const historyInsert = db.query.mock.calls[1];
    expect(historyInsert[0]).toContain("INSERT INTO market_resolution_history");
    expect(historyInsert[1]).toEqual([1, "PROPOSED", "GABC1234", 0, null]);
  });

  it("records PROPOSED history without actorWallet", async () => {
    mockStateChange(PROPOSED_MARKET);
    await request(app).post("/api/markets/1/propose").send({ proposedOutcome: 1 });

    const historyInsert = db.query.mock.calls[1];
    expect(historyInsert[1][2]).toBeNull(); // actor_wallet null
  });

  it("returns 500 on db error", async () => {
    db.query.mockRejectedValueOnce(new Error("db fail"));
    const res = await request(app).post("/api/markets/1/propose").send({ proposedOutcome: 0 });
    expect(res.status).toBe(500);
  });
});

// ─── POST /confirm ────────────────────────────────────────────────────────────

describe("POST /api/markets/:id/confirm", () => {
  it("returns 404 when market not in PROPOSED state", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/api/markets/1/confirm").send({});
    expect(res.status).toBe(404);
  });

  it("records CONFIRMED history and returns market", async () => {
    const confirmed = { ...PROPOSED_MARKET, status: "CONFIRMED", resolved: true };
    mockStateChange(confirmed);

    const res = await request(app)
      .post("/api/markets/1/confirm")
      .send({ actorWallet: "GADMIN123" });

    expect(res.status).toBe(200);
    expect(res.body.market.status).toBe("CONFIRMED");

    const historyInsert = db.query.mock.calls[1];
    expect(historyInsert[1]).toEqual([1, "CONFIRMED", "GADMIN123", 0, null]);
  });

  it("returns 500 on db error", async () => {
    db.query.mockRejectedValueOnce(new Error("db fail"));
    const res = await request(app).post("/api/markets/1/confirm").send({});
    expect(res.status).toBe(500);
  });
});

// ─── POST /reject ─────────────────────────────────────────────────────────────

describe("POST /api/markets/:id/reject", () => {
  it("returns 404 when market not in PROPOSED state", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/api/markets/1/reject").send({});
    expect(res.status).toBe(404);
  });

  it("records REJECTED history with notes", async () => {
    const rejected = { ...MARKET, status: "ACTIVE" };
    mockStateChange(rejected);

    const res = await request(app)
      .post("/api/markets/1/reject")
      .send({ actorWallet: "GADMIN123", notes: "Bad data source" });

    expect(res.status).toBe(200);

    const historyInsert = db.query.mock.calls[1];
    expect(historyInsert[1]).toEqual([1, "REJECTED", "GADMIN123", null, "Bad data source"]);
  });

  it("records REJECTED history without notes", async () => {
    mockStateChange({ ...MARKET, status: "ACTIVE" });
    await request(app).post("/api/markets/1/reject").send({});

    const historyInsert = db.query.mock.calls[1];
    expect(historyInsert[1][4]).toBeNull();
  });

  it("returns 500 on db error", async () => {
    db.query.mockRejectedValueOnce(new Error("db fail"));
    const res = await request(app).post("/api/markets/1/reject").send({});
    expect(res.status).toBe(500);
  });
});

// ─── POST /dispute ────────────────────────────────────────────────────────────

describe("POST /api/markets/:id/dispute", () => {
  it("returns 404 when market not in PROPOSED state", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/api/markets/1/dispute").send({});
    expect(res.status).toBe(404);
  });

  it("records DISPUTED history and returns market", async () => {
    const disputed = { ...PROPOSED_MARKET, status: "DISPUTED" };
    mockStateChange(disputed);

    const res = await request(app)
      .post("/api/markets/1/dispute")
      .send({ actorWallet: "GDISPUTER1", notes: "Outcome is wrong" });

    expect(res.status).toBe(200);
    expect(res.body.market.status).toBe("DISPUTED");

    const historyInsert = db.query.mock.calls[1];
    expect(historyInsert[1]).toEqual([1, "DISPUTED", "GDISPUTER1", 0, "Outcome is wrong"]);
  });

  it("returns 500 on db error", async () => {
    db.query.mockRejectedValueOnce(new Error("db fail"));
    const res = await request(app).post("/api/markets/1/dispute").send({});
    expect(res.status).toBe(500);
  });
});

// ─── GET /history ─────────────────────────────────────────────────────────────

describe("GET /api/markets/:id/history", () => {
  const historyRows = [
    {
      id: 1,
      action: "PROPOSED",
      actor_wallet: "GABC1234WXYZ",
      outcome_index: 0,
      notes: null,
      created_at: "2026-03-01T10:00:00Z",
    },
    {
      id: 2,
      action: "DISPUTED",
      actor_wallet: "GDISPUTER5678",
      outcome_index: 0,
      notes: "Wrong source",
      created_at: "2026-03-02T10:00:00Z",
    },
    {
      id: 3,
      action: "CONFIRMED",
      actor_wallet: null,
      outcome_index: 0,
      notes: null,
      created_at: "2026-03-03T10:00:00Z",
    },
  ];

  it("returns 404 when market not found", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get("/api/markets/99/history");
    expect(res.status).toBe(404);
  });

  it("returns history in chronological order with action_label and abbreviated wallet", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // market check
      .mockResolvedValueOnce({ rows: historyRows }); // history query

    const res = await request(app).get("/api/markets/1/history");

    expect(res.status).toBe(200);
    expect(res.body.market_id).toBe(1);
    expect(res.body.history).toHaveLength(3);

    const [proposed, disputed, confirmed] = res.body.history;

    expect(proposed.action).toBe("PROPOSED");
    expect(proposed.action_label).toBe("Resolution Proposed");
    expect(proposed.actor_wallet).toBe("GABC...WXYZ");
    expect(proposed.outcome_index).toBe(0);

    expect(disputed.action).toBe("DISPUTED");
    expect(disputed.action_label).toBe("Resolution Disputed");
    expect(disputed.notes).toBe("Wrong source");

    expect(confirmed.action).toBe("CONFIRMED");
    expect(confirmed.action_label).toBe("Resolution Confirmed");
    expect(confirmed.actor_wallet).toBeNull();
  });

  it("returns empty history array when no entries exist", async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }).mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/api/markets/1/history");

    expect(res.status).toBe(200);
    expect(res.body.history).toEqual([]);
  });

  it("queries history ordered by created_at ASC", async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }).mockResolvedValueOnce({ rows: [] });

    await request(app).get("/api/markets/1/history");

    const historyQuery = db.query.mock.calls[1][0];
    expect(historyQuery).toContain("ORDER BY created_at ASC");
  });

  it("does not require authentication (public endpoint)", async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }).mockResolvedValueOnce({ rows: [] });

    // No auth header — should still succeed
    const res = await request(app).get("/api/markets/1/history");
    expect(res.status).toBe(200);
  });

  it("returns 500 on db error", async () => {
    db.query.mockRejectedValueOnce(new Error("db fail"));
    const res = await request(app).get("/api/markets/1/history");
    expect(res.status).toBe(500);
  });

  it("includes REJECTED action_label", async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }).mockResolvedValueOnce({
      rows: [
        {
          id: 4,
          action: "REJECTED",
          actor_wallet: "GADMIN0000",
          outcome_index: null,
          notes: "Stale data",
          created_at: "2026-03-04T10:00:00Z",
        },
      ],
    });

    const res = await request(app).get("/api/markets/1/history");
    expect(res.body.history[0].action_label).toBe("Resolution Rejected");
  });
});
