"use strict";

/**
 * Integration tests for the historical market archive feature.
 * Covers:
 *  - archiveResolvedMarkets() cron job logic
 *  - GET /api/archive/markets endpoint (pagination + date filtering)
 *  - 405 for all non-GET methods on the archive endpoint
 *  - 401 for missing/invalid API key
 */

jest.mock("../db");
jest.mock("node-cron", () => ({ schedule: jest.fn() }));
jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const db = require("../db");

// ── archive worker ────────────────────────────────────────────────────────────

describe("archiveResolvedMarkets()", () => {
  const { archiveResolvedMarkets } = require("../workers/archive-worker");

  let client;

  beforeEach(() => {
    client = {
      query: jest.fn(),
      release: jest.fn(),
    };
    db.connect = jest.fn().mockResolvedValue(client);
  });

  afterEach(() => jest.clearAllMocks());

  test("moves resolved markets older than 7 days and commits", async () => {
    client.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] }) // INSERT ... RETURNING id
      .mockResolvedValueOnce(undefined) // DELETE
      .mockResolvedValueOnce(undefined); // COMMIT

    const ids = await archiveResolvedMarkets();

    expect(ids).toEqual([1, 2]);
    expect(client.query).toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalled();
  });

  test("does nothing when no markets qualify", async () => {
    client.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // INSERT returns nothing
      .mockResolvedValueOnce(undefined); // COMMIT

    const ids = await archiveResolvedMarkets();

    expect(ids).toEqual([]);
    // DELETE should NOT be called when ids is empty
    const calls = client.query.mock.calls.map((c) => c[0]);
    expect(calls.some((q) => q.includes("DELETE"))).toBe(false);
    expect(client.release).toHaveBeenCalled();
  });

  test("rolls back and rethrows on error", async () => {
    client.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockRejectedValueOnce(new Error("DB failure")); // INSERT throws

    await expect(archiveResolvedMarkets()).rejects.toThrow("DB failure");
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalled();
  });

  test("start() registers a daily cron schedule", () => {
    const cron = require("node-cron");
    const { start } = require("../workers/archive-worker");
    start();
    expect(cron.schedule).toHaveBeenCalledWith("0 2 * * *", expect.any(Function));
  });
});

describe("GET /api/archive/markets", () => {
  const request = require("supertest");
  const express = require("express");

  let app;
  const VALID_KEY = "test-archive-key";

  beforeAll(() => {
    process.env.ARCHIVE_API_KEY = VALID_KEY;
    app = express();
    app.use(express.json());
    app.use("/api/archive", require("../routes/archive"));
  });

  afterEach(() => jest.clearAllMocks());

  function mockDb(countVal, rows) {
    db.query
      .mockResolvedValueOnce({ rows: [{ count: String(countVal) }] })
      .mockResolvedValueOnce({ rows });
  }

  test("returns 401 without API key", async () => {
    const res = await request(app).get("/api/archive/markets");
    expect(res.status).toBe(401);
  });

  test("returns 401 with wrong API key", async () => {
    const res = await request(app)
      .get("/api/archive/markets")
      .set("x-archive-api-key", "wrong-key");
    expect(res.status).toBe(401);
  });

  test("returns paginated results", async () => {
    const fakeMarkets = [{ id: 10, question: "Q?", archived_at: new Date().toISOString() }];
    mockDb(1, fakeMarkets);

    const res = await request(app)
      .get("/api/archive/markets?page=1&limit=10")
      .set("x-archive-api-key", VALID_KEY);

    expect(res.status).toBe(200);
    expect(res.body.markets).toHaveLength(1);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 10, total: 1, pages: 1 });
  });

  test("applies from/to date filters in query", async () => {
    mockDb(0, []);

    await request(app)
      .get("/api/archive/markets?from=2025-01-01&to=2025-12-31")
      .set("x-archive-api-key", VALID_KEY);

    const countCall = db.query.mock.calls[0];
    expect(countCall[0]).toContain("archived_at >=");
    expect(countCall[0]).toContain("archived_at <=");
    expect(countCall[1]).toContain("2025-01-01");
    expect(countCall[1]).toContain("2025-12-31");
  });

  test("returns 500 on DB error", async () => {
    db.query.mockRejectedValueOnce(new Error("DB down"));

    const res = await request(app).get("/api/archive/markets").set("x-archive-api-key", VALID_KEY);

    expect(res.status).toBe(500);
  });
});

// ── 405 enforcement ───────────────────────────────────────────────────────────

describe("Non-GET methods on /api/archive/markets", () => {
  const request = require("supertest");
  const express = require("express");

  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use("/api/archive", require("../routes/archive"));
  });

  test.each(["post", "put", "patch", "delete"])("%s returns 405", async (method) => {
    const res = await request(app)[method]("/api/archive/markets");
    expect(res.status).toBe(405);
  });
});
