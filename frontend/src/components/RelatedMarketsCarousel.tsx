"use client";
/**
 * RelatedMarketsCarousel
 *
 * Horizontally scrollable carousel of related markets shown at the footer
 * of the Market Detail page. Matches by category keyword overlap.
 */
import { useEffect, useState } from "react";
import Link from "next/link";

interface Market {
  id: number;
  question: string;
  total_pool: string;
  end_date: string;
  outcomes: string[];
  resolved: boolean;
}

interface Props {
  currentMarketId: number;
  currentQuestion: string;
}

/** Simple keyword-based relatedness: share at least one word (>4 chars) */
function isRelated(a: string, b: string): boolean {
  const words = (s: string) =>
    s.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
  const setA = new Set(words(a));
  return words(b).some((w) => setA.has(w));
}

export default function RelatedMarketsCarousel({ currentMarketId, currentQuestion }: Props) {
  const [markets, setMarkets] = useState<Market[]>([]);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/markets`)
      .then((r) => r.json())
      .then((data) => {
        const all: Market[] = data.markets ?? [];
        const related = all.filter(
          (m) => m.id !== currentMarketId && isRelated(currentQuestion, m.question)
        );
        // Fallback: show any 6 markets if no keyword matches
        setMarkets(related.length >= 2 ? related.slice(0, 8) : all.filter((m) => m.id !== currentMarketId).slice(0, 6));
      })
      .catch(() => setMarkets([]));
  }, [currentMarketId, currentQuestion]);

  if (!markets.length) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-white font-semibold text-base">Related Markets</h3>
      <div
        className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory"
        style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}
      >
        {markets.map((m) => {
          const daysLeft = Math.max(
            0,
            Math.ceil((new Date(m.end_date).getTime() - Date.now()) / 86_400_000)
          );
          const pool = parseFloat(m.total_pool).toLocaleString(undefined, { maximumFractionDigits: 0 });
          return (
            <Link
              key={m.id}
              href={`/markets/${m.id}`}
              className="snap-start shrink-0 w-56 bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-blue-700/50 transition-colors space-y-2"
            >
              <p className="text-white text-sm font-medium leading-snug line-clamp-3">{m.question}</p>
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span className="text-blue-400 font-medium">{pool} XLM</span>
                <span>{daysLeft === 0 ? "Ends today" : `${daysLeft}d left`}</span>
              </div>
              {m.resolved && (
                <span className="text-xs bg-green-900/40 text-green-400 px-2 py-0.5 rounded-full">Resolved</span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
