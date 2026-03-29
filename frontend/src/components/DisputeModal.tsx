"use client";

import { useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DisputeStatus = "submitted" | "under_review" | "resolved";

export interface DisputeState {
  status: DisputeStatus;
  reason: string;
  submittedAt: string;
}

interface Props {
  marketId: number;
  onClose: () => void;
  onSubmitted: (dispute: DisputeState) => void;
  /** Override fetch for testing */
  fetcher?: (marketId: number, reason: string, evidenceUrl: string) => Promise<void>;
}

const MIN_REASON_LENGTH = 50;

async function defaultFetcher(
  marketId: number,
  reason: string,
  evidenceUrl: string
): Promise<void> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/markets/${marketId}/dispute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason, evidenceUrl: evidenceUrl || undefined }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Failed to submit dispute");
  }
}

// ── DisputeModal ──────────────────────────────────────────────────────────────

export default function DisputeModal({
  marketId,
  onClose,
  onSubmitted,
  fetcher = defaultFetcher,
}: Props) {
  const [reason, setReason] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const reasonTooShort = reason.trim().length < MIN_REASON_LENGTH;
  const charsLeft = MIN_REASON_LENGTH - reason.trim().length;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (reasonTooShort) return;
    setSubmitting(true);
    setError("");
    try {
      await fetcher(marketId, reason.trim(), evidenceUrl.trim());
      onSubmitted({
        status: "submitted",
        reason: reason.trim(),
        submittedAt: new Date().toISOString(),
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      data-testid="dispute-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        data-testid="dispute-modal"
        className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg p-6 space-y-5 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold text-lg">Dispute Outcome</h2>
          <button
            data-testid="dispute-modal-close"
            onClick={onClose}
            aria-label="Close dispute modal"
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="w-5 h-5"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-gray-400 text-sm">
          Describe why you believe this market was resolved incorrectly. Your dispute will be
          reviewed by the resolution committee.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Reason */}
          <div className="space-y-1.5">
            <label className="text-gray-300 text-xs uppercase tracking-wide font-medium">
              Reason <span className="text-red-400">*</span>
            </label>
            <textarea
              data-testid="dispute-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why the resolution is incorrect (min 50 characters)…"
              rows={4}
              className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 text-sm outline-none border border-gray-700 focus:border-orange-500 transition-colors resize-none"
            />
            {reasonTooShort && reason.length > 0 && (
              <p data-testid="reason-error" className="text-orange-400 text-xs">
                {charsLeft} more character{charsLeft !== 1 ? "s" : ""} required
              </p>
            )}
          </div>

          {/* Evidence URL */}
          <div className="space-y-1.5">
            <label className="text-gray-300 text-xs uppercase tracking-wide font-medium">
              Evidence URL <span className="text-gray-500">(optional)</span>
            </label>
            <input
              data-testid="dispute-evidence-url"
              type="url"
              value={evidenceUrl}
              onChange={(e) => setEvidenceUrl(e.target.value)}
              placeholder="https://example.com/evidence"
              className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 text-sm outline-none border border-gray-700 focus:border-orange-500 transition-colors"
            />
          </div>

          {/* API error */}
          {error && (
            <p data-testid="dispute-submit-error" className="text-red-400 text-sm">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-3 rounded-xl text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              data-testid="dispute-submit-btn"
              type="submit"
              disabled={reasonTooShort || submitting}
              className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-3 rounded-xl text-sm font-bold transition-colors"
            >
              {submitting ? "Submitting…" : "Submit Dispute"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
