/**
 * Tests for the dynamic fee-manager utility.
 * Target: ≥95% coverage of fee-multiplier logic.
 */

// Shared mock function — defined outside jest.mock so it's always the same reference
const mockFeeStats = jest.fn();

jest.mock("@stellar/stellar-sdk", () => ({
  Horizon: {
    Server: jest.fn().mockImplementation(() => ({
      feeStats: mockFeeStats,
    })),
  },
}));

jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const logger = require("../utils/logger");

// Helper: build a minimal fee_stats response
function makeFeeStats(p90) {
  return {
    fee_charged: {
      min: "100",
      mode: "100",
      p10: "100",
      p20: "100",
      p30: "100",
      p40: "100",
      p50: "100",
      p60: "100",
      p70: "100",
      p80: "150",
      p90: String(p90),
      p95: String(p90 + 50),
      p99: String(p90 + 100),
      max: String(p90 + 200),
    },
  };
}

describe("fee-manager", () => {
  let feeManager;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset env vars to known defaults before each test
    delete process.env.ORACLE_BASE_FEE;
    delete process.env.MAX_FEE_CAP;
    delete process.env.CONGESTION_THRESHOLD;
    delete process.env.STELLAR_NETWORK;

    // Re-require so module-level constants re-evaluate from env
    jest.resetModules();

    // Re-apply the mock after resetModules
    jest.doMock("@stellar/stellar-sdk", () => ({
      Horizon: {
        Server: jest.fn().mockImplementation(() => ({
          feeStats: mockFeeStats,
        })),
      },
    }));
    jest.doMock("../utils/logger", () => ({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }));

    feeManager = require("../utils/fee-manager");
  });

  // ── fetchFeeStats ──────────────────────────────────────────────────────────

  describe("fetchFeeStats", () => {
    it("calls horizonServer.feeStats and returns the result", async () => {
      const mockStats = makeFeeStats(150);
      mockFeeStats.mockResolvedValueOnce(mockStats);

      const result = await feeManager.fetchFeeStats();
      expect(result).toEqual(mockStats);
      expect(mockFeeStats).toHaveBeenCalledTimes(1);
    });

    it("propagates errors from Horizon", async () => {
      mockFeeStats.mockRejectedValueOnce(new Error("Horizon down"));
      await expect(feeManager.fetchFeeStats()).rejects.toThrow("Horizon down");
    });
  });

  // ── getOracleFee – normal network ─────────────────────────────────────────

  describe("getOracleFee – normal network (p90 <= threshold)", () => {
    it("returns BASE_FEE when p90 equals the threshold exactly", async () => {
      mockFeeStats.mockResolvedValueOnce(makeFeeStats(200)); // default threshold = 200
      const { fee, congested, p90 } = await feeManager.getOracleFee();

      expect(congested).toBe(false);
      expect(fee).toBe("100"); // default BASE_FEE
      expect(p90).toBe(200);
    });

    it("returns BASE_FEE when p90 is well below threshold", async () => {
      mockFeeStats.mockResolvedValueOnce(makeFeeStats(100));
      const { fee, congested } = await feeManager.getOracleFee();

      expect(congested).toBe(false);
      expect(fee).toBe("100");
    });

    it("logs a debug message on normal network", async () => {
      mockFeeStats.mockResolvedValueOnce(makeFeeStats(150));
      const loggerInstance = require("../utils/logger");
      await feeManager.getOracleFee();

      expect(loggerInstance.debug).toHaveBeenCalledWith(
        expect.objectContaining({ event: "FeeAdjustment" }),
        expect.stringContaining("Network nominal")
      );
    });
  });

  // ── getOracleFee – high congestion ────────────────────────────────────────

  describe("getOracleFee – high congestion (p90 > threshold)", () => {
    it("returns p90 fee when congested and p90 < MAX_FEE_CAP", async () => {
      mockFeeStats.mockResolvedValueOnce(makeFeeStats(500));
      const { fee, congested, p90 } = await feeManager.getOracleFee();

      expect(congested).toBe(true);
      expect(fee).toBe("500");
      expect(p90).toBe(500);
    });

    it("caps fee at MAX_FEE_CAP when p90 exceeds it", async () => {
      mockFeeStats.mockResolvedValueOnce(makeFeeStats(99999));
      const { fee, congested } = await feeManager.getOracleFee();

      expect(congested).toBe(true);
      expect(fee).toBe("10000"); // default MAX_FEE_CAP
    });

    it("returns exactly MAX_FEE_CAP when p90 equals MAX_FEE_CAP", async () => {
      mockFeeStats.mockResolvedValueOnce(makeFeeStats(10000));
      const { fee, congested } = await feeManager.getOracleFee();

      expect(congested).toBe(true);
      expect(fee).toBe("10000");
    });

    it("logs an INFO FeeAdjustment event on congestion", async () => {
      mockFeeStats.mockResolvedValueOnce(makeFeeStats(500));
      const loggerInstance = require("../utils/logger");
      await feeManager.getOracleFee();

      expect(loggerInstance.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "FeeAdjustment",
          p90: 500,
          adjusted_fee: 500,
          max_fee_cap: 10000,
        }),
        expect.stringContaining("High Congestion detected. Adjusting fee to 500 stroops.")
      );
    });

    it("logs capped fee in INFO message when p90 exceeds MAX_FEE_CAP", async () => {
      mockFeeStats.mockResolvedValueOnce(makeFeeStats(50000));
      const loggerInstance = require("../utils/logger");
      await feeManager.getOracleFee();

      expect(loggerInstance.info).toHaveBeenCalledWith(
        expect.objectContaining({ adjusted_fee: 10000 }),
        expect.stringContaining("Adjusting fee to 10000 stroops.")
      );
    });
  });

  // ── env-var overrides ─────────────────────────────────────────────────────

  describe("env-var overrides", () => {
    it("respects ORACLE_BASE_FEE override", async () => {
      process.env.ORACLE_BASE_FEE = "200";
      jest.resetModules();
      jest.doMock("@stellar/stellar-sdk", () => ({
        Horizon: { Server: jest.fn().mockImplementation(() => ({ feeStats: mockFeeStats })) },
      }));
      jest.doMock("../utils/logger", () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }));
      feeManager = require("../utils/fee-manager");

      mockFeeStats.mockResolvedValueOnce(makeFeeStats(150));
      const { fee } = await feeManager.getOracleFee();
      expect(fee).toBe("200");
    });

    it("respects MAX_FEE_CAP override", async () => {
      process.env.MAX_FEE_CAP = "5000";
      jest.resetModules();
      jest.doMock("@stellar/stellar-sdk", () => ({
        Horizon: { Server: jest.fn().mockImplementation(() => ({ feeStats: mockFeeStats })) },
      }));
      jest.doMock("../utils/logger", () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }));
      feeManager = require("../utils/fee-manager");

      mockFeeStats.mockResolvedValueOnce(makeFeeStats(99999));
      const { fee } = await feeManager.getOracleFee();
      expect(fee).toBe("5000");
    });

    it("respects CONGESTION_THRESHOLD override — p90 below custom threshold is not congested", async () => {
      process.env.CONGESTION_THRESHOLD = "1000";
      jest.resetModules();
      jest.doMock("@stellar/stellar-sdk", () => ({
        Horizon: { Server: jest.fn().mockImplementation(() => ({ feeStats: mockFeeStats })) },
      }));
      jest.doMock("../utils/logger", () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }));
      feeManager = require("../utils/fee-manager");

      // p90 = 500, threshold = 1000 → NOT congested
      mockFeeStats.mockResolvedValueOnce(makeFeeStats(500));
      const { congested } = await feeManager.getOracleFee();
      expect(congested).toBe(false);
    });

    it("treats p90 just above custom threshold as congested", async () => {
      process.env.CONGESTION_THRESHOLD = "300";
      jest.resetModules();
      jest.doMock("@stellar/stellar-sdk", () => ({
        Horizon: { Server: jest.fn().mockImplementation(() => ({ feeStats: mockFeeStats })) },
      }));
      jest.doMock("../utils/logger", () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }));
      feeManager = require("../utils/fee-manager");

      mockFeeStats.mockResolvedValueOnce(makeFeeStats(301));
      const { congested } = await feeManager.getOracleFee();
      expect(congested).toBe(true);
    });
  });

  // ── exported constants ────────────────────────────────────────────────────

  describe("exported constants", () => {
    it("exports BASE_FEE as a positive number", () => {
      expect(typeof feeManager.BASE_FEE).toBe("number");
      expect(feeManager.BASE_FEE).toBeGreaterThan(0);
    });

    it("exports MAX_FEE_CAP as a number greater than BASE_FEE", () => {
      expect(typeof feeManager.MAX_FEE_CAP).toBe("number");
      expect(feeManager.MAX_FEE_CAP).toBeGreaterThan(feeManager.BASE_FEE);
    });

    it("exports CONGESTION_THRESHOLD as a positive number", () => {
      expect(typeof feeManager.CONGESTION_THRESHOLD).toBe("number");
      expect(feeManager.CONGESTION_THRESHOLD).toBeGreaterThan(0);
    });
  });

  // ── error propagation ─────────────────────────────────────────────────────

  describe("error propagation", () => {
    it("propagates Horizon errors from getOracleFee", async () => {
      mockFeeStats.mockRejectedValueOnce(new Error("Network timeout"));
      await expect(feeManager.getOracleFee()).rejects.toThrow("Network timeout");
    });
  });
});
