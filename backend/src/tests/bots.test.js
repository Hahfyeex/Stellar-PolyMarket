"use strict";

// Mock logger to suppress output and allow assertions
jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Use a real EventEmitter as the event bus mock — allowed because it's a
// top-level jest.mock with a factory that only references allowed globals.
jest.mock("../bots/eventBus", () => {
  const { EventEmitter } = require("events");
  const bus = new EventEmitter();
  bus.setMaxListeners(50);
  return bus;
});

const eventBus = require("../bots/eventBus");
const BotStrategy = require("../bots/BotStrategy");
const SeedLiquidityBot = require("../bots/SeedLiquidityBot");
const DepthGuardBot = require("../bots/DepthGuardBot");
const logger = require("../utils/logger");

// Remove all listeners between tests to prevent cross-test interference
afterEach(() => {
  eventBus.removeAllListeners();
  jest.clearAllMocks();
});

// ── BotStrategy base class ────────────────────────────────────────────────

describe("BotStrategy", () => {
  test("registers listener on the event bus", () => {
    class TestBot extends BotStrategy {
      constructor() { super("TestBot"); this.register(["market.created"]); }
      async execute() {}
    }
    new TestBot();
    expect(eventBus.listenerCount("market.created")).toBe(1);
  });

  test("calls execute when event fires and shouldTrigger returns true", async () => {
    const executeMock = jest.fn().mockResolvedValue();
    class TestBot extends BotStrategy {
      constructor() { super("TestBot"); this.register(["market.created"]); }
      shouldTrigger() { return true; }
      async execute(id, payload) { executeMock(id, payload); }
    }
    new TestBot();
    eventBus.emit("market.created", { marketId: 1, outcomes: ["Yes", "No"] });
    await Promise.resolve();
    expect(executeMock).toHaveBeenCalledWith(1, expect.objectContaining({ marketId: 1 }));
  });

  test("does NOT call execute when shouldTrigger returns false", async () => {
    const executeMock = jest.fn();
    class TestBot extends BotStrategy {
      constructor() { super("TestBot"); this.register(["market.created"]); }
      shouldTrigger() { return false; }
      async execute() { executeMock(); }
    }
    new TestBot();
    eventBus.emit("market.created", { marketId: 1 });
    await Promise.resolve();
    expect(executeMock).not.toHaveBeenCalled();
  });

  test("kill-switch prevents execution", async () => {
    const executeMock = jest.fn();
    class TestBot extends BotStrategy {
      constructor() { super("TestBot"); this.register(["market.created"]); }
      async execute() { executeMock(); }
    }
    const bot = new TestBot();
    bot.killSwitch = true;
    eventBus.emit("market.created", { marketId: 1 });
    await Promise.resolve();
    expect(executeMock).not.toHaveBeenCalled();
  });

  test("kill-switch on one instance does not affect another instance", async () => {
    const exec1 = jest.fn();
    const exec2 = jest.fn();
    class TestBot extends BotStrategy {
      constructor(fn) { super("TestBot"); this._fn = fn; this.register(["market.created"]); }
      async execute() { this._fn(); }
    }
    const bot1 = new TestBot(exec1);
    const bot2 = new TestBot(exec2);
    bot1.killSwitch = true;
    eventBus.emit("market.created", { marketId: 1 });
    await Promise.resolve();
    expect(exec1).not.toHaveBeenCalled();
    expect(exec2).toHaveBeenCalled();
  });

  test("logs error but does not throw when execute rejects", async () => {
    class TestBot extends BotStrategy {
      constructor() { super("TestBot"); this.register(["market.created"]); }
      async execute() { throw new Error("boom"); }
    }
    new TestBot();
    eventBus.emit("market.created", { marketId: 1 });
    await Promise.resolve();
    expect(logger.error).toHaveBeenCalled();
  });

  test("can register on multiple events", () => {
    class TestBot extends BotStrategy {
      constructor() { super("TestBot"); this.register(["market.created", "pool.low"]); }
      async execute() {}
    }
    new TestBot();
    expect(eventBus.listenerCount("market.created")).toBe(1);
    expect(eventBus.listenerCount("pool.low")).toBe(1);
  });
});

// ── SeedLiquidityBot ──────────────────────────────────────────────────────

describe("SeedLiquidityBot", () => {
  test("registers on market.created", () => {
    new SeedLiquidityBot();
    expect(eventBus.listenerCount("market.created")).toBe(1);
  });

  test("shouldTrigger always returns true", () => {
    const bot = new SeedLiquidityBot();
    expect(bot.shouldTrigger({})).toBe(true);
    expect(bot.shouldTrigger({ totalPool: 0 })).toBe(true);
  });

  test("execute logs one entry per outcome", async () => {
    const bot = new SeedLiquidityBot({ stakePerOutcome: 5 });
    await bot.execute(42, { outcomes: ["Yes", "No"] });
    const seedCalls = logger.info.mock.calls.filter(([ctx]) => ctx?.action === "seed_bet");
    expect(seedCalls).toHaveLength(2);
    expect(seedCalls[0][0]).toMatchObject({ marketId: 42, outcomeIndex: 0, amount: 5 });
    expect(seedCalls[1][0]).toMatchObject({ marketId: 42, outcomeIndex: 1, amount: 5 });
  });

  test("uses default stakePerOutcome of 10", () => {
    const bot = new SeedLiquidityBot();
    expect(bot.config.stakePerOutcome).toBe(10);
  });

  test("accepts custom config", () => {
    const bot = new SeedLiquidityBot({ stakePerOutcome: 25, walletAddress: "CUSTOM" });
    expect(bot.config.stakePerOutcome).toBe(25);
    expect(bot.config.walletAddress).toBe("CUSTOM");
  });

  test("handles empty outcomes array without error", async () => {
    const bot = new SeedLiquidityBot();
    await expect(bot.execute(1, { outcomes: [] })).resolves.toBeUndefined();
  });

  test("fires via event bus end-to-end", async () => {
    new SeedLiquidityBot({ stakePerOutcome: 10 });
    eventBus.emit("market.created", { marketId: 99, outcomes: ["Yes", "No", "Maybe"] });
    await Promise.resolve();
    const seedCalls = logger.info.mock.calls.filter(([ctx]) => ctx?.action === "seed_bet");
    expect(seedCalls).toHaveLength(3);
  });
});

// ── DepthGuardBot ─────────────────────────────────────────────────────────

describe("DepthGuardBot", () => {
  test("registers on pool.low", () => {
    new DepthGuardBot();
    expect(eventBus.listenerCount("pool.low")).toBe(1);
  });

  test("shouldTrigger returns true when pool is below threshold", () => {
    const bot = new DepthGuardBot({ minPoolThreshold: 50 });
    expect(bot.shouldTrigger({ totalPool: 30 })).toBe(true);
    expect(bot.shouldTrigger({ totalPool: 0 })).toBe(true);
  });

  test("shouldTrigger returns false when pool meets or exceeds threshold", () => {
    const bot = new DepthGuardBot({ minPoolThreshold: 50 });
    expect(bot.shouldTrigger({ totalPool: 50 })).toBe(false);
    expect(bot.shouldTrigger({ totalPool: 100 })).toBe(false);
  });

  test("execute logs top-up action", async () => {
    const bot = new DepthGuardBot({ minPoolThreshold: 50, topUpAmount: 20 });
    await bot.execute(7, { totalPool: 10, threshold: 50 });
    const topUpCalls = logger.info.mock.calls.filter(([ctx]) => ctx?.action === "top_up");
    expect(topUpCalls).toHaveLength(1);
    expect(topUpCalls[0][0]).toMatchObject({ marketId: 7, topUpAmount: 20, currentPool: 10 });
  });

  test("uses default config values", () => {
    const bot = new DepthGuardBot();
    expect(bot.config.minPoolThreshold).toBe(50);
    expect(bot.config.topUpAmount).toBe(20);
  });

  test("does not execute when pool is above threshold (end-to-end via bus)", async () => {
    new DepthGuardBot({ minPoolThreshold: 50 });
    eventBus.emit("pool.low", { marketId: 1, totalPool: 80, threshold: 50 });
    await Promise.resolve();
    const topUpCalls = logger.info.mock.calls.filter(([ctx]) => ctx?.action === "top_up");
    expect(topUpCalls).toHaveLength(0);
  });

  test("fires via event bus end-to-end when pool is low", async () => {
    new DepthGuardBot({ minPoolThreshold: 50, topUpAmount: 15 });
    eventBus.emit("pool.low", { marketId: 5, totalPool: 20, threshold: 50 });
    await Promise.resolve();
    const topUpCalls = logger.info.mock.calls.filter(([ctx]) => ctx?.action === "top_up");
    expect(topUpCalls).toHaveLength(1);
  });

  test("kill-switch stops DepthGuardBot", async () => {
    const bot = new DepthGuardBot({ minPoolThreshold: 50 });
    bot.killSwitch = true;
    eventBus.emit("pool.low", { marketId: 1, totalPool: 10, threshold: 50 });
    await Promise.resolve();
    const topUpCalls = logger.info.mock.calls.filter(([ctx]) => ctx?.action === "top_up");
    expect(topUpCalls).toHaveLength(0);
  });
});
