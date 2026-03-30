"use strict";

jest.mock("../db");
jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const db = require("../db");
const { updateMarketLiquidity, getMinPoolThreshold } = require("../jobs/updateMarketLiquidity");

describe("updateMarketLiquidity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("updates liquidity status according to min pool threshold", async () => {
    db.query.mockResolvedValueOnce({ rowCount: 4 });

    const result = await updateMarketLiquidity({ minPool: 10 });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE markets"),
      [10]
    );
    expect(result).toEqual({ updated: 4, minPool: 10 });
  });

  it("normalizes invalid MIN_MARKET_POOL_XLM to default", () => {
    process.env.MIN_MARKET_POOL_XLM = "invalid";
    expect(getMinPoolThreshold()).toBe(10);
  });

  it("reads MIN_MARKET_POOL_XLM from env when valid", () => {
    process.env.MIN_MARKET_POOL_XLM = "15";
    expect(getMinPoolThreshold()).toBe(15);
  });
});