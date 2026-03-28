# PR: Market Detail Page — Issue #77

## What's in this PR

New route `/markets/[id]` — a full deep-dive view for individual prediction markets, designed to give a user enough signal to justify a 1,000 XLM bet.

### New files
- `src/app/markets/[id]/page.tsx` — Market Detail page
- `src/components/ProbabilityChart.tsx` — Large area chart (Price vs. Time) with time-range selector and touch-swipe on mobile
- `src/components/TradeModal.tsx` — Sidebar trade panel (Issue #102 reference), reuses `useFormPersistence`, `useTrustline`, `useBettingSlip`
- `src/components/RelatedMarketsCarousel.tsx` — Horizontally scrollable related markets at the footer
- `src/components/SocialSentiment.tsx` — Community sentiment bar derived from pool distribution

### Modified files
- `src/components/MarketCard.tsx` — Added "View details" eye-icon link to `/markets/:id`

---

## Information Hierarchy — Why Chart & Price Come First

A user deciding to stake 1,000 XLM has one primary question: **"Is the current price fair?"**

That question can only be answered by seeing price trend and volatility — not by reading a description. The description and rules are supporting context; the chart *is* the market.

### Hierarchy (top → bottom)

| Layer | Element | Rationale |
|---|---|---|
| 1 | Probability chart (full-width, above the fold) | Price movement is the single most actionable signal. Trend direction and volatility are visible at a glance before any scrolling. |
| 2 | Current price tiles per outcome | Immediate "score" of the market — confirms what the chart shows numerically. |
| 3 | Trade Modal (sticky sidebar / mobile bottom) | Action is always reachable without scrolling. Reduces friction for the bet decision. |
| 4 | Social Sentiment bar | Community lean provides a quick crowd-wisdom signal. |
| 5 | Pool Ownership chart + Comments | Secondary context — who's in the market and what they're saying. |
| 6 | Market Rules + Truth Sources | Tertiary — needed for due diligence but not the first thing a bettor needs. |
| 7 | Related Markets carousel | Discovery — keeps users engaged after they've made a decision. |

The description is intentionally placed *below* the chart because it explains *what* the market is, not *where it's going*. A bettor already knows the topic from the question headline; they need price data first.

---

## Acceptance Criteria

- [x] Large probability chart (Price vs. Time) with 1H / 6H / 24H / 7D / ALL range selector
- [x] Trade Modal sidebar (Issue #102) — sticky on desktop, full-width on mobile
- [x] Market rules and Truth source links section
- [x] Firebase-powered comment section (`MarketComments`)
- [x] Related Markets carousel at the footer
- [x] Social Sentiment section
- [x] Mobile UX: chart is swipe-interactive (`touch-pan-x`, `overflow-x-auto`, `WebkitOverflowScrolling: touch`)
- [x] Dark Mode: all components use `bg-gray-9xx` / `border-gray-8xx` design tokens
- [x] Mini-README (this file) breaking down the Information Hierarchy

---

## Dark Mode Screenshot

> Run `npm run dev` and navigate to `/markets/1` to see the full Market Detail view in Dark Mode (default theme).
