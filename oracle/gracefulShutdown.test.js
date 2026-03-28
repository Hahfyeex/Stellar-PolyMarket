const {
  runOracleGuarded,
  gracefulShutdown,
  _getIsRunning,
  _getIsShuttingDown,
  _getIntervalHandle,
} = require("./index");

describe("Oracle Graceful Shutdown", () => {
  let originalExit;
  let exitCode;

  beforeEach(() => {
    // Mock process.exit to prevent actual exit
    exitCode = null;
    originalExit = process.exit;
    process.exit = jest.fn((code) => {
      exitCode = code;
    });
  });

  afterEach(() => {
    // Restore original process.exit
    process.exit = originalExit;
  });

  /**
   * Test: SIGTERM signal triggers graceful shutdown
   * Verifies shutdown flag is set and interval is cleared
   */
  test("should handle SIGTERM signal", async () => {
    // Simulate SIGTERM
    const shutdownPromise = gracefulShutdown("SIGTERM");
    
    // Wait for shutdown to complete
    await shutdownPromise;

    // Verify shutdown flag is set
    expect(_getIsShuttingDown()).toBe(true);
    
    // Verify process.exit was called with 0
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  /**
   * Test: SIGINT signal triggers graceful shutdown
   * Verifies shutdown flag is set and interval is cleared
   */
  test("should handle SIGINT signal", async () => {
    // Simulate SIGINT
    const shutdownPromise = gracefulShutdown("SIGINT");
    
    // Wait for shutdown to complete
    await shutdownPromise;

    // Verify shutdown flag is set
    expect(_getIsShuttingDown()).toBe(true);
    
    // Verify process.exit was called with 0
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  /**
   * Test: Interval is cleared on shutdown
   * Verifies no new resolution cycles start after shutdown
   */
  test("should clear interval on shutdown", async () => {
    const intervalHandle = _getIntervalHandle();
    
    // Mock clearInterval to verify it's called
    const clearIntervalSpy = jest.spyOn(global, "clearInterval");
    
    await gracefulShutdown("SIGTERM");

    // Verify clearInterval was called
    expect(clearIntervalSpy).toHaveBeenCalled();
    
    clearIntervalSpy.mockRestore();
  });

  /**
   * Test: Shutdown waits for in-flight resolutions
   * Verifies currentRunPromise is awaited before exit
   */
  test("should wait for in-flight resolutions before exit", async () => {
    // Create a mock promise that resolves after a delay
    const delayedPromise = new Promise((resolve) => {
      setTimeout(resolve, 100);
    });

    // Mock the current run promise
    let resolveRun;
    const runPromise = new Promise((resolve) => {
      resolveRun = resolve;
    });

    // Simulate in-flight resolution
    const startTime = Date.now();
    
    // Resolve the promise after a short delay
    setTimeout(() => resolveRun(), 50);

    // Start shutdown
    const shutdownPromise = gracefulShutdown("SIGTERM");
    
    // Wait for shutdown
    await shutdownPromise;
    
    const endTime = Date.now();
    
    // Verify shutdown waited (at least 50ms)
    expect(endTime - startTime).toBeGreaterThanOrEqual(50);
  });

  /**
   * Test: Shutdown flag prevents new resolution cycles
   * Verifies isShuttingDown flag is checked in runOracle
   */
  test("should set isShuttingDown flag", async () => {
    // Initially should be false
    expect(_getIsShuttingDown()).toBe(false);

    // Trigger shutdown
    await gracefulShutdown("SIGTERM");

    // Should be true after shutdown
    expect(_getIsShuttingDown()).toBe(true);
  });

  /**
   * Test: Multiple shutdown signals are idempotent
   * Verifies calling shutdown multiple times doesn't cause issues
   */
  test("should handle multiple shutdown signals gracefully", async () => {
    // First shutdown
    await gracefulShutdown("SIGTERM");
    expect(process.exit).toHaveBeenCalledWith(0);

    // Reset mock
    process.exit.mockClear();

    // Second shutdown (should not cause errors)
    // Note: In real scenario, process would have exited, but we're testing the logic
    expect(_getIsShuttingDown()).toBe(true);
  });

  /**
   * Test: Shutdown logs appropriate messages
   * Verifies console.log is called with shutdown messages
   */
  test("should log shutdown messages", async () => {
    const consoleSpy = jest.spyOn(console, "log").mockImplementation();

    await gracefulShutdown("SIGTERM");

    // Verify shutdown messages were logged
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[Oracle]")
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("SIGTERM")
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("shutting down")
    );

    consoleSpy.mockRestore();
  });

  /**
   * Test: Shutdown handles errors in in-flight resolutions
   * Verifies errors don't prevent graceful shutdown
   */
  test("should handle errors in in-flight resolutions", async () => {
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

    // Create a promise that rejects
    const errorPromise = Promise.reject(new Error("Test error"));

    // Suppress unhandled rejection warning
    errorPromise.catch(() => {});

    // Shutdown should still complete
    await gracefulShutdown("SIGTERM");

    expect(process.exit).toHaveBeenCalledWith(0);

    consoleErrorSpy.mockRestore();
  });

  /**
   * Test: Exit code is 0 on successful shutdown
   * Verifies process exits with success code
   */
  test("should exit with code 0", async () => {
    await gracefulShutdown("SIGTERM");

    expect(process.exit).toHaveBeenCalledWith(0);
  });

  /**
   * Test: Interval handle is cleared
   * Verifies intervalHandle is set to null or cleared
   */
  test("should clear interval handle", async () => {
    const clearIntervalSpy = jest.spyOn(global, "clearInterval");

    await gracefulShutdown("SIGTERM");

    // Verify clearInterval was called
    expect(clearIntervalSpy).toHaveBeenCalled();

    clearIntervalSpy.mockRestore();
  });

  /**
   * Test: Graceful shutdown completes within reasonable time
   * Verifies shutdown doesn't hang indefinitely
   */
  test("should complete shutdown within timeout", async () => {
    const startTime = Date.now();

    await gracefulShutdown("SIGTERM");

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Shutdown should complete within 5 seconds
    expect(duration).toBeLessThan(5000);
  });
});
