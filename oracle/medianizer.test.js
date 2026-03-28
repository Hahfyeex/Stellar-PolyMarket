"use strict";

const { OracleMedianizer, median, filterOutliers, MIN_SOURCES, OUTLIER_SIGMA } = require("./medianizer");

const nullLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const src = (v) => () => Promise.resolve(v);
const fail = (msg = "network error") => () => Promise.reject(new Error(msg));

// ── median() ──────────────────────────────────────────────────────────────────

describe("median()", () => {
  test("odd count — middle element", () => {
    expect(median([1, 3, 5])).toBe(3);
    expect(median([10, 20, 30, 40, 50])).toBe(30);
  });
  test("even count — average of two middle elements", () => {
    expect(median([1, 3, 5, 7])).toBe(4);
    expect(median([10, 20])).toBe(15);
  });
  test("single element", () => { expect(median([42])).toBe(42); });
  test("two elements", () => { expect(median([10, 20])).toBe(15); });
  test("BTC-like values", () => { expect(median([95000, 97000, 98000])).toBe(97000); });
});

// ── filterOutliers() ──────────────────────────────────────────────────────────

describe("filterOutliers()", () => {
  test("keeps all when none exceed 2σ", () => {
    const { filtered, outliers } = filterOutliers([100, 101, 99, 100.5]);
    expect(outliers).toHaveLength(0);
    expect(filtered).toHaveLength(4);
  });
  test("discards values more than 2σ from mean", () => {
    const { filtered, outliers } = filterOutliers([100, 100, 100, 100, 100, 500]);
    expect(outliers).toContain(500);
    expect(filtered).not.toContain(500);
  });
  test("all identical — no outliers (stdDev=0)", () => {
    const { filtered, outliers } = filterOutliers([5, 5, 5, 5]);
    expect(outliers).toHaveLength(0);
    expect(filtered).toHaveLength(4);
  });
  test("two values — neither is outlier", () => {
    const { filtered, outliers } = filterOutliers([0, 100]);
    expect(outliers).toHaveLength(0);
    expect(filtered).toHaveLength(2);
  });
  test("OUTLIER_SIGMA is 2", () => { expect(OUTLIER_SIGMA).toBe(2); });
});

// ── OracleMedianizer.aggregate() ─────────────────────────────────────────────

describe("OracleMedianizer.aggregate()", () => {
  test("3 identical sources → correct median", async () => {
    const m = new OracleMedianizer([src(100), src(100), src(100)], nullLogger);
    await expect(m.aggregate()).resolves.toBe(100);
  });
  test("3 different sources (odd) → middle value", async () => {
    const m = new OracleMedianizer([src(110), src(90), src(100)], nullLogger);
    await expect(m.aggregate()).resolves.toBe(100);
  });
  test("4 sources (even) → average of two middle", async () => {
    const m = new OracleMedianizer([src(90), src(100), src(110), src(120)], nullLogger);
    await expect(m.aggregate()).resolves.toBe(105);
  });
  test("exactly 2 valid sources (MIN_SOURCES boundary) → resolves", async () => {
    const m = new OracleMedianizer([src(95000), src(97000)], nullLogger);
    await expect(m.aggregate()).resolves.toBe(96000);
  });
  test("fewer than 2 valid → throws Insufficient valid sources", async () => {
    const m = new OracleMedianizer([src(100), fail(), fail()], nullLogger);
    await expect(m.aggregate()).rejects.toThrow("Insufficient valid sources");
  });
  test("only 1 valid → throws (market goes to pending review)", async () => {
    const m = new OracleMedianizer([src(100), fail()], nullLogger);
    await expect(m.aggregate()).rejects.toThrow("Insufficient valid sources");
  });
  test("all fail → throws", async () => {
    const m = new OracleMedianizer([fail(), fail(), fail()], nullLogger);
    await expect(m.aggregate()).rejects.toThrow("Insufficient valid sources");
  });
  test("outlier discarded, correct median from remaining", async () => {
    const m = new OracleMedianizer(
      [src(100), src(100), src(100), src(100), src(100), src(9999)],
      nullLogger
    );
    await expect(m.aggregate()).resolves.toBe(100);
  });
  test("tolerates failed fetchers when MIN_SOURCES remain", async () => {
    const m = new OracleMedianizer([src(100), src(102), src(101), fail()], nullLogger);
    await expect(m.aggregate()).resolves.toBe(101);
  });
  test("rejects NaN and Infinity", async () => {
    const m = new OracleMedianizer(
      [src(NaN), src(Infinity), src(100), src(101), src(99)],
      nullLogger
    );
    await expect(m.aggregate()).resolves.toBe(100);
  });
  test("all sources return 0", async () => {
    const m = new OracleMedianizer([src(0), src(0), src(0)], nullLogger);
    await expect(m.aggregate()).resolves.toBe(0);
  });
  test("5-source scenario (all 5 feeds)", async () => {
    const m = new OracleMedianizer(
      [src(97000), src(97100), src(96900), src(97050), src(97200)],
      nullLogger
    );
    // sorted: [96900,97000,97050,97100,97200] → median=97050
    await expect(m.aggregate()).resolves.toBe(97050);
  });
  test("4 of 5 succeed (CMC fails) → resolves", async () => {
    const m = new OracleMedianizer(
      [src(97000), src(97100), src(96900), src(97050), fail("CMC_API_KEY not set")],
      nullLogger
    );
    // sorted: [96900,97000,97050,97100] → median=(97000+97050)/2=97025
    await expect(m.aggregate()).resolves.toBe(97025);
  });
  test("3 of 5 succeed → resolves", async () => {
    const m = new OracleMedianizer(
      [src(97000), src(97100), src(96900), fail(), fail()],
      nullLogger
    );
    await expect(m.aggregate()).resolves.toBe(97000);
  });
  test("2 of 5 succeed → resolves at MIN_SOURCES boundary", async () => {
    const m = new OracleMedianizer(
      [src(97000), src(97100), fail(), fail(), fail()],
      nullLogger
    );
    await expect(m.aggregate()).resolves.toBe(97050);
  });
  test("1 of 5 succeeds → throws, market goes to pending review", async () => {
    const m = new OracleMedianizer(
      [src(97000), fail(), fail(), fail(), fail()],
      nullLogger
    );
    await expect(m.aggregate()).rejects.toThrow("Insufficient valid sources");
  });
  test("all 5 fail → throws", async () => {
    const m = new OracleMedianizer(
      [fail(), fail(), fail(), fail(), fail()],
      nullLogger
    );
    await expect(m.aggregate()).rejects.toThrow("Insufficient valid sources");
  });
  test("logs source values and median", async () => {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const m = new OracleMedianizer([src(100), src(101), src(99)], logger);
    await m.aggregate();
    const infoCalls = logger.info.mock.calls.map((c) => c[0]);
    expect(infoCalls.some((c) => c.sourceValues)).toBe(true);
    expect(infoCalls.some((c) => "median" in c)).toBe(true);
  });
  test("logs warning when sources fail", async () => {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const m = new OracleMedianizer([src(100), src(101), src(99), fail()], logger);
    await m.aggregate();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ failed: expect.any(Array) }),
      expect.stringContaining("source(s) failed")
    );
  });
  test("MIN_SOURCES is 2", () => { expect(MIN_SOURCES).toBe(2); });
});

// ── DB audit logging ──────────────────────────────────────────────────────────

describe("DB audit logging", () => {
  test("writes audit record on success", async () => {
    const mockDb = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const m = new OracleMedianizer([src(97000), src(97100), src(96900)], nullLogger, mockDb);
    await m.aggregate("BTC/USD");
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO oracle_price_log"),
      expect.arrayContaining(["BTC/USD", expect.any(String), expect.any(Array)])
    );
  });
  test("audit record contains correct median value", async () => {
    const mockDb = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const m = new OracleMedianizer([src(100), src(200), src(300)], nullLogger, mockDb);
    await m.aggregate("BTC/USD");
    const [, params] = mockDb.query.mock.calls[0];
    expect(params[5]).toBe(200); // median of [100,200,300]
  });
  test("DB failure does not block resolution", async () => {
    const mockDb = { query: jest.fn().mockRejectedValue(new Error("DB down")) };
    const m = new OracleMedianizer([src(100), src(101), src(99)], nullLogger, mockDb);
    await expect(m.aggregate()).resolves.toBe(100);
  });
  test("no DB provided — skips write, resolves normally", async () => {
    const m = new OracleMedianizer([src(100), src(101), src(99)], nullLogger, null);
    await expect(m.aggregate()).resolves.toBe(100);
  });
  test("passes asset label to DB", async () => {
    const mockDb = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const m = new OracleMedianizer([src(100), src(101), src(99)], nullLogger, mockDb);
    await m.aggregate("ETH/USD");
    const [, params] = mockDb.query.mock.calls[0];
    expect(params[0]).toBe("ETH/USD");
  });
});

// ── CoinMarketCap source ──────────────────────────────────────────────────────

describe("fetchCoinMarketCap()", () => {
  let axios;
  let fetchCoinMarketCap;

  beforeEach(() => {
    jest.resetModules();
    axios = require("axios");
    ({ fetchCoinMarketCap } = require("./sources"));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("throws when CMC_API_KEY is not set", async () => {
    const saved = process.env.CMC_API_KEY;
    delete process.env.CMC_API_KEY;
    await expect(fetchCoinMarketCap()).rejects.toThrow("CMC_API_KEY environment variable is not set");
    if (saved !== undefined) process.env.CMC_API_KEY = saved;
  });

  test("returns price from CMC response", async () => {
    process.env.CMC_API_KEY = "test-key";
    jest.spyOn(axios, "get").mockResolvedValueOnce({
      data: { data: { BTC: { quote: { USD: { price: 97500.5 } } } } },
    });
    const price = await fetchCoinMarketCap();
    expect(price).toBe(97500.5);
    delete process.env.CMC_API_KEY;
  });

  test("passes API key in header, not URL", async () => {
    process.env.CMC_API_KEY = "secret-key-123";
    const getSpy = jest.spyOn(axios, "get").mockResolvedValueOnce({
      data: { data: { BTC: { quote: { USD: { price: 97000 } } } } },
    });
    await fetchCoinMarketCap();
    const [url, config] = getSpy.mock.calls[0];
    expect(url).not.toContain("secret-key-123");
    expect(config.headers["X-CMC_PRO_API_KEY"]).toBe("secret-key-123");
    delete process.env.CMC_API_KEY;
  });

  test("uses 5-second timeout", async () => {
    process.env.CMC_API_KEY = "test-key";
    const getSpy = jest.spyOn(axios, "get").mockResolvedValueOnce({
      data: { data: { BTC: { quote: { USD: { price: 97000 } } } } },
    });
    await fetchCoinMarketCap();
    const [, config] = getSpy.mock.calls[0];
    expect(config.timeout).toBe(5000);
    delete process.env.CMC_API_KEY;
  });
});
