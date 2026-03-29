"use client";
/**
 * ShareCard — Issue #483
 *
 * Renders a styled card captured by html2canvas as a PNG.
 * Kept as a pure presentational component (no side-effects) so it can be
 * rendered off-screen and snapshotted reliably.
 */
import React from "react";

export interface ShareCardProps {
  question: string;
  yesOdds: number;
  noOdds: number;
  totalPool: number;
  endDate: string;
}

const ShareCard = React.forwardRef<HTMLDivElement, ShareCardProps>(
  ({ question, yesOdds, noOdds, totalPool, endDate }, ref) => {
    const truncated = question.length > 100 ? question.slice(0, 97) + "…" : question;
    const formattedPool = totalPool.toLocaleString(undefined, { maximumFractionDigits: 0 });
    const formattedDate = new Date(endDate).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    return (
      <div
        ref={ref}
        data-testid="share-card"
        style={{
          width: 600,
          background: "linear-gradient(135deg, #111827 0%, #1e3a8a 100%)",
          borderRadius: 16,
          padding: 32,
          fontFamily: "system-ui, -apple-system, sans-serif",
          color: "#fff",
          boxSizing: "border-box",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "#3b82f6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              fontWeight: 700,
            }}
          >
            ★
          </div>
          <span style={{ fontWeight: 700, fontSize: 16, color: "#60a5fa" }}>
            Stella Polymarket
          </span>
        </div>

        {/* Question */}
        <p
          data-testid="share-card-question"
          style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.4, marginBottom: 24 }}
        >
          {truncated}
        </p>

        {/* Odds row */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          <div
            data-testid="share-card-yes"
            style={{
              flex: 1,
              background: "rgba(34,197,94,0.15)",
              border: "1px solid #16a34a",
              borderRadius: 12,
              padding: "12px 16px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 12, color: "#4ade80", marginBottom: 4 }}>YES</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#4ade80" }}>{yesOdds}%</div>
          </div>
          <div
            data-testid="share-card-no"
            style={{
              flex: 1,
              background: "rgba(239,68,68,0.15)",
              border: "1px solid #dc2626",
              borderRadius: 12,
              padding: "12px 16px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 12, color: "#f87171", marginBottom: 4 }}>NO</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#f87171" }}>{noOdds}%</div>
          </div>
        </div>

        {/* Footer stats */}
        <div style={{ display: "flex", justifyContent: "space-between", color: "#9ca3af", fontSize: 13 }}>
          <span data-testid="share-card-pool">Pool: {formattedPool} XLM</span>
          <span data-testid="share-card-date">Ends {formattedDate}</span>
        </div>
      </div>
    );
  }
);

ShareCard.displayName = "ShareCard";
export default ShareCard;
