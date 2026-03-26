"use client";
/**
 * MarketDiscoveryGrid
 *
 * Fetches markets + user activity, runs the suggestion ranking algorithm,
 * and renders the top 6 discovery cards in a responsive grid.
 *
 * Data flow:
 *   1. GET /api/markets → all active markets
 *   2. GET /api/users/:wallet/activity → user category history (if wallet connected)
 *   3. rankMarkets() → scored + sorted top 6
 *   4. Render MarketDiscoveryCard × 6
 */
import { useEffect, useState } from "react";
import { useWalletContext } from "../context/WalletContext";
import MarketDiscoveryCard from "./MarketDiscoveryCard";
import {
  rankMarkets,
  detectCategory,
  DiscoverableMarket,
  ScoredMarket,
  MarketCategory,
} from "../utils/marketDiscovery";

interface RawMarket {
  id: number;
  question: string;
  end_date: string;
  total_pool: string;
  resolved: boolean;
  category?: MarketCategory;
  volume_last_24h?: number;
  volume_last_hour?: number;
  volume_prev_hour?: number;
}

interface Props {
  onCardClick?: (market: ScoredMarket) => void;
}

export default function MarketDiscoveryGrid({ onCardClick }: Props) {
  const { publicKey } = useWalletContext();
  const [cards, setCards] = useState<ScoredMarket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // Fetch all markets
        const marketsRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/markets`);
        const marketsData = await marketsRes.json();
        const raw: RawMarket[] = marketsData.markets ?? [];

        // Normalise raw API data into DiscoverableMarket shape
        const markets: DiscoverableMarket[] = raw.map((m) => ({
          id: m.id,
          question: m.question,
          // Use API-provided category or auto-detect from question text
          category: m.category ?? detectCategory(m.question),
          end_date: m.end_date,
          total_pool: m.total_pool,
          resolved: m.resolved,
          volumeLast24h: m.volume_last_24h ?? parseFloat(m.total_pool) * 0.3,
          volumeLastHour: m.volume_last_hour ?? 0,
          volumePrevHour: m.volume_prev_hour ?? 0,
        }));

        // Fetch user category history if wallet is connected
        let categoryHistory: Partial<Record<MarketCategory, number>> = {};
        if (publicKey) {
          try {
            const actRes = await fetch(
              `${process.env.NEXT_PUBLIC_API_URL}/api/users/${encodeURIComponent(publicKey)}/activity`
            );
            if (actRes.ok) categoryHistory = await actRes.json();
          } catch {
            // Activity fetch is non-critical — fall back to volume-only ranking
          }
        }

        setCards(rankMarkets(markets, categoryHistory, 6));
      } catch {
        setCards([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [publicKey]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-gray-900 border border-gray-800 rounded-2xl h-52 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!cards.length) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl md:text-2xl font-semibold text-white">
          {publicKey ? "Recommended for You" : "Trending Markets"}
        </h2>
        <span className="text-xs text-gray-500">Top {cards.length} picks</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((market) => (
          <MarketDiscoveryCard
            key={market.id}
            market={market}
            onClick={onCardClick}
          />
        ))}
      </div>
    </section>
  );
}
