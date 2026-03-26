/**
 * Tests for PullToRefresh component
 * Feature: mobile-navigation-shell
 */
import React from "react";
import { render, screen, fireEvent, act, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";
import * as fc from "fast-check";
import PullToRefresh, { TRIGGER_THRESHOLD } from "../mobile/PullToRefresh";

// Raw delta needed so damped value (delta * 0.5) >= TRIGGER_THRESHOLD
const SUFFICIENT_RAW_DELTA = TRIGGER_THRESHOLD * 2 + 2; // 122 → damped 61 >= 60

function renderPTR(onRefresh: () => Promise<void>) {
  return render(
    <PullToRefresh onRefresh={onRefresh}>
      <div data-testid="content">Content</div>
    </PullToRefresh>
  );
}

function simulatePull(container: HTMLElement, deltaY: number) {
  fireEvent.touchStart(container, { touches: [{ clientY: 0 }] });
  fireEvent.touchMove(container, { touches: [{ clientY: deltaY }] });
  fireEvent.touchEnd(container, { changedTouches: [{ clientY: deltaY }] });
}

// --- Unit tests ---

describe("PullToRefresh", () => {
  afterEach(cleanup);

  it("renders children", () => {
    renderPTR(async () => {});
    expect(screen.getByTestId("content")).toBeInTheDocument();
  });

  it("shows pull indicator when pulling down", () => {
    renderPTR(async () => {});
    const container = screen.getByTestId("pull-to-refresh");
    fireEvent.touchStart(container, { touches: [{ clientY: 0 }] });
    fireEvent.touchMove(container, { touches: [{ clientY: 40 }] });
    const indicator = screen.getByTestId("pull-indicator");
    expect(indicator.style.height).not.toBe("0px");
  });

  it("does not trigger refresh for pull below threshold", async () => {
    const onRefresh = jest.fn().mockResolvedValue(undefined);
    renderPTR(onRefresh);
    const container = screen.getByTestId("pull-to-refresh");
    // Raw delta 80 → damped 40 < 60 threshold
    simulatePull(container, 80);
    await new Promise((r) => setTimeout(r, 50));
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("triggers refresh when pull exceeds threshold", async () => {
    const onRefresh = jest.fn().mockResolvedValue(undefined);
    renderPTR(onRefresh);
    const container = screen.getByTestId("pull-to-refresh");
    simulatePull(container, SUFFICIENT_RAW_DELTA);
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1), { timeout: 2000 });
  });
});

// --- Property-based tests ---

describe("PullToRefresh — Property 7: Pull-to-refresh threshold", () => {
  /**
   * Feature: mobile-navigation-shell, Property 7: Pull-to-refresh threshold
   * Validates: Requirements 4.2
   *
   * For any raw pull distance where the damped value (delta * 0.5) >= TRIGGER_THRESHOLD,
   * onRefresh should be called exactly once.
   */
  it("calls onRefresh exactly once for any pull that clears the threshold", async () => {
    await fc.assert(
      fc.asyncProperty(
        // raw delta range: 120–360 → damped 60–180, all >= threshold
        fc.integer({ min: TRIGGER_THRESHOLD * 2, max: TRIGGER_THRESHOLD * 6 }),
        async (rawDelta) => {
          cleanup();
          const onRefresh = jest.fn().mockResolvedValue(undefined);
          const { getByTestId } = render(
            <PullToRefresh onRefresh={onRefresh}>
              <div>Content</div>
            </PullToRefresh>
          );
          const container = getByTestId("pull-to-refresh");
          simulatePull(container, rawDelta);
          await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1), { timeout: 2000 });
          cleanup();
        }
      ),
      { numRuns: 30 }
    );
  });
});

describe("PullToRefresh — Property 8: Refresh idempotence", () => {
  /**
   * Feature: mobile-navigation-shell, Property 8: Refresh idempotence
   * Validates: Requirements 4.4
   *
   * While a refresh is in progress, a second pull gesture should not
   * invoke onRefresh a second time.
   */
  it("does not trigger a second refresh while one is already in progress", async () => {
    // Use a promise that we control — never resolves during the test
    let resolveFirst!: () => void;
    const firstRefreshPromise = new Promise<void>((res) => {
      resolveFirst = res;
    });
    const onRefresh = jest
      .fn()
      .mockReturnValueOnce(firstRefreshPromise)
      .mockResolvedValue(undefined);

    renderPTR(onRefresh);
    const container = screen.getByTestId("pull-to-refresh");

    // First pull — onRefresh is invoked synchronously before the await inside handleTouchEnd
    simulatePull(container, SUFFICIENT_RAW_DELTA);
    // onRefresh is called synchronously at the start of the async handler
    expect(onRefresh).toHaveBeenCalledTimes(1);

    // Second pull while first is still in progress — isRefreshing flag blocks it
    simulatePull(container, SUFFICIENT_RAW_DELTA);
    expect(onRefresh).toHaveBeenCalledTimes(1);

    // Resolve first refresh to avoid open promise leaking
    await act(async () => {
      resolveFirst();
    });
  });
});

describe("PullToRefresh — Scroll position guard", () => {
  /**
   * Tests that pull-to-refresh only activates when scrolled to the top,
   * allowing normal scroll behavior when content is scrolled down.
   */
  it("ignores pull gestures when not scrolled to the top", async () => {
    const onRefresh = jest.fn().mockResolvedValue(undefined);
    renderPTR(onRefresh);
    const container = screen.getByTestId("pull-to-refresh");

    // Simulate being scrolled down (scrollTop > 0)
    Object.defineProperty(container, "scrollTop", {
      writable: true,
      value: 50,
    });

    simulatePull(container, SUFFICIENT_RAW_DELTA);
    await new Promise((r) => setTimeout(r, 50));
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("allows pull-to-refresh when scrolled to the top", async () => {
    const onRefresh = jest.fn().mockResolvedValue(undefined);
    renderPTR(onRefresh);
    const container = screen.getByTestId("pull-to-refresh");

    // scrollTop defaults to 0, so pull should work
    simulatePull(container, SUFFICIENT_RAW_DELTA);
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1), { timeout: 2000 });
  });
});

describe("PullToRefresh — Upward gesture handling", () => {
  /**
   * Tests that upward swipes (negative delta) do not trigger pull-to-refresh.
   */
  it("ignores upward gestures (negative delta)", () => {
    const onRefresh = jest.fn().mockResolvedValue(undefined);
    renderPTR(onRefresh);
    const container = screen.getByTestId("pull-to-refresh");

    // Simulate upward swipe: start at 100, move back to 50
    fireEvent.touchStart(container, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(container, { touches: [{ clientY: 50 }] });
    fireEvent.touchEnd(container);

    expect(onRefresh).not.toHaveBeenCalled();
  });
});

describe("PullToRefresh — Spinner visibility", () => {
  /**
   * Tests that the loading spinner appears and disappears correctly.
   */
  it("hides spinner after successful refresh", async () => {
    const onRefresh = jest.fn().mockResolvedValue(undefined);
    renderPTR(onRefresh);
    const container = screen.getByTestId("pull-to-refresh");
    const indicator = screen.getByTestId("pull-indicator");

    simulatePull(container, SUFFICIENT_RAW_DELTA);

    await waitFor(
      () => {
        expect(indicator.style.height).toBe("0px");
      },
      { timeout: 2000 }
    );
  });

  it("dampens pull distance to prevent over-stretching", () => {
    const onRefresh = jest.fn().mockResolvedValue(undefined);
    renderPTR(onRefresh);
    const container = screen.getByTestId("pull-to-refresh");
    const indicator = screen.getByTestId("pull-indicator");

    const largePull = 500;
    fireEvent.touchStart(container, { touches: [{ clientY: 0 }] });
    fireEvent.touchMove(container, { touches: [{ clientY: largePull }] });

    // Damped value should be at most TRIGGER_THRESHOLD * 1.5
    const heightValue = parseInt(indicator.style.height, 10);
    expect(heightValue).toBeLessThanOrEqual(TRIGGER_THRESHOLD * 1.5);
  });
});
