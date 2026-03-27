# Market Detail Page - Component Documentation

## Overview

The Market Detail Page (`/market/[id]`) is the core conversion page of Stellar-PolyMarket where users can view market details, see odds, and place bets. It is optimized for both desktop and mobile (iPhone 14+) with high-contrast UI.

## Features

### ✅ Core Features
- [x] **Dynamic Market Loading**: Fetches market data by ID from the API
- [x] **Live Pool Size Updates**: Polls every 5 seconds for real-time pool data
- [x] **Odds Calculation**: Displays current odds based on bet distribution
- [x] **Responsive Tabs**: Three tabs for About, Positions, and Activity
- [x] **Betting Panel**: Stake XLM on Yes/No outcomes with potential payout display
- [x] **Wallet Integration**: Connects with Stellar wallet for betting

### ✅ UI/UX Features
- [x] **Mobile-First Design**: Optimized for iPhone 14 (390x844)
- [x] **High Contrast**: Dark theme with clear visual hierarchy
- [x] **Responsive Layout**: Adapts from mobile to desktop seamlessly
- [x] **Loading States**: Skeleton loaders during data fetch
- [x] **Error States**: User-friendly error messages
- [x] **Live Status Indicators**: Pulsing "Live" badge for active markets

## Component Architecture

```
market/[id]/
├── page.tsx              # Route wrapper with QueryClient provider
├── MarketDetailPage.tsx  # Main page component
├── __tests__/
│   └── MarketDetailPage.test.tsx  # Comprehensive test suite
└── README.md            # This documentation
```

## File Structure

### [`page.tsx`](page.tsx)

Route wrapper that provides the React Query context.

```tsx
// Props
interface MarketPageProps {
  // Dynamic route params (handled by Next.js)
}
```

### [`MarketDetailPage.tsx`](MarketDetailPage.tsx)

The main component containing:

#### Types

```typescript
interface Market {
  id: number;
  question: string;
  end_date: string;
  outcomes: string[];
  resolved: boolean;
  winning_outcome: number | null;
  total_pool: string;
  status: string;
  contract_address: string | null;
  created_at: string;
}

interface Bet {
  id: number;
  wallet_address: string;
  outcome_index: number;
  amount: string;
  created_at: string;
}

interface Position {
  wallet_address: string;
  outcome_index: number;
  total_amount: number;
  bet_count: number;
}
```

#### Props

```typescript
interface MarketDetailPageProps {
  marketId: string;  // Market ID from URL params
}
```

#### State

| State | Type | Description |
|-------|------|-------------|
| `activeTab` | `"about" \| "positions" \| "activity"` | Currently active tab |
| `selectedOutcome` | `number \| null` | Selected betting outcome (0 = Yes, 1 = No) |
| `amount` | `string` | Bet amount in XLM |
| `message` | `{ type: "success" \| "error"; text: string } \| null` | User feedback message |

#### API Functions

| Function | Description |
|----------|-------------|
| `fetchMarketDetail(id)` | Fetches market and bet data from `/api/markets/:id` |
| `fetchPoolSize(marketId)` | Fetches on-chain pool size from `/api/reserves` |
| `placeBetAPI(data)` | Places a bet via `/api/bets` POST |

#### React Query Configuration

```typescript
// Market detail polling
refetchInterval: 5000   // 5 seconds for live updates

// Pool size polling
refetchInterval: 30000  // 30 seconds for on-chain data
```

#### Helper Functions

| Function | Description |
|----------|-------------|
| `calculateOdds(bets, outcomeIndex)` | Calculates odds percentage for an outcome |
| `calculatePositions(bets)` | Aggregates bets by wallet and outcome |

## Tab Components

### About Tab

Displays market information:
- **Question**: The prediction question
- **Pool Size**: Current on-chain balance
- **Total Staked**: Total staked amount from database
- **Ends**: Market end date
- **Status**: Active, Ended, or Resolved badge
- **Contract**: Stellar contract address (if available)

### Positions Tab

Shows aggregated positions:
- **Trader**: Masked wallet address (GABC…ABCD)
- **Position**: Yes or No with color coding
- **Amount**: Total XLM staked
- **Bets**: Number of individual bets

### Activity Tab

Displays recent bet activity:
- **Wallet**: Masked wallet address
- **Outcome**: Yes/No with color coding
- **Amount**: XLM amount bet
- **Time**: Relative time (e.g., "5m ago")

## Betting Panel

### UI Elements

1. **Odds Buttons**: YES (green) / NO (red) with percentage display
2. **Amount Input**: Numeric input for XLM stake
3. **Potential Payout**: Calculated based on odds and stake
4. **Action Button**: Place Bet or Connect Wallet

### Validation Rules

- Amount must be positive number
- Outcome must be selected
- Wallet must be connected
- Market must not be resolved or expired

### Error Handling

| Error | Display |
|-------|---------|
| API failure | Red error message in UI |
| Invalid input | Button remains disabled |
| Wallet not connected | "Connect Wallet to Bet" prompt |

## Responsive Breakpoints

| Breakpoint | Layout |
|------------|--------|
| < 768px (Mobile) | Single column, sticky betting panel at bottom |
| ≥ 768px (Desktop) | Full-width layout with betting panel inline |

## Color Scheme

| Element | Color |
|---------|-------|
| Background | `#030712` (gray-950) |
| Cards | `#111827` (gray-900) |
| Borders | `#1f2937` (gray-800) |
| Primary | `#2563eb` (blue-600) |
| Yes/Success | `#16a34a` (green-600) |
| No/Error | `#dc2626` (red-600) |
| Text Primary | `#ffffff` (white) |
| Text Secondary | `#9ca3af` (gray-400) |

## Testing

### Coverage Target
- **95% coverage** on UI component rendering and input validation

### Test Categories

1. **Loading States**: Skeleton loaders display correctly
2. **Error States**: Error messages render on API failure
3. **Market Content**: Question, status, pool size render
4. **Tab Navigation**: Tabs switch correctly
5. **Betting UI**: Outcome selection, amount input validation
6. **Input Validation**: Edge cases for amounts
7. **Responsive Design**: Mobile/desktop specific classes
8. **Pure Functions**: Odds calculation, position aggregation

### Run Tests

```bash
cd frontend
npm test
```

## Accessibility

- All interactive elements are keyboard accessible
- Proper ARIA labels on buttons and inputs
- High contrast colors (WCAG AA compliant)
- Screen reader friendly structure

## Performance

- React Query for efficient caching and refetching
- Debounced pool size polling (5s market, 30s reserves)
- Optimistic updates on bet placement
- Memoized calculations for odds

## Future Enhancements

- [ ] Add chart visualization for odds history
- [ ] Include slippage protection messaging
- [ ] Add minimum bet amount validation
- [ ] Include gas/fee estimation
- [ ] Add share market functionality
- [ ] Implement deep linking for bet states

## Related Components

- [`MarketCard`](../../components/MarketCard.tsx) - List view card component
- [`TradeDrawer`](../../components/mobile/TradeDrawer.tsx) - Mobile betting drawer
- [`useWallet`](../../hooks/useWallet.ts) - Wallet connection hook
- [`useRecentActivity`](../../hooks/useRecentActivity.ts) - Activity feed hook

## API Endpoints Used

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/markets/:id` | GET | Fetch market details and bets |
| `/api/reserves` | GET | Fetch on-chain pool sizes |
| `/api/bets` | POST | Place a bet |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Yes | Backend API URL |

## Demo Mode

When the API is unavailable, the component falls back to demo data:

```typescript
const DEMO_MARKET = {
  id: 1,
  question: "Will Bitcoin reach $100k before 2027?",
  end_date: "2026-12-31T00:00:00Z",
  outcomes: ["Yes", "No"],
  resolved: false,
  total_pool: "4200",
};
```
