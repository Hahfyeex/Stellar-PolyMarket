"use client";
import { useRef, useState } from "react";

interface Props {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
}

/**
 * TRIGGER_THRESHOLD: Minimum pull distance (in pixels) required to trigger a refresh.
 * Users must pull down at least 60px to initiate a market data refetch.
 * This value is dampened during the pull gesture (actual pull distance * 0.5) to
 * provide smooth, natural-feeling touch feedback.
 */
const TRIGGER_THRESHOLD = 60; // px

export { TRIGGER_THRESHOLD };

/**
 * PullToRefresh Component
 *
 * Provides native mobile pull-to-refresh functionality for the markets list.
 * Listens for touch gestures and triggers a refresh callback when users pull
 * down on the container by at least 60px.
 *
 * Touch Event Flow:
 * 1. touchstart → Record starting Y position (only if scrolled to top)
 * 2. touchmove → Calculate pull distance, update spinner visualization
 * 3. touchend → Trigger refresh if threshold exceeded, reset state
 *
 * Key Features:
 * - Scroll position guard: Only activates when scrolled to the top
 * - Damped pull distance: Reduces visual pull to 50% of actual finger movement
 * - Idempotent refresh: Prevents multiple simultaneous refreshes
 * - Smooth animations: CSS transitions for spinner collapse
 */
export default function PullToRefresh({ onRefresh, children }: Props) {
  // Track the current pull distance for spinner visualization
  const [pullDistance, setPullDistance] = useState(0);

  // Track whether a refresh is currently in progress (UI state)
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Synchronous guard to prevent multiple concurrent refresh calls
  // useRef ensures this persists across renders without triggering re-renders
  const isRefreshingRef = useRef(false);

  // Store the Y coordinate where the touch started
  // Used to calculate the pull distance on subsequent touch moves
  const touchStartY = useRef(0);

  // Reference to the container element to track scroll position and handle touch events
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * handleTouchStart: Initialize pull-to-refresh gesture
   *
   * Checks if the user is at the top of the scrollable content (scrollTop === 0).
   * If so, records the starting Y position. If not at the top, sets a sentinel
   * value (-1) to prevent pull-to-refresh activation during normal scrolling.
   */
  function handleTouchStart(e: React.TouchEvent) {
    // Check current scroll position to ensure we're at the top of the list
    const scrollTop = containerRef.current?.scrollTop ?? 0;

    if (scrollTop === 0) {
      // At the top: record the starting Y position of the touch
      touchStartY.current = e.touches[0].clientY;
    } else {
      // Not at the top: set sentinel value to block pull-to-refresh
      // This ensures normal vertical scrolling isn't disrupted
      touchStartY.current = -1;
    }
  }

  /**
   * handleTouchMove: Track and visualize pull distance
   *
   * Calculates how far the user has pulled down and updates the spinner's
   * visual height. The pull distance is dampened (multiplied by 0.5) to provide
   * natural-feeling resistance, preventing extreme visual stretching.
   *
   * Early returns:
   * - touchStartY.current < 0: Not at top, normal scroll took over
   * - isRefreshingRef.current: Refresh already in progress, ignore further pulls
   */
  function handleTouchMove(e: React.TouchEvent) {
    // Skip if we're not at the top or a refresh is in progress
    if (touchStartY.current < 0 || isRefreshingRef.current) return;

    // Calculate how far the user has pulled down from their starting point
    const delta = e.touches[0].clientY - touchStartY.current;

    // Only update if pulling downward (delta > 0)
    // Upward gestures are ignored
    if (delta > 0) {
      // Dampen the pull distance to 50% of actual movement
      // This creates a smooth, bouncy feel similar to native iOS scrolling
      // Cap the visual pull at 1.5x the trigger threshold for UI containment
      setPullDistance(Math.min(delta * 0.5, TRIGGER_THRESHOLD * 1.5));
    }
  }

  /**
   * handleTouchEnd: Complete the pull gesture and trigger refresh if needed
   *
   * Evaluates whether the pull distance exceeds the trigger threshold.
   * If so, initiates the refresh operation. The isRefreshingRef guard prevents
   * race conditions where multiple rapid pulls could trigger multiple refreshes.
   *
   * After completion, resets the pull state and makes the spinner disappear.
   */
  async function handleTouchEnd() {
    // Skip if a refresh is already in progress or we're not at the top
    if (isRefreshingRef.current || touchStartY.current < 0) return;

    // Check if the pull distance exceeded the minimum threshold (60px)
    if (pullDistance >= TRIGGER_THRESHOLD) {
      // Set the synchronous guard to prevent concurrent refreshes
      isRefreshingRef.current = true;

      // Update UI state to show the spinner in loading state
      setIsRefreshing(true);

      // Hold the spinner at its current position while loading
      // so users see it's processing their action
      setPullDistance(TRIGGER_THRESHOLD);

      try {
        // Trigger the parent's refresh callback (typically fetchMarkets)
        await onRefresh();
      } finally {
        // Reset all state when refresh completes
        isRefreshingRef.current = false;
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      // Pull didn't reach threshold, just collapse the indicator
      setPullDistance(0);
    }
  }

  // Determine if spinner should be visible (during pull or active refresh)
  const showSpinner = pullDistance > 0 || isRefreshing;

  return (
    <div
      ref={containerRef}
      data-testid="pull-to-refresh"
      className="relative overflow-y-auto h-full"
      // Attach touch event handlers to detect and respond to pull-to-refresh gestures
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* 
        Pull-to-refresh indicator (spinner)
        
        Appears at the top of the list when the user pulls down.
        The height is controlled by pullDistance; when hidden, it takes 0px height.
        Smooth CSS transitions create an animated collapse effect.
        
        The spinner indicator rotates during pull (based on pull distance)
        and spins during the actual refresh operation (isRefreshing = true).
        This provides immediate visual feedback to the user.
      */}
      <div
        data-testid="pull-indicator"
        className="flex justify-center overflow-hidden transition-all duration-200"
        // Height expands with pull, capped at TRIGGER_THRESHOLD (60px)
        // Smooth transition collapses the indicator when released or refresh completes
        style={{ height: showSpinner ? `${Math.min(pullDistance, TRIGGER_THRESHOLD)}px` : "0px" }}
      >
        {/* 
          Spinner icon: a circular border with the top section transparent
          Rotates during pull to indicate the pull-to-refresh threshold
          Spins/animates continuously during the actual refresh operation
        */}
        <div
          className={`w-7 h-7 rounded-full border-2 border-blue-400 border-t-transparent self-center
            ${isRefreshing ? "animate-spin" : ""}`}
          // During pull: rotate proportionally to pull distance (0–360 degrees)
          // During refresh: animate-spin class handles continuous rotation
          style={{
            transform: isRefreshing
              ? undefined
              : `rotate(${(pullDistance / TRIGGER_THRESHOLD) * 360}deg)`,
          }}
        />
      </div>

      {/* 
        Content container: the actual markets list and child components
        
        Translates downward while pulling to create the visual "dragging down" effect.
        The translation distance matches the spinner height, keeping everything aligned.
        When refresh completes, a smooth transition (0.2s ease) collapses the content back.
      */}
      <div
        // Translate content down by the same amount as the spinner height
        // Creates the unified pull-down effect: spinner + content both move together
        style={{
          transform: `translateY(${showSpinner ? Math.min(pullDistance, TRIGGER_THRESHOLD) : 0}px)`,
          // Disable transitions during a live refresh to avoid janky animations
          // Re-enable smooth transitions when collapsing after refresh completes
          transition: isRefreshing ? "none" : "transform 0.2s ease",
        }}
      >
        {children}
      </div>
    </div>
  );
}
