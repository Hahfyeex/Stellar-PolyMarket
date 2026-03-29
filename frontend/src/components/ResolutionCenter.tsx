"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "../hooks/useWallet";
import type { Market, ResolutionState } from "../types/market";

// Mock/Constant for admin address - in production this comes from env
const ADMIN_ADDRESS = process.env.NEXT_PUBLIC_ADMIN_ADDRESS || "GBADMIN...";

async function fetchProposedMarkets(): Promise<Market[]> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/markets?status=PROPOSED`);
  if (!res.ok) throw new Error("Failed to fetch proposed markets");
  return res.json();
}

async function approveMarket(marketId: number) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/markets/${marketId}/resolve`, {
    method: "POST",
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to approve market");
  }
  return res.json();
}

async function disputeMarket({ marketId, reason }: { marketId: number; reason: string }) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/markets/${marketId}/dispute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to dispute market");
  }
  return res.json();
}

export function AdminResolutionCenter() {
  const { publicKey } = useWallet();
  const connected = !!publicKey;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [disputeModal, setDisputeModal] = useState<{ id: number; reason: string } | null>(null);

  useEffect(() => {
    if (connected && publicKey && publicKey !== ADMIN_ADDRESS) {
      alert("Permission Denied: Admin access only");
      router.push("/");
    }
  }, [connected, publicKey, router]);

  const { data: markets, isLoading, error } = useQuery({
    queryKey: ["markets", "proposed"],
    queryFn: fetchProposedMarkets,
    refetchInterval: 30000,
    enabled: publicKey === ADMIN_ADDRESS,
  });

  const approveMutation = useMutation({
    mutationFn: approveMarket,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["markets", "proposed"] });
      alert("Market approved and resolved on-chain!");
    },
    onError: (err) => alert(`Approval Error: ${err.message}`),
  });

  const disputeMutation = useMutation({
    mutationFn: disputeMarket,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["markets", "proposed"] });
      setDisputeModal(null);
      alert("Market disputed successfully!");
    },
    onError: (err) => alert(`Dispute Error: ${err.message}`),
  });

  if (!connected || publicKey !== ADMIN_ADDRESS) {
    return (
      <div className="p-8 text-center bg-slate-900 rounded-2xl border border-slate-800">
        <h2 className="text-xl font-bold text-white">Admin Access Required</h2>
        <p className="mt-2 text-slate-400">Please connect the administrator wallet to continue.</p>
      </div>
    );
  }

  if (isLoading) return <div className="p-8 text-center text-white">Loading proposed markets...</div>;
  if (error) return <div className="p-8 text-center text-red-400">Error: {error.message}</div>;

  return (
    <section className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-white">Resolution Center</h2>
          <p className="text-slate-400">Review and resolve markets with proposed outcomes.</p>
        </div>
        <div className="bg-cyan-500/10 border border-cyan-500/20 px-3 py-1 rounded-full text-xs text-cyan-400 font-medium">
          Admin: {publicKey.slice(0, 6)}...{publicKey.slice(-4)}
        </div>
      </div>

      <div className="grid gap-4">
        {markets?.length === 0 && (
          <div className="p-12 text-center bg-slate-900/50 rounded-2xl border border-slate-800 border-dashed">
            <p className="text-slate-500">No markets currently awaiting resolution.</p>
          </div>
        )}
        
        {markets?.map((market) => (
          <div key={market.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-6 transition-all hover:border-slate-700">
            <div className="flex-1 space-y-2">
              <h3 className="text-lg font-semibold text-white">{market.question}</h3>
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="text-slate-400">
                  Proposed: <span className="text-emerald-400 font-medium">{market.outcomes[market.proposed_outcome ?? 0] || "Unknown"}</span>
                </div>
                <div className="text-slate-400">
                  Pool: <span className="text-white">{market.total_pool} XLM</span>
                </div>
                <div className="text-slate-400">
                  ID: <span className="font-mono">{market.id}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 shrink-0">
              <button
                onClick={() => {
                  if (confirm("Are you sure you want to approve this resolution? This will trigger on-chain settlement.")) {
                    approveMutation.mutate(market.id);
                  }
                }}
                disabled={approveMutation.isPending}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-xl text-white font-bold transition-colors"
              >
                {approveMutation.isPending ? "Approving..." : "Approve"}
              </button>
              <button
                onClick={() => setDisputeModal({ id: market.id, reason: "" })}
                className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-white font-bold transition-colors border border-slate-700"
              >
                Dispute
              </button>
            </div>
          </div>
        ))}
      </div>

      {disputeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-bold text-white">Dispute Resolution</h3>
            <p className="mt-1 text-sm text-slate-400">Provide a reason for contesting the proposed outcome.</p>
            
            <textarea
              className="mt-4 w-full h-32 bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-sm outline-none focus:border-amber-500 transition-colors"
              placeholder="Enter dispute reason..."
              value={disputeModal.reason}
              onChange={(e) => setDisputeModal({ ...disputeModal, reason: e.target.value })}
            />

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => disputeMutation.mutate({ marketId: disputeModal.id, reason: disputeModal.reason })}
                disabled={!disputeModal.reason || disputeMutation.isPending}
                className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-slate-950 font-bold rounded-xl transition-colors"
              >
                {disputeMutation.isPending ? "Submitting..." : "Submit Dispute"}
              </button>
              <button
                onClick={() => setDisputeModal(null)}
                className="px-6 py-3 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
import { useEffect, useMemo, useState } from "react";
import type { Market, ResolutionState } from "../types/market";

interface Props {
  market: Market;
  compact?: boolean;
}

interface StepItem {
  key: ResolutionState | "challenge";
  title: string;
  detail: string;
}

const STEP_ORDER: StepItem[] = [
  {
    key: "closed",
    title: "Market Closed",
    detail: "Trading has ended. No new positions can be opened.",
  },
  {
    key: "proposed",
    title: "Outcome Proposed",
    detail: "A proposed outcome has been posted from the referenced reporting sources.",
  },
  {
    key: "challenge",
    title: "24h Challenge Window",
    detail: "Users can contest the proposal before settlement proceeds.",
  },
  {
    key: "settled",
    title: "Final Settlement",
    detail: "Funds are released once the resolution path is complete.",
  },
];

const STATE_INDEX: Record<ResolutionState, number> = {
  closed: 0,
  proposed: 1,
  disputed: 2,
  settled: 3,
};

function formatCountdown(target: string | null | undefined) {
  if (!target) return "Timer unavailable";

  const diffMs = new Date(target).getTime() - Date.now();
  if (Number.isNaN(diffMs)) return "Timer unavailable";
  if (diffMs <= 0) return "Expired";

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function getResolutionState(market: Market): ResolutionState {
  if (market.resolution_state) return market.resolution_state;
  if (market.resolved) return "settled";
  if (market.status === "DISPUTED") return "disputed";
  if (market.status === "PROPOSED") return "proposed";
  return "closed";
}

function getStepStatus(stepKey: StepItem["key"], state: ResolutionState) {
  if (state === "disputed") {
    if (stepKey === "closed" || stepKey === "proposed" || stepKey === "challenge") return "active";
    return "upcoming";
  }

  const currentIndex = STATE_INDEX[state];
  const stepIndex =
    stepKey === "challenge"
      ? 2
      : stepKey === "settled"
      ? 3
      : STATE_INDEX[stepKey];

  if (stepIndex < currentIndex) return "complete";
  if (stepIndex === currentIndex) return "active";
  return "upcoming";
}

export default function ResolutionCenter({ market, compact = false }: Props) {
  const state = getResolutionState(market);
  const [now, setNow] = useState(Date.now());
  const resolutionStarted =
    market.resolved ||
    market.status === "PROPOSED" ||
    market.status === "DISPUTED" ||
    Boolean(market.resolution_state) ||
    new Date(market.end_date).getTime() <= now;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const proposedOutcomeLabel = useMemo(() => {
    const index = market.proposed_outcome ?? market.winning_outcome;
    if (index === null || index === undefined) return "Pending";
    return market.outcomes[index] ?? `Outcome ${index}`;
  }, [market.outcomes, market.proposed_outcome, market.winning_outcome]);

  const challengeCountdown = useMemo(
    () => formatCountdown(market.challenge_window_ends_at),
    [market.challenge_window_ends_at, now]
  );
  const disputeCountdown = useMemo(
    () => formatCountdown(market.council_vote_ends_at),
    [market.council_vote_ends_at, now]
  );

  return (
    <section className="rounded-2xl border border-slate-700/70 bg-slate-950/80 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.35)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-300/80">
            Resolution Center
          </p>
          <h4 className="mt-1 text-lg font-semibold text-white">How this market resolves</h4>
          <p className="mt-1 max-w-2xl text-sm text-slate-300">
            Track the proposal, challenge window, and final settlement so you can see whether funds
            are pending review, formally challenged, or ready to settle.
          </p>
        </div>

        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
          Proposed outcome: <span className="font-semibold">{proposedOutcomeLabel}</span>
        </div>
      </div>

      {!resolutionStarted && (
        <div className="mt-4 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-4">
          <p className="text-sm font-semibold text-emerald-100">Market is still trading</p>
          <p className="mt-1 text-sm text-emerald-50/85">
            Resolution starts after the market closes. Once trading ends, the proposed outcome and
            review timers will appear here.
          </p>
        </div>
      )}

      {state === "disputed" && (
        <div className="mt-4 rounded-2xl border border-amber-400/50 bg-amber-400/12 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200">
                Dispute Active
              </p>
              <p className="mt-1 text-base font-semibold text-amber-50">
                Resolution is under review by the council.
              </p>
              <p className="mt-1 text-sm text-amber-100/90">
                Funds remain locked until the dispute is resolved and final settlement is confirmed.
              </p>
            </div>
            <div className="rounded-xl bg-amber-950/60 px-4 py-3 text-center">
              <p className="text-[11px] uppercase tracking-[0.22em] text-amber-300">Council Vote</p>
              <p className="mt-1 text-2xl font-bold text-white">{disputeCountdown}</p>
            </div>
          </div>
        </div>
      )}

      {state === "proposed" && market.challenge_window_ends_at && (
        <div className="mt-4 rounded-2xl border border-blue-400/30 bg-blue-400/10 p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-50">Challenge window is open</p>
              <p className="text-sm text-blue-100/85">
                If no valid dispute is raised, this market settles automatically when the timer ends.
              </p>
            </div>
            <div className="text-sm font-semibold text-blue-100">{challengeCountdown}</div>
          </div>
        </div>
      )}

      <div className={`mt-5 flex gap-4 ${compact ? "flex-col" : "flex-col md:flex-row"}`}>
        {STEP_ORDER.map((step, index) => {
          const stepStatus = resolutionStarted ? getStepStatus(step.key, state) : "upcoming";
          const markerClass =
            stepStatus === "complete"
              ? "border-emerald-400 bg-emerald-400 text-slate-950"
              : stepStatus === "active"
              ? "border-cyan-300 bg-cyan-300 text-slate-950"
              : "border-slate-600 bg-slate-900 text-slate-400";

          const lineClass =
            stepStatus === "upcoming" ? "bg-slate-700" : "bg-gradient-to-r from-cyan-300 to-emerald-400";

          return (
            <div key={step.key} className="flex flex-1 gap-3 md:flex-col">
              <div className="flex md:flex-col md:items-start md:gap-3">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${markerClass}`}>
                  {index + 1}
                </div>
                {index < STEP_ORDER.length - 1 && (
                  <div className={`ml-4 mt-2 h-12 w-[2px] md:ml-0 md:mt-3 md:h-[2px] md:w-full ${lineClass}`} />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{step.title}</p>
                <p className="mt-1 text-sm leading-6 text-slate-300">{step.detail}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
            Resolution Notes
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-200">
            {market.resolution_notes ??
              "Resolution follows the standard sequence: market closes, an outcome is proposed, a challenge window stays open for review, and settlement completes after the dispute path clears."}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
            Official Sources
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(market.resolution_sources ?? []).map((source) => (
              <a
                key={source.url}
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-full border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-100 transition-colors hover:border-cyan-300 hover:text-cyan-200"
              >
                {source.label}
              </a>
            ))}
            {(market.resolution_sources ?? []).length === 0 && (
              <span className="text-sm text-slate-400">No source links published yet.</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
