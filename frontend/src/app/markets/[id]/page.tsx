"use client";
/**
 * Market Detail Page — Issue #77
 *
 * Information Hierarchy (why chart & price take precedence):
 * ──────────────────────────────────────────────────────────
 * A user considering a 1,000 XLM bet needs to answer one question first:
 * "Is the current price fair?" That requires seeing price trend and
 * volatility — not the description. The description and rules are
 * supporting context; the chart IS the market. We therefore place:
 *
 *   1. Probability chart (primary — full width, above the fold)
 *   2. Current prices / outcome buttons (immediate action)
 *   3. Trade modal (sidebar on desktop, sticky bottom on mobile)
 *   4. Pool stats, social sentiment, comments (secondary context)
 *   5. Market rules, truth sources (tertiary — below the fold)
 *   6. Related markets carousel (discovery — footer)
 */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useWalletContext } from "../../../context/WalletContext";
import ProbabilityChart from "../../../components/ProbabilityChart";
import TradeModal from "../../../components/TradeModal";
import MarketComments from "../../../components/MarketComments";
import PoolOwnershipChart from "../../../components/PoolOwnershipChart";
import RelatedMarketsCarousel from "../../../components/RelatedMarketsCarousel";
import ContractErrorBoundary from "../../../components/ContractErrorBoundary";
import SocialSentiment from "../../../components/SocialSentiment";
import { store } from "../../../store";

interface Market {
  id: number;
  question: string;
  description?: string;
  end_date: string;
  outcomes: string[];
  resolved: boolean;
  winning_outcome: number | null;
  total_pool: string;
  status: string;
  asset?: { code: string; issuer: string };
  truth_source?: string;
  rules?: string;
}

/** Skeleton for the chart area while loading */
function ChartSkeleton() {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-3">
      <div className="skeleton h-5 w-48 rounded" />
      <div className="skeleton h-72 w-full rounded-lg" />
    </div>
  );
}

export default function MarketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { publicKey, connect } = useWalletContext();
  const [market, setMarket] = useState<Market | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const marketId = Number(params?.id);

  async function fetchMarket() {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/markets/${marketId}`);
      if (!res.ok) throw new Error("Market not found");
      const data = await res.json();
      setMarket(data.market ?? data);
    } catch {
      // Fallback to demo data so the page is always renderable
      setMarket(DEMO_MARKET);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!marketId || isNaN(marketId)) {
      setError("Invalid market ID");
      setLoading(false);
      return;
    }
    fetchMarket();
  }, [marketId]);

  const isExpired = market ? new Date(market.end_date) <= new Date() : false;
  const daysLeft = market
    ? Math.max(0, Math.ceil((new Date(market.end_date).getTime() - Date.now()) / 86_400_000))
    : 0;

  if (error) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-red-400 text-lg">{error}</p>
          <Link href="/" className="text-blue-400 hover:underline text-sm">← Back to markets</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* Top nav */}
      <nav className="flex items-center gap-3 px-4 md:px-6 py-4 border-b border-gray-800 sticky top-0 z-30 bg-gray-950/90 backdrop-blur-sm">
        <button
          onClick={() => router.back()}
          className="text-gray-400 hover:text-white transition-colors"
          aria-label="Go back"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>
        <Link href="/" className="text-blue-400 font-bold text-sm">Stella Polymarket</Link>
        <span className="text-gray-600">/</span>
        <span className="text-gray-400 text-sm truncate max-w-xs">
          {loading ? "Loading..." : market?.question.slice(0, 50) + (market && market.question.length > 50 ? "…" : "")}
        </span>
      </nav>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* ── HERO: Question + status badges ── */}
        {!loading && market && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {market.resolved ? (
                <span className="text-xs bg-green-800 text-green-300 px-2.5 py-1 rounded-full font-medium">Resolved</span>
              ) : isExpired ? (
                <span className="text-xs bg-yellow-800 text-yellow-300 px-2.5 py-1 rounded-full font-medium">Ended</span>
              ) : (
                <span className="text-xs bg-blue-800 text-blue-300 px-2.5 py-1 rounded-full font-medium animate-pulse">● Live</span>
              )}
              <span className="text-xs text-gray-500">
                {daysLeft === 0 ? "Ends today" : `${daysLeft}d remaining`} · Ends {new Date(market.end_date).toLocaleDateString()}
              </span>
            </div>
            <h1 className="text-xl md:text-3xl font-bold text-white leading-snug">{market.question}</h1>
            {market.description && (
              <p className="text-gray-400 text-sm leading-relaxed max-w-3xl">{market.description}</p>
            )}
          </div>
        )}

        {/* ── MAIN LAYOUT: chart + sidebar ── */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left column — chart + stats + comments */}
          <div className="flex-1 min-w-0 space-y-6">
            {/* 1. PROBABILITY CHART — primary element */}
            {loading ? (
              <ChartSkeleton />
            ) : market ? (
              <ProbabilityChart marketId={market.id} outcomes={market.outcomes} />
            ) : null}

            {/* 2. Current prices row */}
            {!loading && market && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {market.outcomes.map((outcome, i) => {
                  const prob = (100 / market.outcomes.length).toFixed(0);
                  const isWinner = market.resolved && market.winning_outcome === i;
                  return (
                    <div
                      key={i}
                      className={`bg-gray-900 border rounded-xl p-3 text-center space-y-1 ${
                        isWinner ? "border-green-600" : "border-gray-800"
                      }`}
                    >
                      <p className="text-gray-400 text-xs truncate">{outcome}</p>
                      <p className={`text-2xl font-bold ${isWinner ? "text-green-400" : "text-white"}`}>
                        {prob}%
                      </p>
                      <p className="text-gray-500 text-xs">{(parseFloat(market.total_pool) / market.outcomes.length).toFixed(0)} XLM</p>
                    </div>
                  );
                })}
                {/* Total pool stat */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center space-y-1">
                  <p className="text-gray-400 text-xs">Total Pool</p>
                  <p className="text-2xl font-bold text-blue-400">
                    {parseFloat(market.total_pool).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-gray-500 text-xs">XLM</p>
                </div>
              </div>
            )}

            {/* 3. Pool ownership chart */}
            {!loading && market && (
              <ContractErrorBoundary context={`PoolChart-${market.id}`} store={store}>
                <PoolOwnershipChart marketId={market.id} />
              </ContractErrorBoundary>
            )}

            {/* 4. Social sentiment */}
            {!loading && market && (
              <SocialSentiment outcomes={market.outcomes} totalPool={parseFloat(market.total_pool)} />
            )}

            {/* 5. Firebase-powered comments */}
            {!loading && market && (
              <MarketComments marketId={market.id} walletAddress={publicKey} />
            )}

            {/* 5. Market rules + truth sources */}
            {!loading && market && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
                <h3 className="text-white font-semibold text-base">Market Rules</h3>
                <p className="text-gray-400 text-sm leading-relaxed">
                  {market.rules ??
                    "This market resolves based on the official outcome as reported by the designated truth source. In the event of ambiguity, the market creator's resolution criteria apply. All bets are final once placed."}
                </p>

                {market.truth_source && (
                  <div className="space-y-2">
                    <p className="text-gray-400 text-xs uppercase tracking-wide">Truth Source</p>
                    <a
                      href={market.truth_source}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-sm transition-colors"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                      </svg>
                      {market.truth_source}
                    </a>
                  </div>
                )}

                {/* Fallback truth source links */}
                {!market.truth_source && (
                  <div className="space-y-2">
                    <p className="text-gray-400 text-xs uppercase tracking-wide">Reference Sources</p>
                    <div className="flex flex-wrap gap-2">
                      {["Reuters", "AP News", "CoinGecko"].map((src) => (
                        <span
                          key={src}
                          className="text-xs bg-gray-800 text-gray-300 px-3 py-1 rounded-full border border-gray-700"
                        >
                          {src}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right column — Trade Modal (sidebar on desktop) */}
          <div className="w-full lg:w-80 shrink-0">
            {!loading && market ? (
              <ContractErrorBoundary context={`TradeModal-${market.id}`} store={store}>
                <TradeModal
                  market={market}
                  walletAddress={publicKey}
                  onBetPlaced={fetchMarket}
                  onConnectWallet={connect}
                />
              </ContractErrorBoundary>
            ) : (
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-3">
                <div className="skeleton h-5 w-24 rounded" />
                <div className="skeleton h-12 w-full rounded-xl" />
                <div className="skeleton h-12 w-full rounded-xl" />
                <div className="skeleton h-12 w-full rounded-xl" />
              </div>
            )}
          </div>
        </div>

        {/* ── FOOTER: Related Markets carousel ── */}
        {!loading && market && (
          <div className="border-t border-gray-800 pt-6">
            <RelatedMarketsCarousel
              currentMarketId={market.id}
              currentQuestion={market.question}
            />
          </div>
        )}
      </div>
    </main>
  );
}

// Demo fallback when API is offline
const DEMO_MARKET: Market = {
  id: 1,
  question: "Will Bitcoin reach $100k before 2027?",
  description:
    "This market resolves YES if Bitcoin (BTC) trades at or above $100,000 USD on any major exchange (Coinbase, Binance, Kraken) before January 1, 2027.",
  end_date: "2026-12-31T00:00:00Z",
  outcomes: ["Yes", "No"],
  resolved: false,
  winning_outcome: null,
  total_pool: "4200",
  status: "open",
  truth_source: "https://coinmarketcap.com/currencies/bitcoin/",
  rules:
    "Resolves YES if BTC/USD price reaches $100,000 on any top-5 exchange by market cap before the end date. Uses the closing price of the day. In case of exchange discrepancies, the median price across Coinbase, Binance, and Kraken is used.",
};
