"use client";
/**
 * ShareModal — Issue #483
 *
 * Opens a modal with three share actions:
 *   1. Download PNG  (html2canvas → anchor download)
 *   2. Copy Link     (navigator.clipboard)
 *   3. Share to Twitter with pre-filled tweet text
 */
import React, { useRef, useState } from "react";
import html2canvas from "html2canvas";
import ShareCard, { ShareCardProps } from "./ShareCard";

interface Props extends ShareCardProps {
  marketId: number | string;
  onClose: () => void;
}

function buildTweetText(question: string, yesOdds: number, noOdds: number, link: string): string {
  const q = question.length > 80 ? question.slice(0, 77) + "…" : question;
  return `I just bet on "${q}" on Stella Polymarket. Current odds: YES ${yesOdds}% / NO ${noOdds}%. ${link}`;
}

export { buildTweetText };

export default function ShareModal({ marketId, onClose, ...cardProps }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/markets/${marketId}`
      : `/markets/${marketId}`;

  async function handleDownload() {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(cardRef.current, { scale: 2, useCORS: true });
      const link = document.createElement("a");
      link.download = `stella-market-${marketId}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } finally {
      setDownloading(false);
    }
  }

  async function handleCopyLink() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleTwitter() {
    const tweet = buildTweetText(cardProps.question, cardProps.yesOdds, cardProps.noOdds, shareUrl);
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweet)}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Share market"
      data-testid="share-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-lg flex flex-col gap-5 shadow-2xl">
        {/* Title row */}
        <div className="flex items-center justify-between">
          <h2 className="text-white font-bold text-lg">Share Market</h2>
          <button
            data-testid="share-modal-close"
            onClick={onClose}
            aria-label="Close share modal"
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Preview card (off-screen capture target) */}
        <div className="overflow-hidden rounded-xl" style={{ pointerEvents: "none" }}>
          <ShareCard ref={cardRef} {...cardProps} />
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-3">
          <button
            data-testid="share-download"
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-semibold rounded-xl px-4 py-3 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            {downloading ? "Generating…" : "Download PNG"}
          </button>

          <button
            data-testid="share-copy-link"
            onClick={handleCopyLink}
            className="flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-xl px-4 py-3 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
            {copied ? "Copied!" : "Copy Link"}
          </button>

          <button
            data-testid="share-twitter"
            onClick={handleTwitter}
            className="flex items-center justify-center gap-2 bg-sky-500 hover:bg-sky-400 text-white font-semibold rounded-xl px-4 py-3 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            Share on Twitter
          </button>
        </div>
      </div>
    </div>
  );
}
