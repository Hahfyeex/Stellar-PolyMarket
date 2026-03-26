/**
 * marketDiscovery.ts
 *
 * Suggestion ranking logic for Market Discovery Cards.
 *
 * Ranking algorithm (score per market):
 *   score = (userCategoryMatches * 2) + (volumeLast24h / 1000)
 *
 *   - userCategoryMatches: how many times the user has interacted with
 *     markets in this category (from their activity history). Weighted ×2
 *     because personal relevance matters more than raw volume.
 *   - volumeLast24h: total XLM staked in the last 24 hours. Divided by 1000
 *     to normalise it to a comparable scale with category matches.
 *
 * Hot badge threshold:
 *   A market is "hot" if its volume increased by more than 20% in the last hour
 *   compared to the previous hour.
 *
 * Top-N:
 *   After scoring, markets are sorted descending and the top N are returned
 *   (default 6, matching the homepage grid).
 */

export type MarketCategory = "Sports" | "Crypto" | "Finance" | "Politics" | "Weather";

export interface DiscoverableMarket {
  id: number;
  question: string;
  category: MarketCategory;
  end_date: string;
  total_pool: string;
  /** XLM volume staked in the last 24 hours */
  volumeLast24h: number;
  /** XLM volume staked in the current hour */
  volumeLastHour: number;
  /** XLM volume staked in the previous hour (for hot badge) */
  volumePrevHour: number;
  resolved: boolean;
}

export interface ScoredMarket extends DiscoverableMarket {
  /** Final suggestion score */
  score: number;
  /** True if volume grew >20% in the last hour */
  isHot: boolean;
}

/**
 * Detect the category of a market from its question text.
 * Used as a fallback when the API doesn't return a category field.
 *
 * Keyword matching is intentionally simple — extend CATEGORY_KEYWORDS
 * to support new categories without touching the scoring logic.
 */
const CATEGORY_KEYWORDS: Record<MarketCategory, string[]> = {
  Sports:   ["football", "soccer", "nba", "nfl", "premier league", "arsenal", "cricket", "tennis", "olympics", "world cup", "win", "champion"],
  Crypto:   ["bitcoin", "btc", "ethereum", "eth", "xlm", "stellar", "crypto", "defi", "nft", "token", "blockchain", "sol", "bnb"],
  Finance:  ["inflation", "gdp", "fed", "interest rate", "stock", "nasdaq", "s&p", "dollar", "usd", "ngn", "economy", "recession"],
  Politics: ["election", "president", "senate", "congress", "vote", "government", "policy", "minister", "party", "referendum"],
  Weather:  ["temperature", "rain", "hurricane", "flood", "drought", "climate", "storm", "celsius", "fahrenheit", "weather"],
};

export function detectCategory(question: string): MarketCategory {
  const lower = question.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS) as [MarketCategory, string[]][]) {
    if (keywords.some((kw) => lower.includes(kw))) return cat;
  }
  return "Finance"; // default fallback
}

/**
 * Determine whether a market should show the "Hot" badge.
 *
 * Condition: volumeLastHour > volumePrevHour * 1.2
 * i.e. volume grew more than 20% compared to the previous hour.
 * Markets with zero previous-hour volume are never marked hot
 * (avoids false positives on brand-new markets with 1 bet).
 */
export function isMarketHot(market: Pick<DiscoverableMarket, "volumeLastHour" | "volumePrevHour">): boolean {
  if (market.volumePrevHour <= 0) return false;
  return market.volumeLastHour > market.volumePrevHour * 1.2;
}

/**
 * Score and rank markets for the discovery feed.
 *
 * @param markets           - Full list of active markets
 * @param userCategoryHistory - Map of category → interaction count from /api/users/:wallet/activity
 * @param topN              - How many markets to return (default 6)
 */
export function rankMarkets(
  markets: DiscoverableMarket[],
  userCategoryHistory: Partial<Record<MarketCategory, number>>,
  topN = 6
): ScoredMarket[] {
  const scored: ScoredMarket[] = markets
    .filter((m) => !m.resolved) // only show active markets
    .map((market) => {
      // How many times the user has interacted with this category
      const categoryMatches = userCategoryHistory[market.category] ?? 0;

      /**
       * Core ranking formula:
       *   score = (userCategoryMatches * 2) + (volumeLast24h / 1000)
       *
       * The ×2 multiplier on category matches ensures personalisation
       * outweighs pure volume for users with a clear preference history.
       * volumeLast24h / 1000 normalises large XLM values (e.g. 50,000 XLM)
       * to a 0–50 range comparable to category match counts (typically 0–10).
       */
      const score = (categoryMatches * 2) + (market.volumeLast24h / 1000);

      return {
        ...market,
        score,
        isHot: isMarketHot(market),
      };
    });

  // Sort descending by score, then by pool size as tiebreaker
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return parseFloat(b.total_pool) - parseFloat(a.total_pool);
  });

  return scored.slice(0, topN);
}
