"use client";
/**
 * ReputationBadge
 *
 * Renders the SVG badge for a given reputation tier with a glow
 * micro-interaction on hover. Each tier has a unique glow color.
 *
 * Note: SVG images require `filter: drop-shadow` (not `box-shadow`) to produce
 * a shape-following glow. `box-shadow` only creates a rectangular shadow around
 * the element's bounding box and does not follow SVG paths.
 *
 * Glow colors:
 *   Bronze  → #cd7f32 (copper)
 *   Silver  → #c0c0c0 (silver)
 *   Gold    → #ffd700 (gold)
 *   Diamond → #38bdf8 (ice blue)
 *
 * Supports sizes: 24px (leaderboard rows), 48px (compact profile), 96px (profile header)
 */
import Image from "next/image";
import { type BadgeTier, BADGE_GLOW_COLORS } from "../utils/badgeTier";

export type BadgeSize = 24 | 48 | 96;

interface ReputationBadgeProps {
  tier: BadgeTier;
  size?: BadgeSize;
  /** Extra CSS classes for layout/spacing */
  className?: string;
}

const TIER_LABELS: Record<BadgeTier, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  diamond: "Diamond",
};

export function ReputationBadge({
  tier,
  size = 48,
  className = "",
}: ReputationBadgeProps) {
  const glowColor = BADGE_GLOW_COLORS[tier];
  const label = TIER_LABELS[tier];

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full transition-all duration-300 group ${className}`}
      style={{
        width: size,
        height: size,
        // Subtle resting shadow so the badge always feels premium
        filter: `drop-shadow(0 0 ${size / 12}px ${glowColor}55)`,
      }}
      role="img"
      aria-label={`${label} reputation badge`}
      title={`${label} Tier`}
    >
      <Image
        src={`/badges/${tier}.svg`}
        alt={`${label} badge`}
        width={size}
        height={size}
        className="transition-all duration-300 group-hover:scale-110"
        style={{
          filter: `drop-shadow(0 0 ${size / 8}px ${glowColor}00)`,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLImageElement).style.filter =
            `drop-shadow(0 0 ${size / 6}px ${glowColor}) drop-shadow(0 0 ${size / 3}px ${glowColor}88)`;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLImageElement).style.filter =
            `drop-shadow(0 0 ${size / 8}px ${glowColor}00)`;
        }}
      />
    </span>
  );
}

/**
 * ReputationBadgeWithLabel
 *
 * Extended variant that shows the tier name below the badge icon.
 * Used in the profile header.
 */
export function ReputationBadgeWithLabel({
  tier,
  size = 96,
  className = "",
}: ReputationBadgeProps) {
  const label = TIER_LABELS[tier];
  const glowColor = BADGE_GLOW_COLORS[tier];

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <ReputationBadge tier={tier} size={size} />
      <span
        className="text-xs font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full"
        style={{
          color: glowColor,
          backgroundColor: `${glowColor}18`,
          border: `1px solid ${glowColor}44`,
        }}
      >
        {label}
      </span>
    </div>
  );
}
