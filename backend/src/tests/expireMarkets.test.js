"use strict";

/**
 * Unit tests for jobs/expireMarkets.js
 *
 * Uses jest.useFakeTimers() to control "now" and a mocked db module.
 */

jest.mock("../db");
jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const db = require("../db");
const { expireStaleMarkets, GRACE_PERIOD_HOURS } = require("../jobs/expireMarkets");

const GRACE_MS = GRACE_PERIOD_HOURS * 60 * 60 * 1000; // 2 hours in ms

describe("expireStaleMarkets", () => {
  const FIXED_NOW = new Date("2024-06-01T12:00:00.000Z");

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no markets expired, digest insert succeeds
    db.query.mockResolvedValue({ rows: [] });
  });

  it("does NOT expire a market whose end_date is NOW - 1 hour (within grace period)", async () => {
    // The cutoff passed to the DB query should be NOW - 2h.
    // A market ending at NOW - 1h is NEWER than the cutoff → not expired.
    // We verify the cutoff value sent to db.query.
    await expireStaleMarkets({ now: () => FIXED_NOW });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/UPDATE markets/);

    const cutoff = params[0]; // first param is the cutoff timestamp
    const oneHourBefore = new Date(FIXED_NOW.getTime() - 60 * 60 * 1000);

    // A market at NOW-1h has end_date > cutoff → NOT included by the WHERE clause
    expect(oneHourBefore > cutoff).toBe(true);
  });

  it("DOES expire a market whose end_date is NOW - 2 hours 1 minute (past grace period)", async () => {
    await expireStaleMarkets({ now: () => FIXED_NOW });

    const [, params] = db.query.mock.calls[0];
    const cutoff = params[0];

    const twoHoursOneMsBefore = new Date(FIXED_NOW.getTime() - GRACE_MS - 60 * 1000);

    // A market at NOW-2h1m has end_date < cutoff → IS included by the WHERE clause
    expect(twoHoursOneMsBefore < cutoff).toBe(true);
  });

  it("returns the list of expired markets from the DB result", async () => {
    const mockExpired = [
      { id: 1, question: "Will it rain?" },
      { id: 2, question: "Will BTC hit 100k?" },
    ];
    // First call = UPDATE, second call = INSERT digest
    db.query.mockResolvedValueOnce({ rows: mockExpired }).mockResolvedValueOnce({ rows: [] });

    const result = await expireStaleMarkets({ now: () => FIXED_NOW });

    expect(result).toEqual(mockExpired);
  });

  it("inserts expired markets into expired_markets_digest", async () => {
    const mockExpired = [{ id: 42, question: "Test market?" }];
    db.query.mockResolvedValueOnce({ rows: mockExpired }).mockResolvedValueOnce({ rows: [] });

    await expireStaleMarkets({ now: () => FIXED_NOW });

    const [digestSql, digestParams] = db.query.mock.calls[1];
    expect(digestSql).toMatch(/INSERT INTO expired_markets_digest/);
    expect(digestParams).toContain(42);
    expect(digestParams).toContain("Test market?");
  });

  it("returns empty array and skips digest insert when no markets are stale", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const result = await expireStaleMarkets({ now: () => FIXED_NOW });

    expect(result).toEqual([]);
    // Only one DB call (the UPDATE) — no digest insert
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("cutoff is exactly NOW minus GRACE_PERIOD_HOURS", async () => {
    await expireStaleMarkets({ now: () => FIXED_NOW });

    const [, params] = db.query.mock.calls[0];
    const cutoff = params[0];
    const expectedCutoff = new Date(FIXED_NOW.getTime() - GRACE_MS);

    expect(cutoff.getTime()).toBe(expectedCutoff.getTime());
  });
});
