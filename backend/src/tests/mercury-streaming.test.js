"use strict";

/**
 * Unit tests for Mercury Indexer event handlers.
 * Covers: BET_PLACED and MARKET_RESOLVED event handling,
 * WebSocket broadcasts, and reconnection logic.
 */

jest.mock("../db");
jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock("../graphql/pubsub", () => ({ publish: jest.fn() }));
jest.mock("../websocket/marketUpdates", () => ({
  broadcastBetPlaced: jest.fn(),
  broadcastMarketResolved: jest.fn(),
  broadcastOddsChanged: jest.fn(),
}));

const db = require("../db");
const pubsub = require("../graphql/pubsub");
const ws = require("../websocket/marketUpdates");
const mercury = require("../indexer/mercury");

const META = { ledger_seq: 100, ledger_time: "2026-01-01T00:00:00Z" };

describe("Mercury Indexer — handleBetPlaced", () => {
  beforeEach(() => jest.clearAllMocks());

  const payload = {
    version: 1,
    market_id: 42,
    bettor: "WALLET_ABC",
    option_index: 0,
    cost: 1000,
    shares: 500,
  };

  it("inserts bet into DB", async () => {
    db.query.mockResolvedValue({ rows: [] });
    await mercury.handleBetPlaced(payload, META);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO bets"),
      expect.arrayContaining([42, "WALLET_ABC", 0, 1000, 500])
    );
  });

  it("upserts user stats", async () => {
    db.query.mockResolvedValue({ rows: [] });
    await mercury.handleBetPlaced(payload, META);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO users"),
      expect.arrayContaining(["WALLET_ABC", 1000])
    );
  });

  it("publishes to GraphQL pubsub", async () => {
    db.query.mockResolvedValue({ rows: [] });
    await mercury.handleBetPlaced(payload, META);
    expect(pubsub.publish).toHaveBeenCalledWith(
      "betPlaced",
      42,
      expect.objectContaining({ market_id: 42, wallet_address: "WALLET_ABC" })
    );
  });

  it("broadcasts WebSocket BET_PLACED event", async () => {
    db.query.mockResolvedValue({ rows: [] });
    await mercury.handleBetPlaced(payload, META);
    expect(ws.broadcastBetPlaced).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ market_id: 42, wallet_address: "WALLET_ABC" })
    );
  });

  it("throws on unsupported version", async () => {
    await expect(mercury.handleBetPlaced({ ...payload, version: 99 }, META)).rejects.toThrow(
      /Unsupported schema version/
    );
  });
});

describe("Mercury Indexer — handleMarketResolved", () => {
  beforeEach(() => jest.clearAllMocks());

  const payload = {
    version: 1,
    market_id: 7,
    winning_outcome: 1,
    total_pool: 50000,
    fee_bps: 200,
  };

  it("updates market resolved status in DB", async () => {
    db.query.mockResolvedValue({ rows: [] });
    await mercury.handleMarketResolved(payload);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("resolved = true"),
      expect.arrayContaining([1, 50000, 200, 7])
    );
  });

  it("credits winners in DB", async () => {
    db.query.mockResolvedValue({ rows: [] });
    await mercury.handleMarketResolved(payload);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("total_won"),
      expect.arrayContaining([7, 1])
    );
  });

  it("publishes to GraphQL pubsub", async () => {
    db.query.mockResolvedValue({ rows: [] });
    await mercury.handleMarketResolved(payload);
    expect(pubsub.publish).toHaveBeenCalledWith(
      "marketResolved",
      7,
      expect.objectContaining({ market_id: 7, winning_outcome: 1 })
    );
  });

  it("broadcasts WebSocket MARKET_RESOLVED event", async () => {
    db.query.mockResolvedValue({ rows: [] });
    await mercury.handleMarketResolved(payload);
    expect(ws.broadcastMarketResolved).toHaveBeenCalledWith(7, 1);
  });

  it("throws on unsupported version", async () => {
    await expect(mercury.handleMarketResolved({ ...payload, version: 0 })).rejects.toThrow(
      /Unsupported schema version/
    );
  });
});

describe("Mercury Indexer — startEventStream reconnection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    mercury.stopEventStream();
  });

  it("stops streaming when stopEventStream is called", async () => {
    // Immediately stop — stream should not make any axios calls
    mercury.stopEventStream();
    // startEventStream checks _streamActive before looping
    const streamPromise = mercury.startEventStream();
    await Promise.resolve(); // flush microtasks
    mercury.stopEventStream();
    await streamPromise;
    // No DB calls should have been made
    expect(db.query).not.toHaveBeenCalled();
  });
});
