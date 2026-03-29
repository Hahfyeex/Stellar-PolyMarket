/**
 * useCountdownTimer.test.ts
 *
 * Tests for countdown timer hook:
 *   - Correct time formatting (Xm Ys)
 *   - Timer updates every second
 *   - Expiration detection
 *   - Cleanup on unmount
 *   - onComplete callback
 */
import { renderHook, act, waitFor } from "@testing-library/react";
import { useCountdownTimer } from "../useCountdownTimer";

describe("useCountdownTimer", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("returns 0 and isExpired=true when endTime is null", () => {
    const { result } = renderHook(() => useCountdownTimer(null));
    expect(result.current.remaining).toBe(0);
    expect(result.current.isExpired).toBe(true);
    expect(result.current.formatted).toBe("0s");
  });

  it("returns 0 and isExpired=true when endTime is in the past", () => {
    const pastTime = new Date(Date.now() - 10000).toISOString();
    const { result } = renderHook(() => useCountdownTimer(pastTime));
    expect(result.current.remaining).toBe(0);
    expect(result.current.isExpired).toBe(true);
  });

  it("formats time correctly as 'Xm Ys'", () => {
    const futureTime = new Date(Date.now() + 222000).toISOString(); // 3m 42s
    const { result } = renderHook(() => useCountdownTimer(futureTime));
    expect(result.current.formatted).toMatch(/^\d+m \d+s$/);
  });

  it("formats time as seconds only when < 1 minute", () => {
    const futureTime = new Date(Date.now() + 45000).toISOString(); // 45s
    const { result } = renderHook(() => useCountdownTimer(futureTime));
    expect(result.current.formatted).toBe("45s");
  });

  it("updates remaining time every second", () => {
    const futureTime = new Date(Date.now() + 10000).toISOString(); // 10s
    const { result } = renderHook(() => useCountdownTimer(futureTime));

    const initialRemaining = result.current.remaining;

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(result.current.remaining).toBeLessThan(initialRemaining);
  });

  it("calls onComplete when timer reaches zero", async () => {
    const onComplete = jest.fn();
    const futureTime = new Date(Date.now() + 2000).toISOString(); // 2s
    const { result } = renderHook(() => useCountdownTimer(futureTime, onComplete));

    expect(result.current.isExpired).toBe(false);

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    await waitFor(() => {
      expect(result.current.isExpired).toBe(true);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });

  it("cleans up interval on unmount", () => {
    const futureTime = new Date(Date.now() + 10000).toISOString();
    const { unmount } = renderHook(() => useCountdownTimer(futureTime));

    const clearIntervalSpy = jest.spyOn(global, "clearInterval");

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });

  it("handles Date object as endTime", () => {
    const futureDate = new Date(Date.now() + 5000);
    const { result } = renderHook(() => useCountdownTimer(futureDate));
    expect(result.current.isExpired).toBe(false);
    expect(result.current.remaining).toBeGreaterThan(0);
  });

  it("re-initializes when endTime changes", () => {
    const futureTime1 = new Date(Date.now() + 10000).toISOString();
    const { result, rerender } = renderHook(({ endTime }) => useCountdownTimer(endTime), {
      initialProps: { endTime: futureTime1 },
    });

    const remaining1 = result.current.remaining;

    const futureTime2 = new Date(Date.now() + 20000).toISOString();
    rerender({ endTime: futureTime2 });

    expect(result.current.remaining).toBeGreaterThan(remaining1);
  });

  it("formats 0 seconds correctly", () => {
    const pastTime = new Date(Date.now() - 1000).toISOString();
    const { result } = renderHook(() => useCountdownTimer(pastTime));
    expect(result.current.formatted).toBe("0s");
  });

  it("formats 1 minute exactly", () => {
    const futureTime = new Date(Date.now() + 60000).toISOString();
    const { result } = renderHook(() => useCountdownTimer(futureTime));
    expect(result.current.formatted).toMatch(/^1m 0s$/);
  });
});
