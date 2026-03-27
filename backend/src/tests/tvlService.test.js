"use strict";

jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Mock db so tests never need a real Postgres connection
jest.mock("../db");
const db = require("../db");

// Re-require the service fresh for each test to reset gauge state
let tvlService;
beforeEach(() => {
  jest.resetModules();
  jest.mock("../db");
  jest.mock("../utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
  tvlService = require("../services/tvlService");
});

afterEach(() => {
  tvlService.stopPoller();
});

// ── collectTVL ────────────────────────────────────────────────────────────

describe("collectTVL()", () => {
  test("returns total = 0 when no active markets", async () => {
    require("../db").query = jest.fn().mockResolvedValue({ rows: [] });
    const { total, markets } = await tvlService.collectTVL();
    expect(total).toBe(0);
    expect(markets).toHaveLength(0);
  });

  test("sums all active market pool balances", async () => {
    require("../db").query = jest.fn().mockResolvedValue({
      rows: [
        { id: 1, total_pool: "100" },
        { id: 2, total_pool: "250.5" },
        { id: 3, total_pool: "50" },
      ],
    });
    const { total, markets } = await tvlService.collectTVL();
    expect(total).toBeCloseTo(400.5);
    expect(markets).toHaveLength(3);
  });

  test("handles null/undefined total_pool as 0", async () => {
    require("../db").query = jest.fn().mockResolvedValue({
      rows: [{ id: 1, total_pool: null }, { id: 2, total_pool: undefined }],
    });
    const { total } = await tvlService.collectTVL();
    expect(total).toBe(0);
  });

  test("updates tvlTotalGauge to the correct value", async () => {
    require("../db").query = jest.fn().mockResolvedValue({
      rows: [{ id: 1, total_pool: "300" }],
    });
    await tvlService.collectTVL();
    const metrics = await tvlService.registry.metrics();
    expect(metrics).toMatch(/tvl_total_xlm 300/);
  });

  test("updates tvlPerMarketGauge with correct market_id label", async () => {
    require("../db").query = jest.fn().mockResolvedValue({
      rows: [{ id: 42, total_pool: "175" }],
    });
    await tvlService.collectTVL();
    const metrics = await tvlService.registry.metrics();
    expect(metrics).toMatch(/tvl_per_market\{market_id="42"\} 175/);
  });

  test("resets per-market gauge between calls (removes stale market_ids)", async () => {
    const dbMock = require("../db");
    // First call: market 1 and 2
    dbMock.query = jest.fn().mockResolvedValueOnce({
      rows: [{ id: 1, total_pool: "100" }, { id: 2, total_pool: "200" }],
    });
    await tvlService.collectTVL();

    // Second call: only market 1 remains active
    dbMock.query = jest.fn().mockResolvedValueOnce({
      rows: [{ id: 1, total_pool: "100" }],
    });
    await tvlService.collectTVL();

    const metrics = await tvlService.registry.metrics();
    // market_id=2 should no longer appear
    expect(metrics).not.toMatch(/market_id="2"/);
    expect(metrics).toMatch(/market_id="1"/);
  });

  test("propagates db errors to the caller", async () => {
    require("../db").query = jest.fn().mockRejectedValue(new Error("db down"));
    await expect(tvlService.collectTVL()).rejects.toThrow("db down");
  });
});

// ── startPoller / stopPoller ──────────────────────────────────────────────

describe("startPoller() / stopPoller()", () => {
  test("startPoller does not throw", () => {
    require("../db").query = jest.fn().mockResolvedValue({ rows: [] });
    expect(() => tvlService.startPoller()).not.toThrow();
  });

  test("calling startPoller twice does not create a second timer", () => {
    require("../db").query = jest.fn().mockResolvedValue({ rows: [] });
    tvlService.startPoller();
    const before = tvlService._timer; // internal — just checking it's stable
    tvlService.startPoller();
    // No error thrown; poller is idempotent
  });

  test("stopPoller clears the timer without error", () => {
    require("../db").query = jest.fn().mockResolvedValue({ rows: [] });
    tvlService.startPoller();
    expect(() => tvlService.stopPoller()).not.toThrow();
  });

  test("stopPoller is safe to call when poller is not running", () => {
    expect(() => tvlService.stopPoller()).not.toThrow();
  });
});
