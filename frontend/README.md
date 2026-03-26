# Stella Polymarket — Frontend

Next.js 14 frontend for the Stella Polymarket decentralized prediction market platform.

## Getting Started

```bash
npm install
npm run dev
```

Set `NEXT_PUBLIC_API_URL` in `.env.local` to point at the backend (default: `http://localhost:4000`).

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

| Variable | Description |
|---|---|
| `stakeAmount` | Amount the user intends to bet (XLM) |
| `poolForOutcome` | Current pool size for the chosen outcome before the bet |
| `totalPool` | Sum of all outcome pools |
| `0.97` | 3% platform fee deduction |

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

| File | Role |
|---|---|
| `src/context/BettingSlipContext.tsx` | Global queue state — `isOpen`, `bets[]`, `addBet`, `removeBet`, `clearBets` |
| `src/context/WalletContext.tsx` | Lifts wallet state globally so BettingSlip can submit |
| `src/hooks/useBatchTransaction.ts` | Builds XDR via `/api/bets/batch`, signs with Freighter, submits via `/api/bets/submit` |
| `src/components/BettingSlip.tsx` | Drawer/panel UI — bet list, remove buttons, submit |
| `src/components/BettingSlipWrapper.tsx` | Client boundary that mounts BettingSlip in layout |
| `src/components/Toast.tsx` | Queue-full warning toast |

### Queue rules

- Max 5 bets — adding a 6th shows a toast warning
- Same market + outcome combination replaces the existing entry (no duplicates)
- Auto-opens the slip when a bet is added

### Adding a bet from a market card

```tsx
const { addBet } = useBettingSlip();

addBet(
  { marketId, marketTitle, outcomeIndex, outcomeName, amount },
  () => showToast("Slip is full!")   // optional onQueueFull callback
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

| Field | Type | Default |
|---|---|---|
| `outcomeIndex` | `number \| null` | `null` |
| `amount` | `string` | `""` |
| `slippageTolerance` | `number` | `0.5` |

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
  .filter(k => k.startsWith("stella_bet_form_"))
  .forEach(k => localStorage.removeItem(k));
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

## Transaction Batching (Issue #136)

### Overview

`useBatchTransaction` bundles multiple Soroban operations into a **single Freighter wallet pop-up** using Stellar's `TransactionBuilder`. This eliminates repeated approval dialogs and dramatically improves UX.

### Hook API

```ts
import { useBatchTransaction } from "@/hooks/useBatchTransaction";

const { submitting, error, success, submitBatch, submitOperations } =
  useBatchTransaction(onSuccess?: () => void);
```

| Return value | Type | Description |
|---|---|---|
| `submitting` | `boolean` | True while the transaction is in-flight |
| `error` | `string \| null` | Specific error message identifying which operation failed |
| `success` | `boolean` | True after a successful submission |
| `submitBatch` | `(bets, walletAddress) => Promise<boolean>` | Convenience: converts `QueuedBet[]` into payment ops and submits atomically |
| `submitOperations` | `(ops, walletAddress) => Promise<boolean>` | Low-level: submit an explicit `BatchOperation[]` atomically |

### Supported Batch Flows

| Flow | Operations |
|---|---|
| Bet + trustline setup | `[placeBet, addTrustline]` |
| Bet + fee payment | `[placeBet, payFee]` |
| Multi-bet slip | `[placeBet, placeBet, ...]` (up to 5) |

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
