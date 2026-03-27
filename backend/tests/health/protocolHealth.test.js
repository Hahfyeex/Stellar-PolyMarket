"use strict";

/**
 * Protocol Health Dashboard — Test Suite
 * Target: >95% line/branch coverage
 *
 * Run: npx jest tests/health/protocolHealth.test.js --coverage
 */

const request = require("supertest");
const express = require("express");

// ─── Mock dependencies before requiring modules ──────────────────────────────

jest.mock("../../src/utils/redisClient", () => {
  const store = new Map();
  return {
    get: jest.fn(async (key) => store.get(key) ?? null),
    set: jest.fn(async (key, value) => {
      store.set(key, value);
    }),
    _store: store,
    _reset: () => store.clear(),
  };
});

const redisMock = require("../../src/utils/redisClient");

jest.mock("pg", () => {
  const mockQuery = jest.fn();
  const Pool = jest.fn(() => ({ query: mockQuery }));
  Pool._mockQuery = mockQuery;
  return { Pool };
});

const { Pool } = require("pg");
const mockQuery = Pool._mockQuery;

jest.mock("../../src/services/prometheusMetrics", () => ({
  registry: {
    contentType: "text/plain; version=0.0.4; charset=utf-8",
    metrics: jest.fn(async () => "# HELP stella_protocol_tvl_stroops TVL\n"),
  },
  updateGauges: jest.fn(),
}));

// ─── Module under test ───────────────────────────────────────────────────────

const { getProtocolHealth, stroopsToFixed } = require("../../src/services/protocolHealthService");
const healthRouter = require("../../src/routes/health/protocolHealth");

// ─── Test app ────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use("/api/health", healthRouter);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setupDBMock({
  tvl = "500000000",
  activeMarkets = "12",
  volume24h = "100000000",
  totalStaked = "300000000",
  totalSupply = "1000000000",
} = {}) {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ tvl_stroops: tvl }] })
    .mockResolvedValueOnce({ rows: [{ active_markets: activeMarkets }] })
    .mockResolvedValueOnce({ rows: [{ volume_24h_stroops: volume24h }] })
    .mockResolvedValueOnce({
      rows: [
        {
          total_staked_stroops: totalStaked,
          total_supply_stroops: totalSupply,
        },
      ],
    });
}

beforeEach(() => {
  jest.clearAllMocks();
  redisMock._reset();
});

// ─── stroopsToFixed ──────────────────────────────────────────────────────────

describe("stroopsToFixed", () => {
  test("converts whole XLM correctly", () => {
    expect(stroopsToFixed(10_000_000n)).toBe("1.0000000");
  });

  test("converts zero correctly", () => {
    expect(stroopsToFixed(0n)).toBe("0.0000000");
  });

  test("converts sub-stroop amount", () => {
    expect(stroopsToFixed(1n)).toBe("0.0000001");
  });

  test("converts large amounts without floating-point drift", () => {
    // 1,000,000 XLM
    expect(stroopsToFixed(10_000_000_000_000n)).toBe("1000000.0000000");
  });

  test("converts fractional XLM", () => {
    expect(stroopsToFixed(5_000_000n)).toBe("0.5000000");
  });
});

// ─── protocolHealthService ───────────────────────────────────────────────────

describe("getProtocolHealth", () => {
  describe("cache miss path", () => {
    beforeEach(() => setupDBMock());

    test("returns correct metric fields", async () => {
      const result = await getProtocolHealth();

      expect(result.tvl_stroops).toBe("500000000");
      expect(result.active_markets).toBe("12");
      expect(result.volume_24h_stroops).toBe("100000000");
      expect(result.total_staked_stroops).toBe("300000000");
      expect(result.cached).toBe(false);
    });

    test("computes staking ratio correctly (integer fixed-point)", async () => {
      const result = await getProtocolHealth();
      // 300_000_000 / 1_000_000_000 * 10_000_000 = 3_000_000
      expect(result.staking_ratio_fixed).toBe("3000000");
      // Human-readable: 0.3000000 → formatted as "0.3000000"
      expect(result.staking_ratio_pct).toBe("0.3000000");
    });

    test("writes result to Redis cache", async () => {
      await getProtocolHealth();
      expect(redisMock.set).toHaveBeenCalledWith("protocol:health", expect.any(String), { EX: 30 });
    });

    test("returns human-readable XLM strings with 7 decimals", async () => {
      const result = await getProtocolHealth();
      expect(result.tvl_xlm).toBe("50.0000000"); // 500_000_000 stroops
      expect(result.volume_24h_xlm).toBe("10.0000000"); // 100_000_000 stroops
    });
  });

  describe("cache hit path", () => {
    test("returns cached data without hitting DB", async () => {
      const cached = {
        tvl_stroops: "999",
        active_markets: "5",
        volume_24h_stroops: "111",
        total_staked_stroops: "222",
        staking_ratio_fixed: "0",
        tvl_xlm: "0.0000999",
        volume_24h_xlm: "0.0000111",
        total_staked_xlm: "0.0000222",
        staking_ratio_pct: "0.0000000",
        fetched_at: new Date().toISOString(),
      };
      redisMock.get.mockResolvedValueOnce(JSON.stringify(cached));

      const result = await getProtocolHealth();

      expect(result.cached).toBe(true);
      expect(result.tvl_stroops).toBe("999");
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe("zero supply edge case", () => {
    test("staking ratio is 0 when supply is 0", async () => {
      setupDBMock({ totalSupply: "0", totalStaked: "0" });
      const result = await getProtocolHealth();
      expect(result.staking_ratio_fixed).toBe("0");
    });
  });

  describe("DB failure", () => {
    test("propagates error to caller", async () => {
      mockQuery.mockRejectedValueOnce(new Error("DB connection lost"));
      await expect(getProtocolHealth()).rejects.toThrow("DB connection lost");
    });
  });
});

// ─── Route: GET /api/health/protocol ────────────────────────────────────────

describe("GET /api/health/protocol", () => {
  test("returns 200 with correct JSON structure", async () => {
    setupDBMock();
    const res = await request(app).get("/api/health/protocol");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.data).toMatchObject({
      tvl_stroops: expect.any(String),
      active_markets: expect.any(String),
      volume_24h_stroops: expect.any(String),
      total_staked_stroops: expect.any(String),
      staking_ratio_fixed: expect.any(String),
      tvl_xlm: expect.any(String),
      volume_24h_xlm: expect.any(String),
      total_staked_xlm: expect.any(String),
      staking_ratio_pct: expect.any(String),
      fetched_at: expect.any(String),
    });
  });

  test("is publicly accessible — no auth header required", async () => {
    setupDBMock();
    const res = await request(app).get("/api/health/protocol").unset("Authorization");
    expect(res.status).toBe(200);
  });

  test("returns 503 on service failure", async () => {
    mockQuery.mockRejectedValueOnce(new Error("DB down"));
    const res = await request(app).get("/api/health/protocol");
    expect(res.status).toBe(503);
    expect(res.body.status).toBe("error");
  });

  test("updates Prometheus gauges on each call", async () => {
    setupDBMock();
    const { updateGauges } = require("../../src/services/prometheusMetrics");
    await request(app).get("/api/health/protocol");
    expect(updateGauges).toHaveBeenCalled();
  });
});

// ─── Route: GET /api/health/prometheus-metrics ───────────────────────────────

describe("GET /api/health/prometheus-metrics", () => {
  test("returns Prometheus text format with correct content-type", async () => {
    setupDBMock();
    const res = await request(app).get("/api/health/prometheus-metrics");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/plain/);
    expect(res.text).toContain("stella_protocol_tvl_stroops");
  });

  test("returns 503 when metrics collection fails", async () => {
    mockQuery.mockRejectedValueOnce(new Error("DB down"));
    const res = await request(app).get("/api/health/prometheus-metrics");
    expect(res.status).toBe(503);
  });
});
