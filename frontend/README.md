# Stella Polymarket — Frontend

Next.js 14 frontend for the Stella Polymarket decentralized prediction market platform.

## Getting Started

```bash
npm install
npm run dev
```

Set `NEXT_PUBLIC_API_URL` in `.env.local` to point at the backend (default: `http://localhost:4000`).

---

## Reputation Badges (Issue #118)

Users who consistently make accurate predictions are recognized with a tiered badge system. Badges appear on the profile page header (96px) and as small icons (24px) in leaderboard rows.

### Tier Thresholds

| Tier    | Min Markets | Min Accuracy | Glow Color |
|---------|-------------|--------------|------------|
| 🥉 Bronze  | 10+         | —            | `#cd7f32` (copper)    |
| 🥈 Silver  | 50+         | 55%+         | `#c0c0c0` (silver)    |
| 🥇 Gold    | 100+        | 65%+         | `#ffd700` (gold)      |
| 💎 Diamond | 200+        | 75%+         | `#38bdf8` (ice blue)  |

Tiers are evaluated from highest to lowest — the first matching tier wins. Both conditions (markets AND accuracy) must be satisfied. Bronze has no accuracy gate.

### Adding a New Tier

1. Add a new entry to `BADGE_TIERS` in `src/utils/badgeTier.ts` (keep sorted highest-first by `minMarkets`).
2. Add the corresponding SVG to `/public/badges/<tier>.svg` — include an `aria-label` attribute.
3. Add the glow hex color to `BADGE_GLOW_COLORS` in the same file.
4. Add the new `BadgeTier` union type value in `badgeTier.ts`.

### Components & Files

| File | Purpose |
|------|---------|
| `src/utils/badgeTier.ts` | `getBadgeTier(marketsCount, accuracyPct)` — pure tier computation + constants |
| `src/utils/__tests__/badgeTier.test.ts` | Unit tests (>90% coverage, all tiers + edge cases) |
| `src/components/ReputationBadge.tsx` | `ReputationBadge` (icon only) + `ReputationBadgeWithLabel` (icon + tier name) |
| `src/hooks/useUserBadge.ts` | Fetches `GET /api/users/:wallet/stats`, computes tier |
| `src/app/profile/page.tsx` | Profile page — badge at 96px, tier progression, recent predictions |
| `src/app/leaderboard/page.tsx` | Leaderboard table with badge icons at 24px per row |
| `src/components/LeaderboardRow.tsx` | Single leaderboard row component |
| `public/badges/bronze.svg` | Bronze badge SVG asset |
| `public/badges/silver.svg` | Silver badge SVG asset |
| `public/badges/gold.svg` | Gold badge SVG asset |
| `public/badges/diamond.svg` | Diamond badge SVG asset |

### API Contract

```
GET /api/users/:wallet/stats
Response: { markets_count: number, accuracy_pct: number }
```

### Running Tests

```bash
npm test -- --testPathPattern="badgeTier"
```

---

## Live Activity Feed (Issue #13)

### What it does

The `LiveActivityFeed` component renders a "Recent Activity" panel showing the latest bets placed across all markets. It provides social proof by surfacing real-time betting activity, which builds trust in market liquidity.

### Polling strategy

The feed uses **HTTP polling** rather than WebSockets. Every **5 seconds** `useRecentActivity` calls:

```
GET /api/bets/recent?limit=20
```

This endpoint joins the `bets` and `markets` tables and returns the 20 most recent bets ordered by `created_at DESC`.

**Why polling instead of WebSockets?**

- The backend is a plain Express app with no existing WS infrastructure.
- Bet frequency is low enough that 5-second polling is imperceptible to users.
- Polling is simpler to deploy, debug, and scale horizontally behind a load balancer.
- If bet volume grows significantly, the strategy can be upgraded to Server-Sent Events (SSE) or WebSockets with minimal frontend changes — just swap the `useRecentActivity` hook internals.

### New-item animation

When the hook detects IDs that weren't present in the previous poll, those rows receive the `activity-fade-in` CSS class (defined in `globals.css`). The class applies a 500ms `translateY` + `opacity` keyframe animation, then the highlight fades after 1.2 seconds.

### Fallback / demo mode

When the API is unreachable or returns no data, the component renders 5 hardcoded demo transactions so the UI always looks populated during development or demos.

---

## Testing

Pure logic functions (`formatWallet`, `formatRelativeTime`, `mapActivityItem`) are unit-tested with Jest + ts-jest. No DOM or React rendering required.

```bash
npm test              # run with coverage report
npm run test:ci       # CI mode (fails on coverage drop)
```

Coverage threshold: **95% lines/functions, 90% branches** on `useRecentActivity.ts`.

---

## Project Structure

```
src/
  app/
    page.tsx          # Main page — markets grid + activity feed
    layout.tsx
    globals.css       # Tailwind base + activity-fade-in keyframe
  components/
    MarketCard.tsx    # Individual market card with bet placement
    LiveActivityFeed.tsx  # Recent activity feed (issue #13)
  hooks/
    useWallet.ts      # Freighter wallet connection
    useRecentActivity.ts  # Polling hook + data-mapping utilities
```

---

## What-If Simulator (P&L Projections)

The `WhatIfSimulator` component lets users model potential returns before placing a bet.

### P&L Calculation Formula

```
projectedPayout = (stakeAmount / (poolForOutcome + stakeAmount)) * totalPool * 0.97
```

| Variable         | Description                                             |
| ---------------- | ------------------------------------------------------- |
| `stakeAmount`    | Amount the user intends to bet (XLM)                    |
| `poolForOutcome` | Current pool size for the chosen outcome before the bet |
| `totalPool`      | Sum of all outcome pools                                |
| `0.97`           | 3% platform fee deduction                               |

**Implied probability** (market consensus before your bet):

```
impliedProbability = (poolForOutcome / totalPool) * 100
```

**Net P&L**:

```
projectedProfit = projectedPayout - stakeAmount
```

### Usage

The simulator is embedded in both `MarketCard` (desktop) and `TradeDrawer` (mobile). It appears as a collapsible panel below the bet form once an outcome is selected.

Props:

- `poolForOutcome` — pool size for the selected outcome
- `totalPool` — total pool across all outcomes
- `maxStake` — optional slider maximum (defaults to `max(totalPool * 2, 1000)`)

### Testing

Calculation logic lives in `src/utils/simulatorCalc.ts` and is tested at 100% coverage in `src/utils/__tests__/simulatorCalc.test.ts`.

```bash
npm test -- --testPathPattern="simulatorCalc|WhatIfSimulator"
```

---

## BettingSlip — Batch Betting (Slide-up Drawer)

The `BettingSlip` component lets users queue up to 5 bets across different markets and submit them all in a single Freighter wallet approval.

### Responsive layout

- Mobile (`< 1024px`): slide-up drawer from bottom using `CSS transform: translateY`
- Desktop (`≥ 1024px`): fixed right-side panel

### Architecture

| File                                    | Role                                                                                   |
| --------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/context/BettingSlipContext.tsx`    | Global queue state — `isOpen`, `bets[]`, `addBet`, `removeBet`, `clearBets`            |
| `src/context/WalletContext.tsx`         | Lifts wallet state globally so BettingSlip can submit                                  |
| `src/hooks/useBatchTransaction.ts`      | Builds XDR via `/api/bets/batch`, signs with Freighter, submits via `/api/bets/submit` |
| `src/components/BettingSlip.tsx`        | Drawer/panel UI — bet list, remove buttons, submit                                     |
| `src/components/BettingSlipWrapper.tsx` | Client boundary that mounts BettingSlip in layout                                      |
| `src/components/Toast.tsx`              | Queue-full warning toast                                                               |

### Queue rules

- Max 5 bets — adding a 6th shows a toast warning
- Same market + outcome combination replaces the existing entry (no duplicates)
- Auto-opens the slip when a bet is added

### Adding a bet from a market card

```tsx
const { addBet } = useBettingSlip();

addBet(
  { marketId, marketTitle, outcomeIndex, outcomeName, amount },
  () => showToast("Slip is full!") // optional onQueueFull callback
);
```

### Batch transaction flow

1. POST `/api/bets/batch` → backend returns a Stellar XDR envelope
2. `window.freighter.signTransaction(xdr)` → single user approval
3. POST `/api/bets/submit` → backend submits signed XDR to Stellar testnet

---

## PoolOwnershipChart — Fractional Ownership Pie Chart

Renders a live Recharts `PieChart` showing each bettor's fractional share of the pool. Updates in real-time via WebSocket when new bets arrive.

### API data structure expected

`GET /api/markets/:id` must return:

```json
{
  "market": { "total_pool": "4200", ... },
  "bets": [
    { "wallet_address": "GABC...XY12", "amount": "150" },
    { "wallet_address": "GDEF...AB34", "amount": "50" }
  ]
}
```

### Data transformation pipeline

```
bets[] → group by wallet_address → sum amounts
       → calculate % share (amount / totalPool * 100)
       → sort descending
       → wallets < 1% merged into "Others" slice
```

Logic lives in `src/utils/poolOwnership.ts` (`buildOwnershipSlices`).

### Live updates

Uses `socket.io-client` to join `market_{id}` room. On `oddsUpdate` event, re-fetches bets and rebuilds slices without a page reload.

### Usage

```tsx
<PoolOwnershipChart marketId={market.id} />
```

### Slice colors

Slices use the Stella Polymarket design token palette (blue, green, purple, amber, red, cyan, pink, lime, indigo, orange). Wallets below 1% are grouped into a gray "Others" slice.

---

## useFormPersistence — Bet Form State Persistence

Persists bet form inputs to `localStorage` so users don't lose their selections on refresh or accidental navigation.

### Storage key format

```
stella_bet_form_{marketId}
```

Examples: `stella_bet_form_1`, `stella_bet_form_42`

Each market has an independent key — switching markets restores that market's last state.

### Persisted fields

| Field               | Type             | Default |
| ------------------- | ---------------- | ------- |
| `outcomeIndex`      | `number \| null` | `null`  |
| `amount`            | `string`         | `""`    |
| `slippageTolerance` | `number`         | `0.5`   |

### Usage

```tsx
const { outcomeIndex, amount, slippageTolerance, setOutcomeIndex, setAmount, clearForm } =
  useFormPersistence(market.id);

// After successful bet submission:
clearForm(); // removes localStorage entry and resets fields to defaults
```

### Clearing state for testing

Open browser DevTools → Application → Local Storage and delete any key matching `stella_bet_form_*`, or run:

```js
Object.keys(localStorage)
  .filter((k) => k.startsWith("stella_bet_form_"))
  .forEach((k) => localStorage.removeItem(k));
```

---

## Dynamic Theming Engine (Issue #149)

The Stella Polymarket frontend features a CSS variable-based dynamic dark/light theme engine, which ensures zero hardcoded color values and immediate theme application.

### Adding New Theme Tokens

1. **Open `src/app/globals.css`**
   Add your new token to both the `:root` and `[data-theme='light']` blocks:

   ```css
   :root {
     ...
     --color-brand-new: #123456;
   }

   [data-theme='light'] {
     ...
     --color-brand-new: #abcdef;
   }
   ```

2. **Open `tailwind.config.js`**
   Update the Tailwind configuration to map the standard classes to your token:
   ```js
   theme: {
     extend: {
       colors: {
         ...
         brand: {
           new: 'var(--color-brand-new)',
         }
       }
     }
   }
   ```
3. **Use the new Token in React Components**
   You can now use `bg-brand-new`, `text-brand-new`, `border-brand-new`, etc., anywhere in the `.tsx` files.

### useTheme hook

We provide a `useTheme` hook (`src/hooks/useTheme.ts`) that will respect the user's system preferences `window.matchMedia('(prefers-color-scheme: dark)')` on the first load and save user override configurations into `localStorage` under the `stella_theme` key.

---

## Internationalisation (i18n)

Stella Polymarket supports **5 languages** out of the box: English, French, Yorùbá, Hausa, and Swahili.

### Stack

| Package                            | Role                                          |
| ---------------------------------- | --------------------------------------------- |
| `i18next`                          | Core translation engine                       |
| `react-i18next`                    | React hooks & provider                        |
| `i18next-http-backend`             | Dynamically loads only the active locale JSON |
| `i18next-browser-languagedetector` | Auto-detects browser locale on first visit    |

### File structure

```
frontend/
└── public/
    └── locales/
        ├── en/common.json   ← English (default)
        ├── fr/common.json   ← French
        ├── yo/common.json   ← Yorùbá
        ├── ha/common.json   ← Hausa
        └── sw/common.json   ← Swahili
```

Each locale has a single namespace (`common`) that holds all UI strings.

### How language selection works

1. **First visit** — `i18next-browser-languagedetector` reads `navigator.language` and maps it to the nearest supported locale (e.g. `fr-FR` → `fr`).
2. **User selection** — the `LanguageSelector` dropdown in the navbar calls `i18n.changeLanguage(lang)`.
3. **Persistence** — the selected language is stored in `localStorage` under the key `stella_lang` and restored on the next visit.

### Using translations in a component

```tsx
import { useTranslation } from "react-i18next";

export default function MyComponent() {
  const { t } = useTranslation();
  return <h1>{t("hero.headline")}</h1>;
}
```

### Adding a new language

1. Create `frontend/public/locales/<code>/common.json` (copy `en/common.json` as a template).
2. Translate every value. Do **not** translate the keys.
3. Add the code to `SUPPORTED_LANGUAGES` in `src/utils/i18nUtils.ts`.
4. Add the human-readable name to `LANGUAGE_NAMES` in the same file.
5. The language will automatically appear in the `LanguageSelector` dropdown.

### Adding a new translation key

1. Add the key + English value to `public/locales/en/common.json`.
2. Add the equivalent translation to every other locale file.
3. Use `t('your.new.key')` in the component.

### Contributing translations

- All locale files live under `public/locales/` — no build step required; they are plain JSON.
- Run `npm test` to verify the i18n utility coverage stays above 90 %.
- Open a PR with the updated locale files and a description of what was translated.

---

## Transaction Batching (Issue #136)

### Overview

`useBatchTransaction` bundles multiple Soroban operations into a **single Freighter wallet pop-up** using Stellar's `TransactionBuilder`. This eliminates repeated approval dialogs and dramatically improves UX.

### Hook API

```ts
import { useBatchTransaction } from "@/hooks/useBatchTransaction";

const { submitting, error, success, submitBatch, submitOperations } =
  useBatchTransaction(onSuccess?: () => void);
```

| Return value       | Type                                        | Description                                                                 |
| ------------------ | ------------------------------------------- | --------------------------------------------------------------------------- |
| `submitting`       | `boolean`                                   | True while the transaction is in-flight                                     |
| `error`            | `string \| null`                            | Specific error message identifying which operation failed                   |
| `success`          | `boolean`                                   | True after a successful submission                                          |
| `submitBatch`      | `(bets, walletAddress) => Promise<boolean>` | Convenience: converts `QueuedBet[]` into payment ops and submits atomically |
| `submitOperations` | `(ops, walletAddress) => Promise<boolean>`  | Low-level: submit an explicit `BatchOperation[]` atomically                 |

### Supported Batch Flows

| Flow                  | Operations                            |
| --------------------- | ------------------------------------- |
| Bet + trustline setup | `[placeBet, addTrustline]`            |
| Bet + fee payment     | `[placeBet, payFee]`                  |
| Multi-bet slip        | `[placeBet, placeBet, ...]` (up to 5) |

### Usage Examples

**BettingSlip** — multi-bet submission:

```tsx
const { submitBatch } = useBatchTransaction(() => clearBets());
await submitBatch(bets, walletAddress); // one Freighter pop-up for all bets
```

**LPDepositModal** — deposit + trustline in one transaction:

```tsx
const { submitOperations } = useBatchTransaction(onClose);
await submitOperations([
  { type: "placeBet",    operation: Operation.payment({ ... }) },
  { type: "addTrustline", operation: Operation.changeTrust({ ... }) },
], walletAddress);
```

### Error Handling

On failure the entire transaction rolls back atomically — no partial state is left on-chain. The `error` string identifies the specific failing operation:

```
"Add Trustline" failed: op no trust
```

### Testnet Instructions

1. Install [Freighter](https://freighter.app) and switch to **Testnet**
2. Fund your testnet wallet at [friendbot](https://friendbot.stellar.org)
3. Set `NEXT_PUBLIC_API_URL=http://localhost:4000` in `.env.local`
4. Run the app: `npm run dev`
5. Place a bet on any market — a single Freighter pop-up will appear for the entire batch

RPC endpoint used: `https://soroban-testnet.stellar.org`
Horizon endpoint: `https://horizon-testnet.stellar.org`

---

## Client-Side Slippage Protection (Issue #138)

### Overview

XLM uses 7-decimal precision and market odds shift between bet-form-open and submission. Slippage protection captures odds at form-open time and compares them just before submission using **pure BigInt arithmetic** — zero floating-point operations.

### Slippage Calculation Methodology

All values are converted to **stroops** (1 XLM = 10,000,000 stroops) before any arithmetic:

```
toStroops(xlm) = BigInt(Math.round(xlm × 1e7))
```

Payout formula (integer arithmetic, 97/100 for the 3% fee):

```
payout = (stake × totalPool × 97) / ((outcomePool + stake) × 100)
```

Slippage check (no division by floats):

```
drift_scaled     = (expected - current) × 1e7
tolerance_scaled = BigInt(Math.round(tolerancePct × 1e7)) × expected / 100
exceeded         = drift_scaled > tolerance_scaled
```

### Tolerance Presets

| Preset | Use case                         |
| ------ | -------------------------------- |
| 0.5%   | Default — low-volatility markets |
| 1%     | Moderate activity                |
| 2%     | High-volume markets              |
| Custom | User-defined (0.01%–50%)         |

Preference persists in `localStorage` under key `stella_slippage_pref`.

### Components & Hooks

| File                                      | Purpose                                                                |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| `src/utils/slippageCalc.ts`               | `toStroops`, `calcPayoutStroops`, `isSlippageExceeded`, `stroopsToXlm` |
| `src/hooks/useSlippageGuard.ts`           | `snapshotOdds()` + `checkSlippage()` — useRef snapshot pattern         |
| `src/components/SlippageSettings.tsx`     | 4 preset buttons + custom input + localStorage persistence             |
| `src/components/SlippageWarningModal.tsx` | Expected vs current payout, Proceed/Cancel                             |

### Flow

1. User selects outcome → `snapshotOdds()` captures payout in a `useRef`
2. User clicks Bet → `checkSlippage()` fetches current pool and compares
3. If drift > tolerance → `SlippageWarningModal` shown with exact XLM difference
4. User can Proceed (submit anyway) or Cancel

---

## Virtualized Order Book (Issue #141)

### Overview

Markets with hundreds of bets previously rendered thousands of DOM nodes. `VirtualizedOrderBook` uses `react-window` `FixedSizeList` to mount only the ~8 visible rows at any time, keeping the DOM lean regardless of dataset size.

### Performance Configuration

```
itemSize = 48px   — fixed row height; enables O(1) scroll position math
height   = 400px  — visible viewport (~8 rows)
```

Only rows within the visible window are mounted. Scrolling through 500+ rows never creates more than ~10 DOM nodes for the list body.

### Live Update Strategy

Row data is held in a `useRef` (`dataRef`) — appending new rows does **not** trigger a full re-render of existing rows. After appending, `listRef.current.resetAfterIndex(prevLength)` tells react-window to only re-measure the newly added rows.

### Infinite Scroll

`onItemsRendered` fires on every scroll event. When `visibleStopIndex >= itemCount - 10` the next page is fetched and appended via `appendRows()`.

### Performance Benchmarks

| Metric                     | Result                       |
| -------------------------- | ---------------------------- |
| DOM nodes for 500-row list | ~10 (virtualized window)     |
| Rows rendered at once      | ≤ 8 visible + overscan       |
| Append 50 new rows         | Zero existing row re-renders |
| Test dataset               | 500 rows, no frame drops     |

### Components & Hooks

| File                                      | Purpose                                                |
| ----------------------------------------- | ------------------------------------------------------ |
| `src/components/VirtualizedOrderBook.tsx` | `FixedSizeList` wrapper, row renderer, infinite scroll |
| `src/hooks/useOrderBook.ts`               | Live polling + pagination for a single market          |
