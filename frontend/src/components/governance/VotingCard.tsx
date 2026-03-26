"use client";
/**
 * VotingCard
 *
 * Displays a single dispute up for council vote.
 *
 * Evidence review gate:
 *   The "Vote Yes" and "Vote No" buttons are disabled until the council member
 *   has opened at least one evidence link (tracked via local state). This
 *   ensures evidence is reviewed before a vote is cast.
 *
 * Props:
 *   - dispute: the dispute object
 *   - onVote: callback invoked with (disputeId, "yes" | "no")
 *   - hasVoted: whether the current user already voted on this dispute
 *   - userVote: the vote the user cast ("yes" | "no" | null)
 */
import { useState } from "react";
import QuorumTracker from "./QuorumTracker";

export interface Evidence {
  label: string;
  url: string;
  type: "ipfs" | "url";
}

export interface Dispute {
  id: number;
  marketQuestion: string;
  proposedOutcome: string;
  disputeReason: string;
  evidence: Evidence[];
  votesYes: number;
  votesNo: number;
  quorumRequired: number;
  totalCouncilMembers: number;
  expiresAt: string; // ISO timestamp — 24h window
  status: "active" | "resolved" | "expired";
}

interface Props {
  dispute: Dispute;
  onVote: (disputeId: number, vote: "yes" | "no") => Promise<void>;
  hasVoted: boolean;
  userVote: "yes" | "no" | null;
}

export default function VotingCard({ dispute, onVote, hasVoted, userVote }: Props) {
  const [openedLinks, setOpenedLinks] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const evidenceReviewed = openedLinks.size > 0;
  const isActive = dispute.status === "active";

  const timeLeft = (() => {
    const diff = new Date(dispute.expiresAt).getTime() - Date.now();
    if (diff <= 0) return "Expired";
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    return `${h}h ${m}m remaining`;
  })();

  const handleEvidenceClick = (index: number) => {
    setOpenedLinks((prev) => new Set(prev).add(index));
  };

  const handleVote = async (vote: "yes" | "no") => {
    if (!evidenceReviewed || hasVoted || submitting) return;
    setSubmitting(true);
    try {
      await onVote(dispute.id, vote);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <article className="bg-gray-900 border border-gray-700 rounded-xl p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex justify-between items-start gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-indigo-400 font-semibold uppercase tracking-wider">
            Dispute #{dispute.id}
          </span>
          <h3 className="text-white font-semibold text-base leading-snug">
            {dispute.marketQuestion}
          </h3>
        </div>
        <span
          className={`shrink-0 text-xs px-2 py-1 rounded-full font-medium ${
            dispute.status === "active"
              ? "bg-yellow-900 text-yellow-300"
              : dispute.status === "resolved"
              ? "bg-green-900 text-green-300"
              : "bg-gray-700 text-gray-400"
          }`}
        >
          {dispute.status.charAt(0).toUpperCase() + dispute.status.slice(1)}
        </span>
      </div>

      {/* Dispute summary */}
      <div className="bg-gray-800 rounded-lg p-3 flex flex-col gap-1 text-sm">
        <p className="text-gray-400">
          Proposed outcome:{" "}
          <span className="text-white font-medium">{dispute.proposedOutcome}</span>
        </p>
        <p className="text-gray-400">
          Dispute reason:{" "}
          <span className="text-gray-200">{dispute.disputeReason}</span>
        </p>
      </div>

      {/* Evidence links */}
      <div className="flex flex-col gap-2">
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">
          Evidence ({dispute.evidence.length})
          {!evidenceReviewed && isActive && (
            <span className="ml-2 text-yellow-400">— open at least one link to unlock voting</span>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          {dispute.evidence.map((ev, i) => (
            <a
              key={i}
              href={ev.type === "ipfs" ? `https://gateway.pinata.cloud/ipfs/${ev.url}` : ev.url}
              target="_blank"
              rel="noreferrer noopener"
              onClick={() => handleEvidenceClick(i)}
              className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                openedLinks.has(i)
                  ? "border-indigo-500 bg-indigo-900/40 text-indigo-300"
                  : "border-gray-600 bg-gray-800 text-gray-300 hover:border-indigo-500 hover:text-indigo-300"
              }`}
            >
              {ev.type === "ipfs" ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                </svg>
              )}
              {ev.label}
              {openedLinks.has(i) && <span className="text-indigo-400">✓</span>}
            </a>
          ))}
        </div>
      </div>

      {/* Quorum tracker */}
      <QuorumTracker
        votesYes={dispute.votesYes}
        votesNo={dispute.votesNo}
        quorumRequired={dispute.quorumRequired}
        totalCouncilMembers={dispute.totalCouncilMembers}
      />

      {/* Timeframe */}
      <p className="text-xs text-gray-500">
        ⏱{" "}
        <span className={timeLeft === "Expired" ? "text-red-400" : "text-gray-400"}>
          {timeLeft}
        </span>
      </p>

      {/* Vote buttons */}
      {isActive && (
        <div className="flex flex-col gap-2">
          {hasVoted ? (
            <div className="text-center text-sm text-gray-400 py-2 bg-gray-800 rounded-lg">
              You voted{" "}
              <span className={userVote === "yes" ? "text-green-400 font-semibold" : "text-red-400 font-semibold"}>
                {userVote === "yes" ? "Yes ✓" : "No ✗"}
              </span>
            </div>
          ) : (
            <>
              {!evidenceReviewed && (
                <p className="text-xs text-yellow-400 text-center">
                  Review evidence above to enable voting
                </p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => handleVote("yes")}
                  disabled={!evidenceReviewed || submitting}
                  aria-label="Vote Yes on this dispute"
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors
                    bg-green-700 hover:bg-green-600 text-white
                    disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submitting ? "Submitting..." : "Vote Yes"}
                </button>
                <button
                  onClick={() => handleVote("no")}
                  disabled={!evidenceReviewed || submitting}
                  aria-label="Vote No on this dispute"
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors
                    bg-red-800 hover:bg-red-700 text-white
                    disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submitting ? "Submitting..." : "Vote No"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </article>
  );
}
