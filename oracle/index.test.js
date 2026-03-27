const axios = require("axios");
const { fetchOutcome, markUnresolvable, shutdown, _getIsRunning } = require("./index");

jest.mock("axios");

describe("Oracle Graceful Shutdown (#223)", () => {
  test("shutdown logs graceful message", () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation();
    const exitSpy = jest.spyOn(process, "exit").mockImplementation();
    
    shutdown("SIGTERM");
    
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Oracle shutting down gracefully"));
    
    logSpy.mockRestore();
    exitSpy.mockRestore();
  });

  test("concurrent runs are prevented by isRunning flag", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation();
    const { runOracleGuarded } = require("./index");
    
    // Simulate concurrent call
    const promise1 = runOracleGuarded();
    const promise2 = runOracleGuarded();
    
    await Promise.all([promise1, promise2]);
    
    // Second call should be skipped
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("previous cycle still in progress"));
    
    warnSpy.mockRestore();
  });
});

describe("Oracle Default Outcome (#218)", () => {
  test("fetchOutcome throws when no resolver matches", async () => {
    await expect(fetchOutcome("Who will win the 2025 Ballon d'Or?", ["Messi", "Ronaldo"]))
      .rejects
      .toThrow("No resolver matched");
  });

  test("markUnresolvable calls backend endpoint", async () => {
    axios.post.mockResolvedValue({ data: { success: true } });
    
    await markUnresolvable(123, "No resolver matched");
    
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining("/api/markets/123/unresolvable"),
      { reason: "No resolver matched" }
    );
  });

  test("markUnresolvable logs warning on success", async () => {
    axios.post.mockResolvedValue({ data: {} });
    const warnSpy = jest.spyOn(console, "warn").mockImplementation();
    
    await markUnresolvable(456, "test reason");
    
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("marked unresolvable"));
    
    warnSpy.mockRestore();
  });
});

describe("Oracle Deadline Verification (#377)", () => {
  test("markets within 60-second buffer are not resolved", async () => {
    const now = Date.now();
    const market = {
      id: 1,
      question: "Test market",
      end_date: new Date(now + 30_000).toISOString(), // 30 seconds in future
      resolved: false,
      outcomes: ["Yes", "No"]
    };

    axios.get.mockResolvedValue({ data: { markets: [market] } });
    const logSpy = jest.spyOn(console, "log").mockImplementation();

    const { runOracle } = require("./index");
    await runOracle();

    // Market should not be in the expired list due to 60-second buffer
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Found 0 market(s) to resolve"));

    logSpy.mockRestore();
  });

  test("markets past 60-second buffer are resolved", async () => {
    const now = Date.now();
    const market = {
      id: 1,
      question: "Test market",
      end_date: new Date(now - 70_000).toISOString(), // 70 seconds in past
      resolved: false,
      outcomes: ["Yes", "No"]
    };

    axios.get.mockResolvedValue({ data: { markets: [market] } });
    axios.post.mockResolvedValue({ data: { success: true } });
    const logSpy = jest.spyOn(console, "log").mockImplementation();

    const { runOracle } = require("./index");
    await runOracle();

    // Market should be in the expired list
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Found 1 market(s) to resolve"));

    logSpy.mockRestore();
  });

  test("deadline not reached errors are logged as warnings and retried", async () => {
    const market = {
      id: 1,
      question: "Test market",
      end_date: new Date(Date.now() - 70_000).toISOString(),
      resolved: false,
      outcomes: ["Yes", "No"]
    };

    axios.get.mockResolvedValue({ data: { markets: [market] } });
    axios.post.mockRejectedValue({
      response: { data: { error: "Market deadline not reached" } }
    });
    const warnSpy = jest.spyOn(console, "warn").mockImplementation();

    const { runOracle } = require("./index");
    await runOracle();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("deadline not reached on-chain"));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("retrying in 5 minutes"));

    warnSpy.mockRestore();
  });
});
