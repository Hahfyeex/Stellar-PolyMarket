"use strict";
/**
 * Tests for GET /health and GET /ready endpoints.
 * Covers: healthy, db-down, redis-down, migration mismatch, timeout, security.
 * Target: >95% coverage.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock("../db", () => ({ query: jest.fn() }));
jest.mock("../utils/redis", () => ({ ping: jest.fn() }));
jest.mock("../utils/logger", () => ({
  info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

const db    = require("../db");
const redis = require("../utils/redis");
const request = require("supertest");
const express = require("express");

// Build a minimal Express app with just the health router
function buildApp() {
  const app = express();
  app.use(require("../routes/health"));
  return app;
}

const { _checkDb, _checkRedis, _checkMigrations, _withTimeout } = require("../routes/health");

beforeEach(() => jest.clearAllMocks());

// ── withTimeout helper ────────────────────────────────────────────────────────

describe("_withTimeout", () => {
  test("resolves when promise settles before timeout", async () => {
    await expect(_withTimeout(Promise.resolve("ok"), 500)).resolves.toBe("ok");
  });

  test("rejects when promise exceeds timeout", async () => {
    const never = new Promise(() => {});
    await expect(_withTimeout(never, 10)).rejects.toThrow("check timed out");
  });
});

// ── _checkDb ──────────────────────────────────────────────────────────────────

describe("_checkDb", () => {
  test("returns 'ok' when SELECT 1 succeeds", async () => {
    db.query.mockResolvedValue({ rows: [{ "?column?": 1 }] });
    await expect(_checkDb()).resolves.toBe("ok");
  });

  test("returns 'error' when DB query throws", async () => {
    db.query.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(_checkDb()).resolves.toBe("error");
  });

  test("returns 'error' on timeout", async () => {
    db.query.mockImplementation(() => new Promise(() => {})); // never resolves
    // Override timeout to 10ms for speed
    const orig = _withTimeout;
    await expect(_checkDb()).resolves.toBe("error");
  });

  test("does not expose internal error message", async () => {
    db.query.mockRejectedValue(new Error("password authentication failed for user postgres"));
    const result = await _checkDb();
    expect(result).toBe("error"); // only "error", not the message
  });
});

// ── _checkRedis ───────────────────────────────────────────────────────────────

describe("_checkRedis", () => {
  test("returns 'ok' when PING returns PONG", async () => {
    redis.ping.mockResolvedValue("PONG");
    await expect(_checkRedis()).resolves.toBe("ok");
  });

  test("returns 'error' when PING throws", async () => {
    redis.ping.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(_checkRedis()).resolves.toBe("error");
  });

  test("returns 'error' when PING returns unexpected value", async () => {
    redis.ping.mockResolvedValue("NOPE");
    await expect(_checkRedis()).resolves.toBe("error");
  });

  test("does not expose internal error message", async () => {
    redis.ping.mockRejectedValue(new Error("auth required"));
    const result = await _checkRedis();
    expect(result).toBe("error");
  });
});

// ── _checkMigrations ──────────────────────────────────────────────────────────

describe("_checkMigrations", () => {
  test("returns 'ok' when EXPECTED_MIGRATION_VERSION is not set", async () => {
    delete process.env.EXPECTED_MIGRATION_VERSION;
    db.query.mockResolvedValue({ rows: [{ version: "20260101" }] });
    await expect(_checkMigrations()).resolves.toBe("ok");
  });

  test("returns 'ok' when version matches expected", async () => {
    process.env.EXPECTED_MIGRATION_VERSION = "20260101";
    db.query.mockResolvedValue({ rows: [{ version: "20260101" }] });
    await expect(_checkMigrations()).resolves.toBe("ok");
    delete process.env.EXPECTED_MIGRATION_VERSION;
  });

  test("returns 'error' when version does not match expected", async () => {
    process.env.EXPECTED_MIGRATION_VERSION = "20260201";
    db.query.mockResolvedValue({ rows: [{ version: "20260101" }] });
    await expect(_checkMigrations()).resolves.toBe("error");
    delete process.env.EXPECTED_MIGRATION_VERSION;
  });

  test("returns 'ok' when schema_migrations table does not exist", async () => {
    db.query.mockRejectedValue(new Error('relation "schema_migrations" does not exist'));
    await expect(_checkMigrations()).resolves.toBe("ok");
  });

  test("returns 'error' on unexpected DB error", async () => {
    process.env.EXPECTED_MIGRATION_VERSION = "20260101";
    db.query.mockRejectedValue(new Error("connection reset"));
    await expect(_checkMigrations()).resolves.toBe("error");
    delete process.env.EXPECTED_MIGRATION_VERSION;
  });
});

// ── GET /health ───────────────────────────────────────────────────────────────

describe("GET /health", () => {
  test("returns 200 with healthy status when all checks pass", async () => {
    db.query.mockResolvedValue({ rows: [{ "?column?": 1 }] });
    redis.ping.mockResolvedValue("PONG");

    const res = await request(buildApp()).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("healthy");
    expect(res.body.db).toBe("ok");
    expect(res.body.redis).toBe("ok");
    expect(res.body.uptime).toBeGreaterThanOrEqual(0);
  });

  test("returns 503 when DB is down", async () => {
    db.query.mockRejectedValue(new Error("ECONNREFUSED"));
    redis.ping.mockResolvedValue("PONG");

    const res = await request(buildApp()).get("/health");

    expect(res.status).toBe(503);
    expect(res.body.status).toBe("unhealthy");
    expect(res.body.db).toBe("error");
    expect(res.body.redis).toBe("ok");
  });

  test("returns 503 when Redis is down", async () => {
    db.query.mockResolvedValue({ rows: [] });
    redis.ping.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await request(buildApp()).get("/health");

    expect(res.status).toBe(503);
    expect(res.body.status).toBe("unhealthy");
    expect(res.body.redis).toBe("error");
  });

  test("returns 503 when both DB and Redis are down", async () => {
    db.query.mockRejectedValue(new Error("DB down"));
    redis.ping.mockRejectedValue(new Error("Redis down"));

    const res = await request(buildApp()).get("/health");

    expect(res.status).toBe(503);
    expect(res.body.db).toBe("error");
    expect(res.body.redis).toBe("error");
  });

  test("never exposes internal error messages in response body", async () => {
    db.query.mockRejectedValue(new Error("password authentication failed for user postgres"));
    redis.ping.mockRejectedValue(new Error("NOAUTH Authentication required"));

    const res = await request(buildApp()).get("/health");
    const body = JSON.stringify(res.body);

    expect(body).not.toContain("password authentication failed");
    expect(body).not.toContain("NOAUTH Authentication required");
    expect(res.body.error).toBe("dependency unavailable");
  });

  test("does not include error field when healthy", async () => {
    db.query.mockResolvedValue({ rows: [] });
    redis.ping.mockResolvedValue("PONG");

    const res = await request(buildApp()).get("/health");
    expect(res.body.error).toBeUndefined();
  });

  test("includes uptime field", async () => {
    db.query.mockResolvedValue({ rows: [] });
    redis.ping.mockResolvedValue("PONG");

    const res = await request(buildApp()).get("/health");
    expect(typeof res.body.uptime).toBe("number");
  });
});

// ── GET /ready ────────────────────────────────────────────────────────────────

describe("GET /ready", () => {
  test("returns 200 when all checks pass (no migration version pinned)", async () => {
    delete process.env.EXPECTED_MIGRATION_VERSION;
    db.query.mockResolvedValue({ rows: [] });
    redis.ping.mockResolvedValue("PONG");

    const res = await request(buildApp()).get("/ready");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
    expect(res.body.db).toBe("ok");
    expect(res.body.redis).toBe("ok");
    expect(res.body.migrations).toBe("ok");
  });

  test("returns 503 when DB is down", async () => {
    db.query.mockRejectedValue(new Error("DB down"));
    redis.ping.mockResolvedValue("PONG");

    const res = await request(buildApp()).get("/ready");

    expect(res.status).toBe(503);
    expect(res.body.status).toBe("not ready");
    expect(res.body.db).toBe("error");
  });

  test("returns 503 when migration version mismatches", async () => {
    process.env.EXPECTED_MIGRATION_VERSION = "20260201";
    // First call is SELECT 1 (health), second is migration check
    db.query
      .mockResolvedValueOnce({ rows: [] })                        // SELECT 1
      .mockResolvedValueOnce({ rows: [{ version: "20260101" }] }); // migration
    redis.ping.mockResolvedValue("PONG");

    const res = await request(buildApp()).get("/ready");

    expect(res.status).toBe(503);
    expect(res.body.migrations).toBe("error");
    expect(res.body.error).toBe("dependency unavailable");
    delete process.env.EXPECTED_MIGRATION_VERSION;
  });

  test("never exposes internal error messages", async () => {
    db.query.mockRejectedValue(new Error("SSL SYSCALL error: EOF detected"));
    redis.ping.mockRejectedValue(new Error("WRONGPASS invalid username-password pair"));

    const res = await request(buildApp()).get("/ready");
    const body = JSON.stringify(res.body);

    expect(body).not.toContain("SSL SYSCALL");
    expect(body).not.toContain("WRONGPASS");
    expect(res.body.error).toBe("dependency unavailable");
  });

  test("includes migrations field", async () => {
    db.query.mockResolvedValue({ rows: [] });
    redis.ping.mockResolvedValue("PONG");

    const res = await request(buildApp()).get("/ready");
    expect(res.body.migrations).toBeDefined();
  });
});
