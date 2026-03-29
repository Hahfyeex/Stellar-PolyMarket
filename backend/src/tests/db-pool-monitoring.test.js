"use strict";

/**
 * Tests for DB connection pool monitoring:
 * - _syncStats updates stats from pool counts
 * - Pool event listeners call _syncStats
 * - Critical warning logged when waiting > 10 for >= 30s
 * - GET /api/health/db returns pool stats
 */

jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));
// Prevent prom-client gauge registration from failing in test env
jest.mock("../services/tvlService", () => ({
  registry: { contentType: "text/plain", metrics: jest.fn() },
}));
jest.mock("prom-client", () => ({
  Gauge: jest.fn().mockImplementation(({ collect }) => ({ set: jest.fn(), collect })),
}));

const logger = require("../utils/logger");

// ── Load db module with a mocked Pool ────────────────────────────────────────
let mockPool;
jest.mock("pg", () => {
  const EventEmitter = require("events");
  mockPool = new EventEmitter();
  mockPool.totalCount = 0;
  mockPool.idleCount = 0;
  mockPool.waitingCount = 0;
  mockPool.query = jest.fn();
  return { Pool: jest.fn(() => mockPool) };
});

// Require AFTER mocks are set up
const db = require("../db");
const { _stats, _syncStats } = db;

beforeEach(() => {
  jest.clearAllMocks();
  _stats.total = 0;
  _stats.idle = 0;
  _stats.waiting = 0;
  mockPool.totalCount = 0;
  mockPool.idleCount = 0;
  mockPool.waitingCount = 0;
  // Reset internal waiting timer via _syncStats with 0 waiting
  _syncStats();
});

// ── _syncStats ────────────────────────────────────────────────────────────────
describe("_syncStats", () => {
  test("copies pool counts into stats object", () => {
    mockPool.totalCount = 5;
    mockPool.idleCount = 3;
    mockPool.waitingCount = 2;
    _syncStats();
    expect(_stats).toEqual({ total: 5, idle: 3, waiting: 2 });
  });
});

// ── Pool event listeners ──────────────────────────────────────────────────────
describe("pool event listeners", () => {
  test("connect event updates stats", () => {
    mockPool.totalCount = 1;
    mockPool.emit("connect");
    expect(_stats.total).toBe(1);
  });

  test("acquire event updates stats", () => {
    mockPool.idleCount = 2;
    mockPool.emit("acquire");
    expect(_stats.idle).toBe(2);
  });

  test("remove event updates stats", () => {
    mockPool.totalCount = 4;
    mockPool.emit("remove");
    expect(_stats.total).toBe(4);
  });

  test("error event logs and updates stats", () => {
    mockPool.totalCount = 3;
    mockPool.emit("error", new Error("connection reset"));
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: "connection reset" }),
      expect.any(String)
    );
    expect(_stats.total).toBe(3);
  });
});

// ── Critical alert threshold ──────────────────────────────────────────────────
describe("critical alert threshold", () => {
  test("no alert when waiting <= 10", () => {
    mockPool.waitingCount = 10;
    _syncStats();
    expect(logger.error).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("CRITICAL")
    );
  });

  test("no alert when waiting > 10 but duration < 30s", () => {
    mockPool.waitingCount = 11;
    _syncStats(); // sets _waitingExceededAt
    _syncStats(); // only ~0ms elapsed — no alert yet
    expect(logger.error).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("CRITICAL")
    );
  });

  test("logs critical error when waiting > 10 for >= 30s", () => {
    // Manually manipulate the internal timer by calling _syncStats,
    // then monkey-patch Date.now to simulate 30s passing
    mockPool.waitingCount = 11;
    _syncStats(); // sets _waitingExceededAt = Date.now()

    const realNow = Date.now;
    Date.now = () => realNow() + 31_000;
    try {
      _syncStats(); // now elapsed >= 30s → should log critical
    } finally {
      Date.now = realNow;
    }

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ waiting: 11 }),
      expect.stringContaining("CRITICAL")
    );
  });

  test("resets timer when waiting drops back to <= 10", () => {
    mockPool.waitingCount = 11;
    _syncStats();
    mockPool.waitingCount = 5;
    _syncStats(); // should clear _waitingExceededAt

    const realNow = Date.now;
    Date.now = () => realNow() + 31_000;
    try {
      _syncStats(); // no alert — timer was reset
    } finally {
      Date.now = realNow;
    }

    expect(logger.error).not.toHaveBeenCalledWith(
      expect.objectContaining({ waiting: expect.any(Number) }),
      expect.stringContaining("CRITICAL")
    );
  });
});

// ── GET /api/health/db ────────────────────────────────────────────────────────
describe("GET /api/health/db", () => {
  const request = require("supertest");
  const express = require("express");

  test("returns pool stats as JSON", async () => {
    _stats.total = 5;
    _stats.idle = 3;
    _stats.waiting = 1;

    const app = express();
    app.use(require("../routes/health"));

    const res = await request(app).get("/health/db");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", pool: { total: 5, idle: 3, waiting: 1 } });
  });
});
