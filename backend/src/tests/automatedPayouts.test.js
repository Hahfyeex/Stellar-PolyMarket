"use strict";

const db = require("../../db");
const { processAutomatedPayouts } = require("../../jobs/automatedPayouts");
const payoutService = require("../../services/payoutService");
const notifications = require("../../utils/notifications");

jest.mock("../../db");
jest.mock("../../services/payoutService");
jest.mock("../../utils/notifications");
jest.mock("../../utils/logger");

describe("Automated Payouts Job", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should process eligible markets and update payout_distributed and audit_logs", async () => {
    // Mock db.query for finding markets
    db.query.mockResolvedValueOnce({
      rows: [{ id: 1, question: "Will BTC hit 100k?" }],
    });

    // Mock distributePayouts response
    payoutService.distributePayouts.mockResolvedValue({
      payouts: [],
      winnersCount: 5,
      totalDistributed: 100,
      totalPool: 200,
      winningStake: 50,
    });

    // Mock db.query for UPDATE markets
    db.query.mockResolvedValueOnce({ rowCount: 1 });

    // Mock db.query for INSERT audit_logs
    db.query.mockResolvedValueOnce({ rowCount: 1 });

    const processed = await processAutomatedPayouts();

    expect(processed).toEqual([1]);
    expect(payoutService.distributePayouts).toHaveBeenCalledWith(1);

    // Assert update query
    expect(db.query).toHaveBeenNthCalledWith(
      2,
      "UPDATE markets SET payout_distributed = TRUE WHERE id = $1",
      [1]
    );

    // Assert audit log query
    expect(db.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("INSERT INTO audit_logs"),
      expect.arrayContaining([
        "system",
        "AUTOMATED_PAYOUT_DISTRIBUTED",
        expect.stringContaining('"market_id":1'),
      ])
    );
  });

  it("should skip processing if no eligible markets are found", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const processed = await processAutomatedPayouts();

    expect(processed).toEqual([]);
    expect(payoutService.distributePayouts).not.toHaveBeenCalled();
  });

  it("should continue processing if one market fails", async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 1 }, { id: 2 }],
    });

    payoutService.distributePayouts.mockRejectedValueOnce(new Error("Payout failed"));
    payoutService.distributePayouts.mockResolvedValueOnce({
      payouts: [],
      winnersCount: 1,
      totalDistributed: 10,
      totalPool: 20,
      winningStake: 10,
    });

    // Mock db.query for UPDATE markets (only for market 2)
    db.query.mockResolvedValueOnce({ rowCount: 1 });
    // Mock db.query for INSERT audit_logs (only for market 2)
    db.query.mockResolvedValueOnce({ rowCount: 1 });

    const processed = await processAutomatedPayouts();

    expect(processed).toEqual([2]);
    expect(payoutService.distributePayouts).toHaveBeenCalledTimes(2);
    expect(db.query).toHaveBeenCalledTimes(3); // 1 SELECT, 1 UPDATE, 1 INSERT
  });
});

describe("Payout Service - distributePayouts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should calculate payouts and trigger notifications", async () => {
    // 1st query: market
    db.query.mockResolvedValueOnce({
      rows: [{ id: 1, winning_outcome: 1, total_pool: "100" }],
    });

    // 2nd query: winners
    db.query.mockResolvedValueOnce({
      rows: [
        { id: 101, wallet_address: "G123", amount: "10" }
      ],
    });

    // 3rd query: update paid_out
    db.query.mockResolvedValueOnce({ rowCount: 1 });
    
    // redis.del for portfolio cache invalidated
    const redis = require("../../utils/redis");
    redis.del = jest.fn().mockResolvedValue(1);

    const result = await payoutService.distributePayouts(1);

    expect(result.winnersCount).toBe(1);
    // 100 * 0.97 = 97 pool. wallet has 10/10 stake = 100%. Payout = 97 XLM
    expect(result.totalDistributed).toBe(97);
    
    expect(notifications.triggerNotification).toHaveBeenCalledWith(
      "G123",
      "PAYOUT_DISTRIBUTED",
      expect.stringContaining("97"),
      1
    );
  });
});
