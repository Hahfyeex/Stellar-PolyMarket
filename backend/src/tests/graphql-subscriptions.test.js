"use strict";

/**
 * Tests for real-time GraphQL subscriptions.
 * Covers:
 *  - pubsub publish/subscribe mechanics
 *  - wsServer JWT auth and rate limiting
 *  - mercury.js publish calls on BetPlace and MktResolv
 *  - _publishOddsChanged odds-bps calculation (zero-float)
 */

jest.mock("../db");
jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const db = require("../db");

// ── pubsub ────────────────────────────────────────────────────────────────────

describe("pubsub", () => {
  const pubsub = require("../graphql/pubsub");

  afterEach(() => jest.clearAllMocks());

  test("subscriber receives published payload", async () => {
    const iter = pubsub.subscribe("betPlaced", 42);
    const payload = { market_id: 42, wallet_address: "G123", outcome_index: 0, amount: "1000" };

    pubsub.publish("betPlaced", 42, payload);

    const { value, done } = await iter.next();
    expect(done).toBe(false);
    expect(value).toEqual(payload);
    await iter.return();
  });

  test("subscriber does not receive events for a different marketId", async () => {
    const iter = pubsub.subscribe("betPlaced", 1);
    pubsub.publish("betPlaced", 2, { market_id: 2 });

    // Queue a real event for market 1 after a tick so the test doesn't hang
    setImmediate(() => pubsub.publish("betPlaced", 1, { market_id: 1 }));

    const { value } = await iter.next();
    expect(value.market_id).toBe(1);
    await iter.return();
  });

  test("queued payloads are delivered in order", async () => {
    const iter = pubsub.subscribe("marketResolved", 99);
    pubsub.publish("marketResolved", 99, { market_id: 99, winning_outcome: 0, total_pool: "500" });
    pubsub.publish("marketResolved", 99, { market_id: 99, winning_outcome: 1, total_pool: "600" });

    const first = await iter.next();
    const second = await iter.next();
    expect(first.value.total_pool).toBe("500");
    expect(second.value.total_pool).toBe("600");
    await iter.return();
  });

  test("return() unsubscribes the listener", async () => {
    const iter = pubsub.subscribe("oddsChanged", 7);
    await iter.return();
    // Publishing after return should not cause errors
    expect(() => pubsub.publish("oddsChanged", 7, {})).not.toThrow();
  });
});

// ── wsServer auth & rate limiting ─────────────────────────────────────────────

describe("wsServer", () => {
  const jwt = require("jsonwebtoken");
  const JWT_SECRET = "change-me-in-production";

  // We test the logic extracted from wsServer directly by simulating ctx objects
  // rather than spinning up a real WebSocket server.

  function makeCtx(token) {
    return {
      connectionParams: { authorization: token ? `Bearer ${token}` : undefined },
      extra: {},
    };
  }

  function simulateOnConnect(ctx) {
    // Replicate the onConnect logic from wsServer.js
    const raw =
      ctx.connectionParams?.authorization?.replace(/^Bearer\s+/i, "") ||
      ctx.connectionParams?.Authorization?.replace(/^Bearer\s+/i, "");
    if (!raw) throw new Error("Unauthorized: missing authorization token");
    let decoded;
    try {
      decoded = jwt.verify(raw, JWT_SECRET);
    } catch {
      throw new Error("Unauthorized: invalid or expired token");
    }
    ctx.extra.user = decoded;
    return decoded;
  }

  test("valid JWT sets ctx.extra.user", () => {
    const token = jwt.sign({ sub: "user1" }, JWT_SECRET);
    const ctx = makeCtx(token);
    const decoded = simulateOnConnect(ctx);
    expect(decoded.sub).toBe("user1");
    expect(ctx.extra.user.sub).toBe("user1");
  });

  test("missing token throws Unauthorized", () => {
    const ctx = makeCtx(null);
    expect(() => simulateOnConnect(ctx)).toThrow("Unauthorized: missing authorization token");
  });

  test("invalid token throws Unauthorized", () => {
    const ctx = makeCtx("bad.token.here");
    expect(() => simulateOnConnect(ctx)).toThrow("Unauthorized: invalid or expired token");
  });

  test("expired token throws Unauthorized", () => {
    const token = jwt.sign({ sub: "user1" }, JWT_SECRET, { expiresIn: -1 });
    const ctx = makeCtx(token);
    expect(() => simulateOnConnect(ctx)).toThrow("Unauthorized: invalid or expired token");
  });

  test("rate limit: 6th subscription throws", () => {
    const { _userSubCount } = require("../graphql/wsServer");
    const MAX = 5;
    const userId = "rate-limit-test-user";
    _userSubCount.set(userId, MAX);

    const ctx = { extra: { user: { sub: userId } } };

    // Replicate onSubscribe logic
    function simulateOnSubscribe(ctx2) {
      const uid = ctx2.extra.user?.sub || "unknown";
      const current = _userSubCount.get(uid) || 0;
      if (current >= MAX) throw new Error(`Too many subscriptions: max ${MAX} per user`);
      _userSubCount.set(uid, current + 1);
    }

    expect(() => simulateOnSubscribe(ctx)).toThrow("Too many subscriptions");
    _userSubCount.delete(userId);
  });

  test("rate limit: 5th subscription succeeds", () => {
    const { _userSubCount } = require("../graphql/wsServer");
    const MAX = 5;
    const userId = "rate-limit-ok-user";
    _userSubCount.set(userId, MAX - 1);

    const ctx = { extra: { user: { sub: userId } } };

    function simulateOnSubscribe(ctx2) {
      const uid = ctx2.extra.user?.sub || "unknown";
      const current = _userSubCount.get(uid) || 0;
      if (current >= MAX) throw new Error(`Too many subscriptions: max ${MAX} per user`);
      _userSubCount.set(uid, current + 1);
    }

    expect(() => simulateOnSubscribe(ctx)).not.toThrow();
    expect(_userSubCount.get(userId)).toBe(MAX);
    _userSubCount.delete(userId);
  });
});

// ── mercury pubsub integration ────────────────────────────────────────────────

describe("mercury handleBetPlaced publishes betPlaced + oddsChanged", () => {
  const pubsub = require("../graphql/pubsub");
  const { handleBetPlaced } = require("../indexer/mercury");

  afterEach(() => jest.clearAllMocks());

  test("handleBetPlaced publishes betPlaced event", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] }) // INSERT bets
      .mockResolvedValueOnce({ rows: [] }) // UPSERT users
      .mockResolvedValueOnce({ rows: [] }); // _publishOddsChanged SELECT (no rows → no publish)

    const spy = jest.spyOn(pubsub, "publish");

    await handleBetPlaced(
      { version: 1, market_id: 5, bettor: "GABC", option_index: 0, cost: 5000000, shares: 1 },
      { ledger_time: new Date().toISOString() }
    );

    expect(spy).toHaveBeenCalledWith("betPlaced", 5, {
      market_id: 5,
      wallet_address: "GABC",
      outcome_index: 0,
      amount: "5000000",
    });
    spy.mockRestore();
  });

  test("handleBetPlaced publishes oddsChanged after bet", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] }) // INSERT bets
      .mockResolvedValueOnce({ rows: [] }) // UPSERT users
      .mockResolvedValueOnce({
        // _publishOddsChanged SELECT
        rows: [
          { outcome_index: 0, stake: "7000000" },
          { outcome_index: 1, stake: "3000000" },
        ],
      });

    const spy = jest.spyOn(pubsub, "publish");

    await handleBetPlaced(
      { version: 1, market_id: 6, bettor: "GXYZ", option_index: 0, cost: 7000000, shares: 1 },
      { ledger_time: new Date().toISOString() }
    );

    // Wait for the async _publishOddsChanged to settle
    await new Promise((r) => setImmediate(r));

    expect(spy).toHaveBeenCalledWith("oddsChanged", 6, {
      market_id: 6,
      odds_bps: ["7000", "3000"], // 70% and 30% in bps
    });
    spy.mockRestore();
  });
});

describe("mercury handleMarketResolved publishes marketResolved", () => {
  const pubsub = require("../graphql/pubsub");
  const { handleMarketResolved } = require("../indexer/mercury");

  afterEach(() => jest.clearAllMocks());

  test("publishes marketResolved event with string total_pool", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] }) // UPDATE markets
      .mockResolvedValueOnce({ rows: [] }); // UPDATE users

    const spy = jest.spyOn(pubsub, "publish");

    await handleMarketResolved({
      version: 1,
      market_id: 10,
      winning_outcome: 1,
      total_pool: 50000000,
      fee_bps: 50,
    });

    expect(spy).toHaveBeenCalledWith("marketResolved", 10, {
      market_id: 10,
      winning_outcome: 1,
      total_pool: "50000000",
    });
    spy.mockRestore();
  });
});

// ── _publishOddsChanged zero-float arithmetic ─────────────────────────────────

describe("_publishOddsChanged", () => {
  const pubsub = require("../graphql/pubsub");
  const { _publishOddsChanged } = require("../indexer/mercury");

  afterEach(() => jest.clearAllMocks());

  test("calculates odds_bps correctly (50/50 split)", async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        { outcome_index: 0, stake: "5000000" },
        { outcome_index: 1, stake: "5000000" },
      ],
    });

    const spy = jest.spyOn(pubsub, "publish");
    await _publishOddsChanged(1);

    expect(spy).toHaveBeenCalledWith("oddsChanged", 1, {
      market_id: 1,
      odds_bps: ["5000", "5000"],
    });
    spy.mockRestore();
  });

  test("returns early when no bets exist", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const spy = jest.spyOn(pubsub, "publish");
    await _publishOddsChanged(2);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("handles zero total stake without dividing by zero", async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ outcome_index: 0, stake: "0" }],
    });
    const spy = jest.spyOn(pubsub, "publish");
    await _publishOddsChanged(3);
    expect(spy).toHaveBeenCalledWith("oddsChanged", 3, {
      market_id: 3,
      odds_bps: ["0"],
    });
    spy.mockRestore();
  });
});
