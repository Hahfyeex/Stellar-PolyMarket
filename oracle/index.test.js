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
