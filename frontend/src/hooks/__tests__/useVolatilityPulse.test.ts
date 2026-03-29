import { renderHook } from "@testing-library/react";
import { useVolatilityPulse, VOLATILITY_THRESHOLD, VOLATILITY_WINDOW_MS } from "../useVolatilityPulse";

describe("useVolatilityPulse", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("Volatility Detection", () => {
    it("should not pulse when odds change is below threshold", () => {
      const { result, rerender } = renderHook(
        ({ odds }) => useVolatilityPulse(odds),
        { initialProps: { odds: 50 } }
      );

      expect(result.current.isPulsing).toBe(false);
      expect(result.current.direction).toBeNull();

      // Change by 2% (below 5% threshold)
      rerender({ odds: 51 });

      expect(result.current.isPulsing).toBe(false);
      expect(result.current.direction).toBeNull();
    });

    it("should pulse when odds increase by more than 5%", () => {
      const { result, rerender } = renderHook(
        ({ odds }) => useVolatilityPulse(odds),
        { initialProps: { odds: 50 } }
      );

      // Increase by 5.1% (above threshold)
      rerender({ odds: 52.55 });

      expect(result.current.isPulsing).toBe(true);
      expect(result.current.direction).toBe("up");
    });

    it("should pulse when odds decrease by more than 5%", () => {
      const { result, rerender } = renderHook(
        ({ odds }) => useVolatilityPulse(odds),
        { initialProps: { odds: 50 } }
      );

      // Decrease by 5.1% (above threshold)
      rerender({ odds: 47.45 });

      expect(result.current.isPulsing).toBe(true);
      expect(result.current.direction).toBe("down");
    });

    it("should detect direction correctly for rising odds", () => {
      const { result, rerender } = renderHook(
        ({ odds }) => useVolatilityPulse(odds),
        { initialProps: { odds: 40 } }
      );

      // Rise by 6%
      rerender({ odds: 42.4 });

      expect(result.current.direction).toBe("up");
    });

    it("should detect direction correctly for falling odds", () => {
      const { result, rerender } = renderHook(
        ({ odds }) => useVolatilityPulse(odds),
        { initialProps: { odds: 60 } }
      );

      // Fall by 6%
      rerender({ odds: 56.4 });

      expect(result.current.direction).toBe("down");
    });
  });

  describe("Threshold Boundary", () => {
    it("should pulse at exactly 5% threshold", () => {
      const { result, rerender } = renderHook(
        ({ odds }) => useVolatilityPulse(odds),
        { initialProps: { odds: 100 } }
      );

      // Exactly 5% increase
      rerender({ odds: 105 });

      expect(result.current.isPulsing).toBe(true);
    });

    it("should not pulse just below 5% threshold", () => {
      const { result, rerender } = renderHook(
        ({ odds }) => useVolatilityPulse(odds),
        { initialProps: { odds: 100 } }
      );

      // 4.9% increase (just below threshold)
      rerender({ odds: 104.9 });

      expect(result.current.isPulsing).toBe(false);
    });
  });

  describe("Time Window", () => {
    it("should reset window after 60 seconds", () => {
      const { result, rerender } = renderHook(
        ({ odds }) => useVolatilityPulse(odds),
        { initialProps: { odds: 50 } }
      );

      // Trigger pulse
      rerender({ odds: 52.55 });
      expect(result.current.isPulsing).toBe(true);

      // Advance time past 60 seconds
      jest.advanceTimersByTime(VOLATILITY_WINDOW_MS + 1000);

      // Reset odds to initial value
      rerender({ odds: 50 });

      // Now a small change should not trigger pulse (window reset)
      rerender({ odds: 51 });
      expect(result.current.isPulsing).toBe(false);
    });

    it("should track changes within 60-second window", () => {
      const { result, rerender } = renderHook(
        ({ odds }) => useVolatilityPulse(odds),
        { initialProps: { odds: 50 } }
      );

      // First change: +2%
      rerender({ odds: 51 });
      expect(result.current.isPulsing).toBe(false);

      // Advance time by 30 seconds (within window)
      jest.advanceTimersByTime(30_000);

      // Second change: +4% (total 6% from original, should trigger)
      rerender({ odds: 53 });
      expect(result.current.isPulsing).toBe(true);
    });
  });

  describe("Multiple Pulses", () => {
    it("should allow multiple pulses within the window", () => {
      const { result, rerender } = renderHook(
        ({ odds }) => useVolatilityPulse(odds),
        { initialProps: { odds: 50 } }
      );

      // First pulse
      rerender({ odds: 52.55 });
      expect(result.current.isPulsing).toBe(true);
      expect(result.current.direction).toBe("up");

      // Reset pulse state (simulate animation end)
      jest.advanceTimersByTime(1500); // 3 cycles * 0.5s

      // Second pulse in opposite direction
      rerender({ odds: 49.45 });
      expect(result.current.isPulsing).toBe(true);
      expect(result.current.direction).toBe("down");
    });
  });

  describe("Edge Cases", () => {
    it("should handle zero odds gracefully", () => {
      const { result, rerender } = renderHook(
        ({ odds }) => useVolatilityPulse(odds),
        { initialProps: { odds: 0 } }
      );

      expect(result.current.isPulsing).toBe(false);

      // Change from 0 to 5
      rerender({ odds: 5 });
      // Should not pulse (0 odds is edge case, percentage change is infinite)
      expect(result.current.isPulsing).toBe(false);
    });

    it("should handle very small odds values", () => {
      const { result, rerender } = renderHook(
        ({ odds }) => useVolatilityPulse(odds),
        { initialProps: { odds: 0.1 } }
      );

      // 5% increase from 0.1 = 0.105
      rerender({ odds: 0.105 });
      expect(result.current.isPulsing).toBe(true);
    });

    it("should handle very large odds values", () => {
      const { result, rerender } = renderHook(
        ({ odds }) => useVolatilityPulse(odds),
        { initialProps: { odds: 1000 } }
      );

      // 5% increase from 1000 = 1050
      rerender({ odds: 1050 });
      expect(result.current.isPulsing).toBe(true);
    });

    it("should return null direction when not pulsing", () => {
      const { result } = renderHook(
        ({ odds }) => useVolatilityPulse(odds),
        { initialProps: { odds: 50 } }
      );

      expect(result.current.direction).toBeNull();
    });
  });

  describe("Constant Values", () => {
    it("should export VOLATILITY_THRESHOLD as 0.05", () => {
      expect(VOLATILITY_THRESHOLD).toBe(0.05);
    });

    it("should export VOLATILITY_WINDOW_MS as 60000", () => {
      expect(VOLATILITY_WINDOW_MS).toBe(60_000);
    });
  });
});
