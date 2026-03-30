jest.mock("axios");
jest.mock("./medianizer", () => ({
  OracleMedianizer: jest.fn().mockImplementation(() => ({
    aggregate: jest.fn().mockResolvedValue(95000),
  })),
}));

const axios = require("axios");

// Shared module — reset state before each test to prevent bleed
let oracle;
beforeEach(() => {
  oracle = require("./index");
  oracle._resetState();
  jest.clearAllMocks();
});

// ── Pre-existing suites ───────────────────────────────────────────────────────

describe("Oracle Graceful Shutdown (#223)", () => {
  test("gracefulShutdown logs graceful message", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation();
    const exitSpy = jest.spyOn(process, "exit").mockImplementation();

    await oracle.gracefulShutdown("SIGTERM");

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Oracle shutting down gracefully")
    );

    logSpy.mockRestore();
    exitSpy.mockRestore();
  });

  test("concurrent runs are prevented by isRunning flag", async () => {
    // Make runOracle hang so the second call sees isRunning=true
    axios.get.mockImplementation(() => new Promise(() => {}));
    const warnSpy = jest.spyOn(console, "warn").mockImplementation();

    const p1 = oracle.runOracleGuarded();
    const p2 = oracle.runOracleGuarded(); // should be skipped

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("previous cycle still in progress")
    );

    warnSpy.mockRestore();
    // Don't await p1 — it hangs intentionally; jest forceExit handles cleanup
  });
});

describe("Oracle Default Outcome (#218)", () => {
  test("fetchOutcome throws when no resolver matches", async () => {
    await expect(
      oracle.fetchOutcome({ question: "Who will win the 2025 Ballon d'Or?", outcomes: ["Messi", "Ronaldo"], category_slug: "unknown-category" })
    ).rejects.toThrow("No resolver registered for category");
  });

  test("markUnresolvable calls backend pending-review endpoint", async () => {
    axios.post.mockResolvedValue({ data: { success: true } });

    await oracle.markUnresolvable(123, "some question", "No resolver matched");

    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining("/api/admin/pending-review"),
      expect.objectContaining({ market_id: 123, error_message: "No resolver matched" })
    );
  });

  test("markUnresolvable logs warning on success", async () => {
    axios.post.mockResolvedValue({ data: {} });
    const warnSpy = jest.spyOn(console, "warn").mockImplementation();

    await oracle.markUnresolvable(456, "some question", "test reason");

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("marked for pending review")
    );

    warnSpy.mockRestore();
  });
});

describe("Oracle Deadline Verification (#377)", () => {
  test("markets within 60-second buffer are not resolved", async () => {
    const now = Date.now();
    axios.get.mockResolvedValue({
      data: {
        markets: [
          {
            id: 1,
            question: "Test market",
            end_date: new Date(now + 30_000).toISOString(),
            resolved: false,
            outcomes: ["Yes", "No"],
          },
        ],
      },
    });

    await oracle.runOracle();

    expect(axios.post).not.toHaveBeenCalled();
  });

  test("markets past 60-second buffer are resolved", async () => {
    const now = Date.now();
    axios.get.mockResolvedValue({
      data: {
        markets: [
          {
            id: 1,
            question: "BTC above 100k?",
            end_date: new Date(now - 70_000).toISOString(),
            resolved: false,
            outcomes: ["Yes", "No"],
          },
        ],
      },
    });
    // Mock the resolve POST to succeed
    axios.post.mockResolvedValue({ data: { success: true } });
    const logSpy = jest.spyOn(console, "log").mockImplementation();

    await oracle.runOracle();

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Market #1 resolved")
    );

    logSpy.mockRestore();
  });

  test("deadline not reached errors are logged as warnings", async () => {
    const market = {
      id: 1,
      question: "BTC above 100k?",
      end_date: new Date(Date.now() - 70_000).toISOString(),
      resolved: false,
      outcomes: ["Yes", "No"],
    };
    axios.get.mockResolvedValue({ data: { markets: [market] } });
    axios.post.mockRejectedValue({
      response: { data: { error: "Market deadline not reached" } },
    });
    const warnSpy = jest.spyOn(console, "warn").mockImplementation();

    await oracle.runOracle();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("deadline not reached on-chain")
    );

    warnSpy.mockRestore();
  });
});

// ── Adaptive Polling (#440) ───────────────────────────────────────────────────

describe("Oracle Adaptive Polling (#440)", () => {
  function mockEmpty() {
    axios.get.mockResolvedValue({ data: { markets: [] } });
  }

  function mockExpired() {
    const now = Date.now();
    axios.get.mockResolvedValue({
      data: {
        markets: [
          {
            id: 2,
            question: "BTC above 100k?",
            end_date: new Date(now - 70_000).toISOString(),
            resolved: false,
            outcomes: ["Yes", "No"],
          },
        ],
      },
    });
    axios.post.mockResolvedValue({ data: { success: true } });
  }

  test("returns early with debug log when markets array is empty", async () => {
    mockEmpty();
    const debugSpy = jest.spyOn(console, "debug").mockImplementation();
    const saved = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = "debug";

    await oracle.runOracle();

    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining("No expired markets to resolve")
    );

    process.env.LOG_LEVEL = saved;
    debugSpy.mockRestore();
  });

  test("returns early without calling resolve when no expired markets", async () => {
    const now = Date.now();
    axios.get.mockResolvedValue({
      data: {
        markets: [
          {
            id: 1,
            question: "Q",
            end_date: new Date(now + 30_000).toISOString(),
            resolved: false,
            outcomes: ["Yes", "No"],
          },
        ],
      },
    });

    await oracle.runOracle();

    expect(axios.post).not.toHaveBeenCalled();
  });

  test("consecutiveEmptyRuns increments on each empty run", async () => {
    mockEmpty();

    await oracle.runOracle();
    expect(oracle._getConsecutiveEmptyRuns()).toBe(1);

    await oracle.runOracle();
    expect(oracle._getConsecutiveEmptyRuns()).toBe(2);
  });

  test("interval handle is replaced after 3 consecutive empty runs", async () => {
    jest.useFakeTimers();
    mockEmpty();

    const handleBefore = oracle._getIntervalHandle();

    await oracle.runOracle(); // 1
    await oracle.runOracle(); // 2
    await oracle.runOracle(); // 3 — triggers backoff reschedule

    const handleAfter = oracle._getIntervalHandle();
    // A new interval was created (different reference or null→set)
    expect(handleAfter).not.toBe(handleBefore);

    jest.useRealTimers();
  });

  test("consecutiveEmptyRuns resets to 0 when a market is found", async () => {
    mockEmpty();
    await oracle.runOracle();
    await oracle.runOracle();
    await oracle.runOracle(); // enter backoff

    mockExpired();
    await oracle.runOracle();

    expect(oracle._getConsecutiveEmptyRuns()).toBe(0);
  });

  test("no backoff before threshold: consecutiveEmptyRuns stays below 3", async () => {
    mockEmpty();

    await oracle.runOracle(); // 1
    await oracle.runOracle(); // 2

    expect(oracle._getConsecutiveEmptyRuns()).toBe(2);
    // Backoff threshold not yet reached
    expect(oracle._getConsecutiveEmptyRuns()).toBeLessThan(oracle.BACKOFF_THRESHOLD);
  });
});

// ── Circuit Breaker (#587) ────────────────────────────────────────────────────

describe("Oracle Circuit Breaker (#587)", () => {
  function mockHealthOk() {
    axios.get.mockImplementation((url) => {
      if (url.includes("/api/health/oracle")) return Promise.resolve({ data: { status: "ok" } });
      return Promise.resolve({ data: { markets: [] } });
    });
  }

  function mockBackendDown() {
    axios.get.mockRejectedValue(new Error("ECONNREFUSED"));
  }

  test("consecutiveFailures increments on each failed cycle", async () => {
    mockBackendDown();
    await oracle.runOracle();
    expect(oracle._getConsecutiveFailures()).toBe(1);
    await oracle.runOracle();
    expect(oracle._getConsecutiveFailures()).toBe(2);
  });

  test("admin alert sent after 3 consecutive failures", async () => {
    mockBackendDown();
    const warnSpy = jest.spyOn(console, "warn").mockImplementation();
    const errorSpy = jest.spyOn(console, "error").mockImplementation();

    await oracle.runOracle(); // 1
    await oracle.runOracle(); // 2
    await oracle.runOracle(); // 3 — alert

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("consecutive failures — sending admin alert")
    );

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test("circuit breaker opens after 10 consecutive failures", async () => {
    mockBackendDown();
    const errorSpy = jest.spyOn(console, "error").mockImplementation();

    for (let i = 0; i < 10; i++) {
      await oracle.runOracle();
    }

    expect(oracle._getCircuitOpen()).toBe(true);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Circuit breaker tripped")
    );

    errorSpy.mockRestore();
  });

  test("circuit open skips execution", async () => {
    mockBackendDown();
    const errorSpy = jest.spyOn(console, "error").mockImplementation();

    for (let i = 0; i < 10; i++) await oracle.runOracle();

    // Reset call count
    axios.get.mockClear();
    await oracle.runOracle(); // should be skipped

    expect(axios.get).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  test("consecutiveFailures resets to 0 on successful cycle", async () => {
    mockBackendDown();
    const errorSpy = jest.spyOn(console, "error").mockImplementation();
    await oracle.runOracle();
    await oracle.runOracle();
    expect(oracle._getConsecutiveFailures()).toBe(2);

    mockHealthOk();
    await oracle.runOracle();
    expect(oracle._getConsecutiveFailures()).toBe(0);

    errorSpy.mockRestore();
  });
});
