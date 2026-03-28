"use client";
/**
 * TimelineEntry
 *
 * Single row in the wallet activity timeline.
 * Shows: action icon, description, market title, amount, relative timestamp.
 */
import { TimelineEntry as Entry, ActionType, formatRelativeTime } from "../../hooks/useWalletTimeline";

// ── Action type config ────────────────────────────────────────────────────────

const ACTION_CONFIG: Record<
  ActionType,
  { label: string; iconPath: string; iconColor: string; bgColor: string }
> = {
  BetPlaced: {
    label: "Bet Placed",
    iconColor: "text-blue-400",
    bgColor: "bg-blue-900/30 border-blue-800/50",
    iconPath: "M7 11l5-5m0 0l5 5m-5-5v12", // arrow-up
  },
  PayoutClaimed: {
    label: "Payout Claimed",
    iconColor: "text-green-400",
    bgColor: "bg-green-900/30 border-green-800/50",
    iconPath: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", // coins (reusing existing SVG-like path that looks like money/coins)
  },
  MarketCreated: {
    label: "Market Created",
    iconColor: "text-purple-400",
    bgColor: "bg-purple-900/30 border-purple-800/50",
    iconPath: "M12 4v16m8-8H4", // plus
  },
  PositionExited: {
    label: "Position Exited",
    iconColor: "text-orange-400",
    bgColor: "bg-orange-900/30 border-orange-800/50",
    iconPath: "M17 13l-5 5m0 0l-5-5m5 5V6", // arrow-down
  },
};

interface Props {
  entry: Entry;
}

export default function TimelineEntry({ entry }: Props) {
  const cfg = ACTION_CONFIG[entry.actionType];

  return (
    <div
      data-testid="timeline-entry"
      className="flex items-start gap-4 py-4 px-4 hover:bg-gray-800/40 transition-colors rounded-xl"
    >
      {/* Action icon */}
      <div
        className={`shrink-0 w-9 h-9 rounded-full border flex items-center justify-center ${cfg.bgColor}`}
        aria-label={cfg.label}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`w-4 h-4 ${cfg.iconColor}`}
        >
          <path d={cfg.iconPath} />
        </svg>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Action label + timestamp */}
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className={`text-xs font-semibold uppercase tracking-wider ${cfg.iconColor}`}>
            {cfg.label}
          </span>
          <time
            dateTime={entry.timestamp}
            className="text-xs text-gray-500 shrink-0"
            title={new Date(entry.timestamp).toLocaleString()}
          >
            {formatRelativeTime(entry.timestamp)}
          </time>
        </div>

        {/* Description */}
        <p className="text-gray-200 text-sm leading-snug truncate">{entry.description}</p>

        {/* Market title + amount */}
        <div className="flex items-center justify-between gap-2 mt-1">
          <p className="text-gray-500 text-xs truncate">{entry.marketTitle}</p>
          {entry.amount !== null && (
            <span className={`text-xs font-semibold shrink-0 ${
              entry.actionType === "PayoutClaimed"
                ? "text-green-400"
                : entry.actionType === "PositionExited"
                ? "text-orange-400"
                : "text-white"
            }`}>
              {entry.actionType === "PayoutClaimed" ? "+" : ""}
              {entry.amount} XLM
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
