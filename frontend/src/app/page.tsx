"use client";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "next/navigation";
import { useWalletContext } from "../context/WalletContext";
import MarketCard from "../components/MarketCard";
import MarketCardSkeleton from "../components/skeletons/MarketCardSkeleton";
import MarketFilters from "../components/MarketFilters";
import NotificationManager from "../components/NotificationManager";
import LiveActivityFeed from "../components/LiveActivityFeed";
import MobileShell from "../components/mobile/MobileShell";
import PullToRefresh from "../components/mobile/PullToRefresh";
import InsufficientGasModal from "../components/ErrorStates/InsufficientGasModal";
import MarketDiscoveryGrid from "../components/MarketDiscoveryGrid";
import ContractErrorBoundary from "../components/ContractErrorBoundary";
import LanguageSelector from "../components/LanguageSelector";
import { store } from "../store";
import { trackEvent } from "../lib/firebase";
import { useTheme } from "../hooks/useTheme";
import { useMarketSearch, SearchFilters, SortKey } from "../hooks/useMarketSearch";

interface Market {
  id: number;
  question: string;
  end_date: string;
  outcomes: string[];
  resolved: boolean;
  winning_outcome: number | null;
  total_pool: string;
  status: string;
}

export default function Home() {
  const { publicKey, connecting, error, connect, disconnect } = useWalletContext();
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeMarket, setActiveMarket] = useState<Market | null>(null);
  const [isGasModalOpen, setIsGasModalOpen] = useState(false);

  // Restore filter state from URL params on mount
  const [filters, setFilters] = useState<SearchFilters>(() => ({
    query: searchParams.get("q") ?? "",
    category: searchParams.get("category") ?? "",
    status: searchParams.get("status") ?? "",
    sort: (searchParams.get("sort") as SortKey) ?? "newest",
  }));

  const filteredMarkets = useMarketSearch(markets, filters);

  const handleHelpClick = () => {
    trackEvent("help_doc_read", {
      source: "navbar_help_button",
      user_wallet_connected: !!publicKey,
    });

    // Open help documentation
    const helpUrl = "https://docs.stella-polymarket.com/help";
    window.open(helpUrl, "_blank");
  };

  async function fetchMarkets() {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/markets`);
      const data = await res.json();
      setMarkets(data.markets || []);
    } catch {
      setMarkets(DEMO_MARKETS);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchMarkets();
  }, []);

  // Auto-select first active market for the FAB
  useEffect(() => {
    const first = markets.find((m) => !m.resolved && new Date(m.end_date) > new Date());
    setActiveMarket(first ?? null);
  }, [markets]);

  const pageContent = (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* Navbar — hidden on mobile (replaced by BottomNavBar), visible on desktop */}
      <nav className="hidden md:flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <div className="flex items-center gap-4">
          <span className="text-xl font-bold text-blue-400">{t("nav.brand")}</span>
          <button
            onClick={toggleTheme}
            className="text-gray-400 hover:text-white transition-colors text-xl"
            title={t("nav.toggleTheme")}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          <button
            onClick={handleHelpClick}
            className="text-gray-400 hover:text-white transition-colors"
            title={t("nav.helpDocs")}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="w-5 h-5"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </button>
          {/* Language selector — allows switching between the 5 supported locales */}
          <LanguageSelector />
        </div>
        {publicKey ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">
              {publicKey.slice(0, 6)}...{publicKey.slice(-4)}
            </span>
            <button
              onClick={disconnect}
              className="text-sm border border-gray-600 px-3 py-1.5 rounded-lg hover:border-gray-400"
            >
              {t("nav.disconnect")}
            </button>
          </div>
        ) : (
          <button
            onClick={connect}
            disabled={connecting}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-semibold"
          >
            {connecting ? t("nav.connecting") : t("nav.connectWallet")}
          </button>
        )}
      </nav>

      {/* Mobile top bar */}
      <div className="flex md:hidden items-center justify-between px-4 py-3 border-b border-gray-800">
        <span className="text-lg font-bold text-blue-400">{t("nav.brand")}</span>
        <div className="flex items-center gap-3">
          <LanguageSelector />
          <button
            onClick={toggleTheme}
            className="text-gray-400 hover:text-white transition-colors text-lg"
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          {publicKey ? (
            <button
              onClick={disconnect}
              className="text-xs border border-gray-600 px-3 py-1.5 rounded-lg"
            >
              {publicKey.slice(0, 4)}...{publicKey.slice(-3)}
            </button>
          ) : (
            <button
              onClick={connect}
              disabled={connecting}
              className="bg-blue-600 disabled:opacity-50 px-3 py-1.5 rounded-lg text-xs font-semibold"
            >
              {connecting ? "..." : t("nav.connect")}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="max-w-4xl mx-auto px-4 mt-4">
          <p className="text-red-400 text-sm bg-red-900/30 px-4 py-2 rounded-lg">{error}</p>
        </div>
      )}

      <InsufficientGasModal isOpen={isGasModalOpen} onClose={() => setIsGasModalOpen(false)} />

      {/* Hero */}
      <section className="flex flex-col items-center justify-center py-10 md:py-16 px-4 text-center">
        <h1 className="text-3xl md:text-5xl font-bold mb-3">{t("hero.headline")}</h1>
        <p className="text-base md:text-xl text-gray-400 max-w-xl">{t("hero.subheading")}</p>
        <div className="max-w-md mx-auto w-full mt-4">
          <NotificationManager walletAddress={publicKey} />
        </div>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-3 gap-3 max-w-2xl mx-auto px-4 pb-8 text-center">
        {[
          { label: t("stats.activeMarkets"), value: markets.filter((m) => !m.resolved).length },
          {
            label: t("stats.totalStaked"),
            value: `${markets.reduce((s, m) => s + parseFloat(m.total_pool || "0"), 0).toFixed(0)} XLM`,
          },
          { label: t("stats.markets"), value: markets.length },
        ].map((stat) => (
          <div key={stat.label} className="bg-gray-900 rounded-xl p-4">
            <p className="text-2xl md:text-3xl font-bold text-blue-400">{stat.value}</p>
            <p className="text-gray-400 mt-1 text-xs md:text-sm">{stat.label}</p>
          </div>
        ))}
      </section>

      {/* Markets + Activity layout */}
      <section className="max-w-6xl mx-auto px-4 pb-6 flex flex-col lg:flex-row gap-6">
        {/* Markets */}
        <div className="flex-1">
          {/* Discovery cards — personalised / trending top 6 */}
          <div className="mb-8">
            <MarketDiscoveryGrid
              onCardClick={(m) => setActiveMarket(markets.find((mk) => mk.id === m.id) ?? null)}
            />
          </div>

          <h2 className="text-xl md:text-2xl font-semibold mb-4">{t("markets.openMarkets")}</h2>
          <MarketFilters filters={filters} onChange={setFilters} />
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <MarketCardSkeleton key={i} />
              ))}
            </div>
          ) : filteredMarkets.length === 0 ? (
            <p className="text-gray-400">No markets found.</p>
          ) : markets.length === 0 ? (
            <p className="text-gray-400">{t("markets.noMarkets")}</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredMarkets.map((market) => (
                <div
                  key={market.id}
                  onClick={() => setActiveMarket(market)}
                  className={`cursor-pointer rounded-xl transition-all ${
                    activeMarket?.id === market.id ? "ring-2 ring-blue-500" : ""
                  }`}
                >
                  <ContractErrorBoundary context={`MarketCard-${market.id}`} store={store}>
                    <MarketCard
                      market={market}
                      walletAddress={publicKey}
                      onBetPlaced={fetchMarkets}
                    />
                  </ContractErrorBoundary>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Live Activity Feed — hidden on mobile to save space */}
        <div className="hidden lg:block w-80 shrink-0">
          <h2 className="text-2xl font-semibold mb-6">{t("markets.recentActivity")}</h2>
          <LiveActivityFeed apiUrl={process.env.NEXT_PUBLIC_API_URL} />
        </div>
      </section>
    </main>
  );

  return (
    <>
      {/* Mobile layout: wrapped in MobileShell + PullToRefresh */}
      <div className="block md:hidden">
        <MobileShell
          activeMarket={activeMarket}
          walletAddress={publicKey}
          onBetPlaced={fetchMarkets}
        >
          <PullToRefresh onRefresh={fetchMarkets}>{pageContent}</PullToRefresh>
        </MobileShell>
      </div>

      {/* Desktop layout: plain */}
      <div className="hidden md:block">{pageContent}</div>
    </>
  );
}

// Demo data when API is offline
const DEMO_MARKETS: Market[] = [
  {
    id: 1,
    question: "Will Bitcoin reach $100k before 2027?",
    end_date: "2026-12-31T00:00:00Z",
    outcomes: ["Yes", "No"],
    resolved: false,
    winning_outcome: null,
    total_pool: "4200",
    status: "open",
  },
  {
    id: 2,
    question: "Will Nigeria inflation drop below 15% this year?",
    end_date: "2026-12-31T00:00:00Z",
    outcomes: ["Yes", "No"],
    resolved: false,
    winning_outcome: null,
    total_pool: "1800",
    status: "open",
  },
  {
    id: 3,
    question: "Will Arsenal win the Premier League?",
    end_date: "2026-05-30T00:00:00Z",
    outcomes: ["Yes", "No"],
    resolved: false,
    winning_outcome: null,
    total_pool: "3100",
    status: "open",
  },
];
