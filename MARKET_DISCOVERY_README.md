# Market Discovery Cards

Closes #124

## Overview

Personalised, visually rich market cards shown above the main market list. The top 6 markets are ranked by a suggestion algorithm combining user history and trending volume.

## Ranking Algorithm

```
score = (userCategoryMatches × 2) + (volumeLast24h / 1000)
```

- `userCategoryMatches` — how many times the user has interacted with markets in this category (from `GET /api/users/:wallet/activity`). Weighted ×2 because personal relevance outweighs raw volume.
- `volumeLast24h / 1000` — normalises large XLM values (e.g. 50,000 XLM → 50) to a comparable scale with category match counts.
- Tiebreaker: pool size descending.
- Resolved markets are always excluded.

## Hot Badge

Shown when: `volumeLastHour > volumePrevHour × 1.2` (>20% growth in the last hour).  
Markets with zero previous-hour volume are never marked hot to avoid false positives on brand-new markets.

## Category SVGs

Located in `/public/categories/`. One SVG per category:

| File | Category |
|---|---|
| `sports.svg` | Sports |
| `crypto.svg` | Crypto |
| `finance.svg` | Finance |
| `politics.svg` | Politics |
| `weather.svg` | Weather |

## Adding a New Category

1. Add an SVG to `/public/categories/<name>.svg` (80×80 viewBox, dark theme)
2. Add the category name to the `MarketCategory` union type in `marketDiscovery.ts`
3. Add keywords to `CATEGORY_KEYWORDS` in `marketDiscovery.ts`
4. Add color/bg/border tokens to `CATEGORY_META` in `MarketDiscoveryCard.tsx`

No other changes needed — the ranking and rendering logic is category-agnostic.

## Hover Effect

Desktop only (`@media (hover: hover) and (pointer: fine)`):
- `transform: translateY(-4px)`
- `box-shadow: 0 12px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(59,130,246,0.2)`

The `@media (hover: hover)` guard prevents the effect from firing on mobile scroll/tap.

## Files

| File | Purpose |
|---|---|
| `frontend/src/utils/marketDiscovery.ts` | Ranking logic, `detectCategory`, `isMarketHot`, `rankMarkets` |
| `frontend/src/components/MarketDiscoveryCard.tsx` | Single card component |
| `frontend/src/components/MarketDiscoveryGrid.tsx` | Data-fetching grid (top 6) |
| `frontend/src/utils/__tests__/marketDiscovery.test.ts` | Unit tests >90% coverage |
| `frontend/public/categories/*.svg` | Category illustrations |
| `frontend/src/app/globals.css` | `.hover-lift` CSS class |
