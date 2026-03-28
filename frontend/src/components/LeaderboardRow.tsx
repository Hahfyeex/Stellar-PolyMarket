"use client";
/**
 * LeaderboardRow
 *
 * A single row in the leaderboard table. Displays rank, wallet address,
 * reputation badge (24px), markets participated, and prediction accuracy.
 */
import { ReputationBadge } from "./ReputationBadge";
import { getBadgeTier } from "../utils/badgeTier";

export interface LeaderboardEntry {
  rank: number;
  walletAddress: string;
  marketsCount: number;
  accuracyPct: number;
}

interface LeaderboardRowProps {
  entry: LeaderboardEntry;
  isCurrentUser?: boolean;
}

/** Abbreviate a Stellar wallet for display: first 4 + last 4 chars */
function abbreviateWallet(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

const RANK_STYLES: Record<number, string> = {
  1: "text-yellow-400 font-bold",
  2: "text-gray-300 font-bold",
  3: "text-orange-400 font-bold",
};

export function LeaderboardRow({ entry, isCurrentUser = false }: LeaderboardRowProps) {
  const { rank, walletAddress, marketsCount, accuracyPct } = entry;
  const tier = getBadgeTier(marketsCount, accuracyPct);
  const rankStyle = RANK_STYLES[rank] ?? "text-gray-500";

  return (
    <tr
      className={`border-b border-gray-800 transition-colors hover:bg-gray-800/50 ${
        isCurrentUser ? "bg-indigo-950/30" : ""
      }`}
    >
      {/* Rank */}
      <td className="px-4 py-3 w-12">
        <span className={`text-sm tabular-nums ${rankStyle}`}>
          {rank <= 3 ? ["🥇", "🥈", "🥉"][rank - 1] : `#${rank}`}
        </span>
      </td>

      {/* Wallet + badge */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {tier ? (
            <ReputationBadge tier={tier} size={24} />
          ) : (
            /* Placeholder so rows align when user has no badge */
            <span className="inline-block w-6 h-6" aria-hidden="true" />
          )}
          <span
            className={`text-sm font-mono ${
              isCurrentUser ? "text-indigo-300 font-semibold" : "text-gray-300"
            }`}
          >
            {abbreviateWallet(walletAddress)}
            {isCurrentUser && (
              <span className="ml-2 text-xs bg-indigo-900 text-indigo-300 px-1.5 py-0.5 rounded-full">
                you
              </span>
            )}
          </span>
        </div>
      </td>

      {/* Markets */}
      <td className="px-4 py-3 text-right">
        <span className="text-sm text-gray-300 tabular-nums">{marketsCount.toLocaleString()}</span>
      </td>

      {/* Accuracy */}
      <td className="px-4 py-3 text-right">
        <span
          className={`text-sm tabular-nums font-medium ${
            accuracyPct >= 75
              ? "text-cyan-400"
              : accuracyPct >= 65
              ? "text-yellow-400"
              : accuracyPct >= 55
              ? "text-green-400"
              : "text-gray-400"
          }`}
        >
          {accuracyPct.toFixed(1)}%
        </span>
      </td>
    </tr>
  );
}
