"use client";
/**
 * Stellar Council — Governance Dashboard
 *
 * Access: Restricted to verified Council Members (connected wallet check).
 * Non-members and disconnected wallets see a locked state.
 *
 * Features:
 *   - Lists active disputes with VotingCards
 *   - Quorum tracker per dispute
 *   - Evidence-review gate before voting is enabled
 *   - 24-hour timeframe per dispute
 */
import { useState, useEffect, useCallback } from "react";
import { useWalletContext } from "../../context/WalletContext";
import { useCouncilMember } from "../../hooks/useCouncilMember";
import VotingCard, { Dispute } from "../../components/governance/VotingCard";

// ── Mock data — replace with real API calls ──────────────────────────────────
const MOCK_DISPUTES: Dispute[] = [
  {
    id: 1,
    marketQuestion: "Will the Stellar Development Foundation release a new Soroban SDK version before Q2 2026?",
    proposedOutcome: "Yes",
    disputeReason: "The oracle proposed 'Yes' but the official SDF GitHub shows no release tag in the specified window.",
    evidence: [
      { label: "SDF GitHub Releases", url: "https://github.com/stellar/rs-soroban-sdk/releases", type: "url" },
      { label: "Oracle Submission (IPFS)", url: "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco", type: "ipfs" },
    ],
    votesYes: 3,
    votesNo: 1,
    quorumRequired: 5,
    totalCouncilMembers: 9,
    expiresAt: new Date(Date.now() + 14 * 60 * 60 * 1000).toISOString(),
    status: "active",
  },
  {
    id: 2,
    marketQuestion: "Will XLM reach $0.50 by end of March 2026?",
    proposedOutcome: "No",
    disputeReason: "Price data from multiple sources shows XLM briefly touched $0.51 on March 22nd.",
    evidence: [
      { label: "CoinGecko Price History", url: "https://www.coingecko.com/en/coins/stellar", type: "url" },
      { label: "Binance OHLCV Data (IPFS)", url: "QmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7F8ff5o", type: "ipfs" },
      { label: "Kraken Trade Log (IPFS)", url: "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG", type: "ipfs" },
    ],
    votesYes: 5,
    votesNo: 0,
    quorumRequired: 5,
    totalCouncilMembers: 9,
    expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    status: "active",
  },
];
// ─────────────────────────────────────────────────────────────────────────────

export default function GovernancePage() {
  const { publicKey, connecting, connect } = useWalletContext();
  const { isCouncilMember, loading: checkingMembership } = useCouncilMember(publicKey);

  const [disputes, setDisputes] = useState<Dispute[]>(MOCK_DISPUTES);
  const [userVotes, setUserVotes] = useState<Record<number, "yes" | "no">>({});

  const handleVote = useCallback(
    async (disputeId: number, vote: "yes" | "no") => {
      if (!publicKey) return;

      // Optimistic update
      setUserVotes((prev) => ({ ...prev, [disputeId]: vote }));
      setDisputes((prev) =>
        prev.map((d) =>
          d.id === disputeId
            ? {
                ...d,
                votesYes: vote === "yes" ? d.votesYes + 1 : d.votesYes,
                votesNo: vote === "no" ? d.votesNo + 1 : d.votesNo,
              }
            : d
        )
      );

      try {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/governance/disputes/${disputeId}/vote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress: publicKey, vote }),
        });
      } catch {
        // Revert optimistic update on failure
        setUserVotes((prev) => {
          const next = { ...prev };
          delete next[disputeId];
          return next;
        });
        setDisputes(MOCK_DISPUTES);
      }
    },
    [publicKey]
  );

  // ── Wallet not connected ──────────────────────────────────────────────────
  if (!publicKey) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-gray-900 border border-gray-700 rounded-2xl p-8 flex flex-col items-center gap-5 text-center">
          <div className="w-14 h-14 rounded-full bg-indigo-900/50 border border-indigo-700 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7 text-indigo-400">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
          </div>
          <div>
            <h1 className="text-white text-xl font-bold">Stellar Council</h1>
            <p className="text-gray-400 text-sm mt-1">
              Connect your wallet to access the governance dashboard.
            </p>
          </div>
          <button
            onClick={connect}
            disabled={connecting}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl text-white font-semibold transition-colors"
          >
            {connecting ? "Connecting..." : "Connect Freighter Wallet"}
          </button>
        </div>
      </main>
    );
  }

  // ── Checking membership ───────────────────────────────────────────────────
  if (checkingMembership) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400 text-sm animate-pulse">Verifying council membership...</p>
      </main>
    );
  }

  // ── Not a council member ──────────────────────────────────────────────────
  if (!isCouncilMember) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-gray-900 border border-red-900 rounded-2xl p-8 flex flex-col items-center gap-4 text-center">
          <div className="w-14 h-14 rounded-full bg-red-900/40 border border-red-700 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7 text-red-400">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <div>
            <h1 className="text-white text-xl font-bold">Access Denied</h1>
            <p className="text-gray-400 text-sm mt-1">
              This dashboard is restricted to Stellar Council members.
            </p>
            <p className="text-gray-600 text-xs mt-2 font-mono break-all">
              {publicKey.slice(0, 8)}...{publicKey.slice(-8)}
            </p>
          </div>
          <a
            href="/"
            className="text-indigo-400 hover:text-indigo-300 text-sm transition-colors"
          >
            ← Back to markets
          </a>
        </div>
      </main>
    );
  }

  // ── Council Dashboard ─────────────────────────────────────────────────────
  const activeDisputes = disputes.filter((d) => d.status === "active");
  const resolvedDisputes = disputes.filter((d) => d.status !== "active");

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* Top bar */}
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-700 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-white">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <h1 className="text-white font-bold text-base leading-none">Stellar Council</h1>
              <p className="text-indigo-400 text-xs">Governance Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-gray-400 font-mono">
              {publicKey.slice(0, 6)}...{publicKey.slice(-4)}
            </span>
            <span className="text-xs bg-indigo-900 text-indigo-300 px-2 py-0.5 rounded-full font-medium">
              Council Member
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8 flex flex-col gap-8">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Active Disputes", value: activeDisputes.length, color: "text-yellow-400" },
            { label: "Awaiting Quorum", value: activeDisputes.filter((d) => d.votesYes + d.votesNo < d.quorumRequired).length, color: "text-indigo-400" },
            { label: "Resolved (24h)", value: resolvedDisputes.length, color: "text-green-400" },
          ].map((stat) => (
            <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-gray-500 text-xs mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Active disputes */}
        <section>
          <h2 className="text-gray-300 text-sm font-semibold uppercase tracking-wider mb-4">
            Active Votes
          </h2>
          {activeDisputes.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500 text-sm">
              No active disputes. Check back later.
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {activeDisputes.map((dispute) => (
                <VotingCard
                  key={dispute.id}
                  dispute={dispute}
                  onVote={handleVote}
                  hasVoted={dispute.id in userVotes}
                  userVote={userVotes[dispute.id] ?? null}
                />
              ))}
            </div>
          )}
        </section>

        {/* Resolved disputes */}
        {resolvedDisputes.length > 0 && (
          <section>
            <h2 className="text-gray-300 text-sm font-semibold uppercase tracking-wider mb-4">
              Recently Resolved
            </h2>
            <div className="flex flex-col gap-4">
              {resolvedDisputes.map((dispute) => (
                <VotingCard
                  key={dispute.id}
                  dispute={dispute}
                  onVote={handleVote}
                  hasVoted={dispute.id in userVotes}
                  userVote={userVotes[dispute.id] ?? null}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
