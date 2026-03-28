# feat(#77): Market Detail Page & Social Sentiment

## Summary

Implements the full deep-dive view for individual prediction markets, referencing the Polymarket market page design. The page gives a user everything they need — charts, live prices, trade modal, social sentiment, comments, and related markets — to confidently justify a 1,000 XLM bet.

Route: `/markets/[id]`

---

## What Changed

**New files**
- `src/app/markets/[id]/page.tsx` — Market Detail page (dynamic route)
- `src/components/ProbabilityChart.tsx` — Large area chart (Price vs. Time), 1H/6H/24H/7D/ALL range selector, touch-swipe on mobile
- `src/components/TradeModal.tsx` — Sidebar trade panel (Issue #102 ref), reuses `useFormPersistence`, `useTrustline`, `useBettingSlip`, `WhatIfSimulator`
- `src/components/RelatedMarketsCarousel.tsx` — Snap-scroll horizontal carousel at the footer, keyword-based market matching
- `src/components/SocialSentiment.tsx` — Community lean bar derived from pool distribution

**Modified files**
- `src/components/MarketCard.tsx` — Added eye-icon link navigating to `/markets/:id`

---

## Information Hierarchy — Why Chart & Price Take Precedence Over the Description

When a user lands on a market detail page considering a 1,000 XLM bet, they have one primary question:

> **"Is the current price fair, and which direction is it moving?"**

That question cannot be answered by reading a description. It requires seeing price trend, volatility, and momentum at a glance. The description tells you *what* the market is — the user already knows that from the question headline. The chart tells you *where it's going*, which is the only thing that matters for a bet decision.

This is why the layout is ordered the way it is:

| # | Element | Why it's here |
|---|---|---|
| 1 | Probability chart — full width, above the fold | Price movement is the single most actionable signal. A bettor needs to see trend direction and volatility before anything else. This is the "score" of the market. |
| 2 | Current price tiles per outcome | Puts a number on what the chart shows. Confirms the current implied probability instantly without reading anything. |
| 3 | Trade Modal — sticky sidebar (desktop) / bottom panel (mobile) | The action is always reachable. Once a user has read the chart and price, the next step is placing a bet — zero extra scrolling required. |
| 4 | Social Sentiment bar | A fast crowd-wisdom signal. Reinforces or challenges what the chart shows with community conviction data. |
| 5 | Pool Ownership chart | Shows who has skin in the game. Relevant for assessing liquidity and whale concentration before committing a large stake. |
| 6 | Discussion / Comments | Secondary context. Qualitative reasoning from other bettors — useful for due diligence but not the first thing needed. |
| 7 | Market Rules + Truth Sources | Tertiary. Needed to verify resolution criteria, but only consulted after the price signal has already informed the decision. |
| 8 | Related Markets carousel | Discovery layer. Keeps users engaged after they've decided, surfacing adjacent opportunities. |

The description is intentionally placed *below* the chart. It explains the market's premise — context a bettor already has from the headline. Placing it above the chart would bury the price signal under text, increasing time-to-decision and friction for large bets.

---

## Layout

```
┌─────────────────────────────────────────────────────┐
│  Nav (sticky) — back · Stella Polymarket · breadcrumb│
├─────────────────────────────────────────────────────┤
│  Hero — Live badge · Question title · Description    │
├──────────────────────────────┬──────────────────────┤
│  Probability Chart (primary) │                      │
│  ─────────────────────────── │   Trade Modal        │
│  Price tiles per outcome     │   (sticky sidebar)   │
│  ─────────────────────────── │                      │
│  Pool Ownership Chart        │   · Outcome buttons  │
│  ─────────────────────────── │   · Amount input     │
│  Social Sentiment            │   · Quick fills      │
│  ─────────────────────────── │   · Slippage         │
│  Comments (Firebase)         │   · Place Bet        │
│  ─────────────────────────── │   · + Slip           │
│  Market Rules + Truth Source │   · WhatIf Simulator │
├──────────────────────────────┴──────────────────────┤
│  Related Markets Carousel (footer)                   │
└─────────────────────────────────────────────────────┘
```

On mobile (< 1024px): sidebar drops below content, chart is horizontally swipeable via `touch-pan-x`.

---

## Acceptance Criteria

- [x] Large probability chart (Price vs. Time) — Recharts AreaChart, 1H/6H/24H/7D/ALL range selector
- [x] Sidebar Trade Modal (Issue #102) — sticky on desktop, full-width on mobile
- [x] Market rules and Truth source links
- [x] Firebase-powered comment section (`MarketComments` with real-time Firestore listener + pagination)
- [x] Related Markets carousel at the footer — snap-scroll, keyword-based relatedness matching
- [x] Social Sentiment section — community lean bar
- [x] Mobile UX — chart swipe-interactive (`touch-pan-x`, `overflow-x-auto`, `WebkitOverflowScrolling: touch`)
- [x] Dark Mode — all components use `bg-gray-9xx` / `border-gray-8xx` CSS variable design tokens
- [x] Information Hierarchy documented above

---

## Testing

Open `market-detail-preview.html` at the repo root directly in any browser — no server required. It renders the full dark mode Market Detail view with:
- live interactive probability chart (range buttons regenerate data)
- working What-If Simulator (type an amount to see projected payout + net profit)
- postable comments with fade-in animation
- scrollable Related Markets carousel

For the full Next.js implementation, run `npm run dev` inside `/frontend` and navigate to `http://localhost:3000/markets/1`.
