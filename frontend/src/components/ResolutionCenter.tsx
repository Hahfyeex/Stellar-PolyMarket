"use client";

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
