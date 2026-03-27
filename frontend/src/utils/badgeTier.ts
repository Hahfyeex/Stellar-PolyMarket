/**
 * badgeTier.ts
 *
 * Determines a user's reputation badge tier based on prediction market activity.
 *
 * Tier award logic:
 *   - Tiers are evaluated from highest to lowest; the first matching tier wins.
 *   - Both conditions (marketsCount AND accuracyPct) must be satisfied.
 *   - A user who meets no tier threshold receives null (no badge).
 *
 * To add a new tier:
 *   1. Add an entry to BADGE_TIERS (keep array sorted highest-first).
 *   2. Add the corresponding SVG to /public/badges/<tier>.svg.
 *   3. Add the glow color to BADGE_GLOW_COLORS below.
 */

export type BadgeTier = "bronze" | "silver" | "gold" | "diamond";

/**
 * Minimum requirements for each badge tier.
 * Evaluated in order — first match wins (highest tier takes priority).
 *
 * | Tier    | Min Markets | Min Accuracy |
 * |---------|-------------|--------------|
 * | Diamond | 200+        | 75%          |
 * | Gold    | 100+        | 65%          |
 * | Silver  | 50+         | 55%          |
 * | Bronze  | 10+         | —  (no accuracy requirement) |
 */
export const BADGE_TIERS: ReadonlyArray<{
  tier: BadgeTier;
  minMarkets: number;
  minAccuracy: number;
}> = [
  // 💎 Diamond: elite predictors with deep participation and high accuracy
  { tier: "diamond", minMarkets: 200, minAccuracy: 75 },
  // 🥇 Gold: experienced predictors with strong accuracy
  { tier: "gold", minMarkets: 100, minAccuracy: 65 },
  // 🥈 Silver: active predictors with above-average accuracy
  { tier: "silver", minMarkets: 50, minAccuracy: 55 },
  // 🥉 Bronze: any user who has participated in 10+ markets (no accuracy gate)
  { tier: "bronze", minMarkets: 10, minAccuracy: 0 },
] as const;

/**
 * CSS box-shadow glow color for each badge tier, used on hover micro-interactions.
 * Each tier has a unique thematic color.
 */
export const BADGE_GLOW_COLORS: Record<BadgeTier, string> = {
  bronze: "#cd7f32",  // copper
  silver: "#c0c0c0",  // silver
  gold: "#ffd700",    // gold
  diamond: "#38bdf8", // ice blue / cyan
};

/**
 * Compute a user's badge tier from their prediction market stats.
 *
 * @param marketsCount - Total number of prediction markets the user has participated in.
 * @param accuracyPct  - User's prediction accuracy as a percentage (0–100).
 *                       Pass 0 for users who haven't resolved any predictions yet.
 * @returns The highest tier the user qualifies for, or null if they qualify for none.
 *
 * @example
 *   getBadgeTier(250, 80) // => "diamond"
 *   getBadgeTier(120, 60) // => "gold"  (has 120 markets but only 60% — qualifies gold not diamond)
 *   getBadgeTier(15, 0)   // => "bronze" (bronze has no accuracy requirement)
 *   getBadgeTier(5, 90)   // => null     (below 10-market minimum)
 */
export function getBadgeTier(
  marketsCount: number,
  accuracyPct: number
): BadgeTier | null {
  for (const { tier, minMarkets, minAccuracy } of BADGE_TIERS) {
    if (marketsCount >= minMarkets && accuracyPct >= minAccuracy) {
      return tier;
    }
  }
  return null;
}
