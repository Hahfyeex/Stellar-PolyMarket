"use client";
import { useRef, useState } from "react";

interface Props {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
}

const TRIGGER_THRESHOLD = 60; // px

export { TRIGGER_THRESHOLD };

export default function PullToRefresh({ onRefresh, children }: Props) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  function handleTouchStart(e: React.TouchEvent) {
    // Only activate when scrolled to top
    const scrollTop = containerRef.current?.scrollTop ?? 0;
    if (scrollTop === 0) {
      touchStartY.current = e.touches[0].clientY;
    } else {
      touchStartY.current = -1; // sentinel: not at top
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (touchStartY.current < 0 || isRefreshing) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    if (delta > 0) {
      // Dampen the pull so it feels natural
      setPullDistance(Math.min(delta * 0.5, TRIGGER_THRESHOLD * 1.5));
    }
  }

  async function handleTouchEnd() {
    if (isRefreshing || touchStartY.current < 0) return;
    if (pullDistance >= TRIGGER_THRESHOLD) {
      setIsRefreshing(true);
      setPullDistance(TRIGGER_THRESHOLD); // hold spinner position
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }

  const showSpinner = pullDistance > 0 || isRefreshing;

  return (
    <div
      ref={containerRef}
      data-testid="pull-to-refresh"
      className="relative overflow-y-auto h-full"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator */}
      <div
        data-testid="pull-indicator"
        className="flex justify-center overflow-hidden transition-all duration-200"
        style={{ height: showSpinner ? `${Math.min(pullDistance, TRIGGER_THRESHOLD)}px` : "0px" }}
      >
        <div
          className={`w-7 h-7 rounded-full border-2 border-blue-400 border-t-transparent self-center
            ${isRefreshing ? "animate-spin" : ""}`}
          style={{
            transform: isRefreshing ? undefined : `rotate(${(pullDistance / TRIGGER_THRESHOLD) * 360}deg)`,
          }}
        />
      </div>

      {/* Actual content */}
      <div style={{ transform: `translateY(${showSpinner ? Math.min(pullDistance, TRIGGER_THRESHOLD) : 0}px)`, transition: isRefreshing ? "none" : "transform 0.2s ease" }}>
        {children}
      </div>
    </div>
  );
}
