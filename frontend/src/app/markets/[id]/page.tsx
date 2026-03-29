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
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useWalletContext } from "../../../context/WalletContext";
import ProbabilityChart from "../../../components/ProbabilityChart";
import OddsChart from "../../../components/OddsChart";
import TradeModal from "../../../components/TradeModal";
import MarketComments from "../../../components/MarketComments";
import PoolOwnershipChart from "../../../components/PoolOwnershipChart";
import RelatedMarketsCarousel from "../../../components/RelatedMarketsCarousel";
import ContractErrorBoundary from "../../../components/ContractErrorBoundary";
import SocialSentiment from "../../../components/SocialSentiment";
import SimulatorPanel from "../../../components/SimulatorPanel";
import ShareModal from "../../../components/ShareModal";
import DisputeModal from "../../../components/DisputeModal";
import DisputeStatusTracker from "../../../components/DisputeStatusTracker";
import { type DisputeState } from "../../../components/DisputeModal";
import { store } from "../../../store";
import MarketDetailSkeleton from "../../../components/skeletons/MarketDetailSkeleton";

interface Market {
  id: number;
  question: string;
  total_pool: string;
  outcomes: string[];
  end_date: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function MarketDetailPage() {
  const params = useParams();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { publicKey, connect } = useWalletContext();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [market, setMarket] = useState<Market | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [error, setError] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [shareOpen, setShareOpen] = useState(false);

  const marketId = Number(params?.id);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const market = await fetchMarket(params.id);
  if (!market) return { title: "Market Not Found" };

  const pool = parseFloat(market.total_pool).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
  const odds = market.outcomes
    .map((o) => `${o}: ${(100 / market.outcomes.length).toFixed(0)}%`)
    .join(" · ");
  const description = `${odds} · Pool: ${pool} XLM`;
  const canonicalUrl = `${SITE_URL}/markets/${market.id}`;
  const ogImage = `${SITE_URL}/api/og?id=${market.id}`;

  return {
    title: market.question,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title: market.question,
      description,
      url: canonicalUrl,
      images: [{ url: ogImage }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: market.question,
      description,
      images: [ogImage],
    },
  };
}

export default async function MarketsDetailPage({ params }: { params: { id: string } }) {
  const market = await fetchMarket(params.id);
  if (!market) notFound();

  // MarketDetailPage is a client component — wrap with a fresh QueryClient
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const queryClient = new QueryClient();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [disputeOpen, setDisputeOpen] = useState(false);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [dispute, setDispute] = useState<DisputeState | null>(null);

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-950 text-white">
        <nav className="flex items-center gap-3 px-4 md:px-6 py-4 border-b border-gray-800 sticky top-0 z-30 bg-gray-950/90 backdrop-blur-sm">
          <button
            onClick={() => router.push("/")}
            className="text-gray-400 hover:text-white transition-colors flex items-center gap-2"
            aria-label="Back to markets"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="w-5 h-5"
            >
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            <span className="text-sm">Back</span>
          </button>
          <Link href="/" className="text-blue-400 font-bold text-sm">
            Stella Polymarket
          </Link>
        </nav>
        <MarketDetailSkeleton />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* Top nav with back button */}
      <nav className="flex items-center gap-3 px-4 md:px-6 py-4 border-b border-gray-800 sticky top-0 z-30 bg-gray-950/90 backdrop-blur-sm">
        <button
          onClick={() => router.push("/")}
          className="text-gray-400 hover:text-white transition-colors flex items-center gap-2"
          aria-label="Back to markets"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="w-5 h-5"
          >
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          <span className="text-sm">Back</span>
        </button>
        <Link href="/" className="text-blue-400 font-bold text-sm">
          Stella Polymarket
        </Link>
        <span className="text-gray-600">/</span>
        <span className="text-gray-400 text-sm truncate max-w-xs">
          {market?.question.slice(0, 50) + (market && market.question.length > 50 ? "…" : "")}
        </span>
      </nav>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* ── HERO: Question + status badges ── */}
        {market && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {market.resolved ? (
                <span className="text-xs bg-green-800 text-green-300 px-2.5 py-1 rounded-full font-medium">
                  Resolved
                </span>
              ) : isExpired ? (
                <span className="text-xs bg-yellow-800 text-yellow-300 px-2.5 py-1 rounded-full font-medium">
                  Ended
                </span>
              ) : (
                <span className="text-xs bg-blue-800 text-blue-300 px-2.5 py-1 rounded-full font-medium animate-pulse">
                  ● Live
                </span>
              )}
              <span className="text-xs text-gray-500">
                {daysLeft === 0 ? "Ends today" : `${daysLeft}d remaining`} · Ends{" "}
                {new Date(market.end_date).toLocaleDateString()}
              </span>
              <button
                data-testid="share-button"
                onClick={() => setShareOpen(true)}
                className="ml-auto flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white px-3 py-1.5 rounded-full border border-gray-700 transition-colors"
                aria-label="Share market"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="w-3.5 h-3.5"
                >
                  <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
                </svg>
                Share
              </button>
              {market.resolved &&
                market.dispute_window_ends_at &&
                new Date(market.dispute_window_ends_at) > new Date() &&
                (dispute ? (
                  <button
                    data-testid="dispute-submitted-btn"
                    disabled
                    className="flex items-center gap-1.5 text-xs bg-gray-800 text-gray-500 px-3 py-1.5 rounded-full border border-gray-700 cursor-not-allowed"
                  >
                    Dispute Submitted
                  </button>
                ) : (
                  <button
                    data-testid="dispute-outcome-btn"
                    onClick={() => setDisputeOpen(true)}
                    className="flex items-center gap-1.5 text-xs bg-orange-900/50 hover:bg-orange-800/60 text-orange-300 hover:text-orange-200 px-3 py-1.5 rounded-full border border-orange-700/50 transition-colors"
                  >
                    Dispute Outcome
                  </button>
                ))}
            </div>
            <h1 className="text-xl md:text-3xl font-bold text-white leading-snug">
              {market.question}
            </h1>
            {market.description && (
              <p className="text-gray-400 text-sm leading-relaxed max-w-3xl">
                {market.description}
              </p>
            )}
          </div>
        )}

        {/* ── MAIN LAYOUT: Two-column desktop / Single-column mobile ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[65%_35%] gap-6">
          {/* Left column (65%) — market info, odds chart, bet history */}
          <div className="min-w-0 space-y-6">
            {/* 1. PROBABILITY CHART — primary element */}
            {market ? <ProbabilityChart marketId={market.id} outcomes={market.outcomes} /> : null}

            {/* 2. ODDS HISTORY CHART — time range controls */}
            {market ? <OddsChart marketId={market.id} /> : null}

            {/* 3. Current prices row */}
            {market && (
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
                      <p
                        className={`text-2xl font-bold ${isWinner ? "text-green-400" : "text-white"}`}
                      >
                        {prob}%
                      </p>
                      <p className="text-gray-500 text-xs">
                        {(parseFloat(market.total_pool) / market.outcomes.length).toFixed(0)} XLM
                      </p>
                    </div>
                  );
                })}
                {/* Total pool stat */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center space-y-1">
                  <p className="text-gray-400 text-xs">Total Pool</p>
                  <p className="text-2xl font-bold text-blue-400">
                    {parseFloat(market.total_pool).toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })}
                  </p>
                  <p className="text-gray-500 text-xs">XLM</p>
                </div>
              </div>
            )}

            {/* 3. Bet History Table */}
            {market && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="text-white font-semibold text-base mb-4">Recent Bets</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-400 text-xs border-b border-gray-800">
                        <th className="text-left pb-2">Wallet</th>
                        <th className="text-left pb-2">Outcome</th>
                        <th className="text-right pb-2">Amount</th>
                        <th className="text-right pb-2">Time</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-300">
                      <tr className="border-b border-gray-800/50">
                        <td className="py-2 font-mono text-xs">G...ABC</td>
                        <td className="py-2">{market.outcomes[0]}</td>
                        <td className="py-2 text-right">100 XLM</td>
                        <td className="py-2 text-right text-gray-500">2m ago</td>
                      </tr>
                      <tr className="border-b border-gray-800/50">
                        <td className="py-2 font-mono text-xs">G...XYZ</td>
                        <td className="py-2">{market.outcomes[1] || market.outcomes[0]}</td>
                        <td className="py-2 text-right">250 XLM</td>
                        <td className="py-2 text-right text-gray-500">5m ago</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 4. Pool ownership chart */}
            {market && (
              <ContractErrorBoundary context={`PoolChart-${market.id}`} store={store}>
                <PoolOwnershipChart marketId={market.id} />
              </ContractErrorBoundary>
            )}

            {/* 5. Social sentiment */}
            {market && (
              <SocialSentiment
                outcomes={market.outcomes}
                totalPool={parseFloat(market.total_pool)}
              />
            )}

            {/* 6. Firebase-powered comments */}
            {market && <MarketComments marketId={market.id} walletAddress={publicKey} />}

            {/* 7. Market rules + truth sources */}
            {market && (
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
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="w-4 h-4"
                      >
                        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                      </svg>
                      {market.truth_source}
                    </a>
                  </div>
                )}

                {/* Fallback truth source links */}
                {!market.truth_source && (
                  <div className="space-y-2">
                    <p className="text-gray-400 text-xs uppercase tracking-wide">
                      Reference Sources
                    </p>
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

            {/* 8. Dispute status tracker — shown after dispute submitted */}
            {dispute && (
              <DisputeStatusTracker status={dispute.status} submittedAt={dispute.submittedAt} />
            )}
          </div>

          {/* Right column (35%) — Sticky bet form on desktop */}
          <div className="w-full">
            <div className="lg:sticky lg:top-20 space-y-4">
              {market ? (
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

              {/* What-If Simulator Panel */}
              {market && <SimulatorPanel market={market} />}
            </div>
          </div>
        </div>

        {/* ── FOOTER: Related Markets carousel ── */}
        {market && (
          <div className="border-t border-gray-800 pt-6">
            <RelatedMarketsCarousel currentMarketId={market.id} currentQuestion={market.question} />
          </div>
        )}
      </div>

      {/* Share modal */}
      {shareOpen && market && (
        <ShareModal
          marketId={market.id}
          question={market.question}
          yesOdds={Math.round(100 / market.outcomes.length)}
          noOdds={Math.round(100 - 100 / market.outcomes.length)}
          totalPool={parseFloat(market.total_pool)}
          endDate={market.end_date}
          onClose={() => setShareOpen(false)}
        />
      )}

      {/* Dispute modal */}
      {disputeOpen && market && (
        <DisputeModal
          marketId={market.id}
          onClose={() => setDisputeOpen(false)}
          onSubmitted={(d) => {
            setDispute(d);
            setDisputeOpen(false);
          }}
        />
      )}
    </main>
  );
}
