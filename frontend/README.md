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

## Onboarding Wizard (Issue #120)

### What it does

The `OnboardingWizard` provides a 4-step guided introduction for new users:
1. **Wallet Connection**: Explains why a Stellar wallet (Freighter) is needed.
2. **Market Mechanics**: Visual diagram of how prediction markets work.
3. **Demo Betting**: Shows a `MarketCard` in preview mode with a disabled bet form.
4. **Payout Calculation**: Explains the math behind potential winnings.

### Testing & Resetting

To test the onboarding flow multiple times:
1. Open Browser DevTools (F12).
2. Go to the **Application** tab -> **Local Storage**.
3. Delete the key `onboardingComplete`.
4. Refresh the page to trigger the wizard again.

Alternatively, run this in the console:
```javascript
localStorage.removeItem('onboardingComplete'); location.reload();
```

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
