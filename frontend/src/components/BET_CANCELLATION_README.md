# Bet Cancellation UI Implementation

## Overview

This implementation provides a complete bet cancellation UI with countdown timer, confirmation dialog, and refund handling. Users can cancel bets within a 5-minute grace period after placement.

## Components

### 1. **BetCancellationButton**
Displays the cancel button with countdown timer or "Locked" badge.

**Props:**
- `cancellableUntil: string | null` - ISO timestamp when cancellation window closes
- `onCancelClick: () => void` - Callback when user clicks Cancel
- `isLoading?: boolean` - Disable button during request

**States:**
- **Cancellable**: Shows "Cancel" button + countdown (e.g., "3m 42s")
- **Expired**: Shows "Locked" badge
- **Loading**: Shows spinner, button disabled

**Usage:**
```tsx
<BetCancellationButton
  cancellableUntil={bet.grace_period_ends_at}
  onCancelClick={() => setShowDialog(true)}
  isLoading={isSubmitting}
/>
```

### 2. **BetCancellationConfirmDialog**
Modal confirmation dialog with bet details and refund amount.

**Props:**
- `isOpen: boolean` - Control dialog visibility
- `onClose: () => void` - Close without confirming
- `onConfirm: () => void` - Confirm cancellation
- `isLoading: boolean` - Show loading state
- `error: string | null` - Display error message
- `betId: number` - Bet identifier
- `marketTitle: string` - Market question
- `outcomeName: string` - Outcome user bet on
- `refundAmount: number` - Amount to refund

**Accessibility:**
- `role="alertdialog"` for semantic meaning
- `aria-labelledby` and `aria-describedby` for screen readers
- Focus management (confirm button focused on open)
- Backdrop click to close

**Usage:**
```tsx
<BetCancellationConfirmDialog
  isOpen={showDialog}
  onClose={() => setShowDialog(false)}
  onConfirm={handleConfirm}
  isLoading={isPending}
  error={error?.message || null}
  betId={bet.id}
  marketTitle={bet.market_title}
  outcomeName={bet.outcome_label}
  refundAmount={parseFloat(bet.amount)}
/>
```

### 3. **BetCancellationCell** (Integration Component)
Combines button, dialog, and API call into a single component. Manages the full cancellation flow.

**Props:**
- `betId: number` - Bet identifier
- `cancellableUntil: string | null` - Grace period end time
- `marketTitle: string` - Market question
- `outcomeName: string` - Outcome name
- `refundAmount: number` - Refund amount
- `walletAddress: string | null` - User's wallet
- `onCancellationSuccess?: () => void` - Callback after success

**Usage in BetHistoryTable:**
```tsx
<BetCancellationCell
  betId={bet.id}
  cancellableUntil={bet.grace_period_ends_at}
  marketTitle={bet.market_title}
  outcomeName={bet.outcome_label}
  refundAmount={parseFloat(bet.amount)}
  walletAddress={walletAddress}
  onCancellationSuccess={() => refetchBets()}
/>
```

## Hooks

### 1. **useCountdownTimer**
Countdown timer hook with proper cleanup and re-render optimization.

**Returns:**
```ts
{
  remaining: number;      // milliseconds remaining
  formatted: string;      // "Xm Ys" format (e.g., "3m 42s")
  isExpired: boolean;     // true when remaining <= 0
}
```

**Features:**
- Updates every 1 second
- Calls `onComplete` callback when timer reaches zero
- Proper cleanup on unmount
- Handles null/past dates gracefully

**Usage:**
```ts
const { formatted, isExpired } = useCountdownTimer(
  bet.grace_period_ends_at,
  () => console.log("Grace period expired")
);
```

### 2. **useCancelBet**
React Query mutation for DELETE /api/bets/:id.

**Returns:**
```ts
{
  mutate: (betId: number) => void;
  isPending: boolean;
  error: Error | null;
  data: CancelBetResponse;
}
```

**Features:**
- Validates wallet address
- Sends DELETE request with wallet authorization
- Invalidates `bets` and `portfolio` queries on success
- Handles all error cases from backend

**Usage:**
```ts
const { mutate: cancelBet, isPending, error } = useCancelBet(walletAddress);

cancelBet(betId, {
  onSuccess: (data) => {
    console.log(`Refunded: ${data.refunded_amount} XLM`);
  },
  onError: (err) => {
    console.error(err.message);
  },
});
```

## Integration with BetHistoryTable

Add the cancellation cell to your bet history table:

```tsx
// In BetHistoryTable.tsx
import BetCancellationCell from "./BetCancellationCell";

export default function BetHistoryTable({ walletAddress }: Props) {
  const [bets, setBets] = useState<Bet[]>([]);

  return (
    <table>
      <tbody>
        {bets.map((bet) => (
          <tr key={bet.id}>
            <td>{bet.market_title}</td>
            <td>{bet.outcome_label}</td>
            <td>{bet.amount} XLM</td>
            <td>
              <BetCancellationCell
                betId={bet.id}
                cancellableUntil={bet.grace_period_ends_at}
                marketTitle={bet.market_title}
                outcomeName={bet.outcome_label}
                refundAmount={parseFloat(bet.amount)}
                walletAddress={walletAddress}
                onCancellationSuccess={() => refetchBets()}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

## Styling

All components use Tailwind CSS with the Stella Polymarket color palette:

- **Primary**: `blue-600` (action buttons)
- **Danger**: `red-600` (cancel button)
- **Success**: `green-400` (refund amount)
- **Warning**: `yellow-200` (warning messages)
- **Neutral**: `gray-900` (backgrounds), `gray-800` (borders)

**Spacing Grid**: 4px (Tailwind default)
- Padding: `p-4`, `p-6`
- Gaps: `gap-2`, `gap-3`, `gap-4`
- Rounded: `rounded-lg`, `rounded-xl`, `rounded-2xl`

## API Integration

### Backend Endpoint
```
DELETE /api/bets/:id
Content-Type: application/json

{
  "walletAddress": "GABC1234..."
}
```

### Response (Success)
```json
{
  "success": true,
  "bet_id": 123,
  "refunded_amount": "100.50"
}
```

### Error Responses
- **400**: Grace period expired, invalid input
- **404**: Bet not found or wallet mismatch
- **409**: Bet already cancelled or paid out
- **500**: Server error

## Testing

### Test Coverage
- **useCountdownTimer**: 11 tests (100% coverage)
  - Time formatting
  - Timer updates
  - Expiration detection
  - Cleanup
  - Callbacks

- **useCancelBet**: 9 tests (100% coverage)
  - Successful cancellation
  - Error handling
  - Query invalidation
  - Wallet validation

- **BetCancellationButton**: 11 tests (100% coverage)
  - Button visibility
  - Countdown display
  - Click handlers
  - Loading state
  - Accessibility

- **BetCancellationConfirmDialog**: 15 tests (100% coverage)
  - Dialog visibility
  - Bet details display
  - Refund amount
  - Button handlers
  - Error display
  - Accessibility

- **BetCancellationCell**: 11 tests (100% coverage)
  - Full cancellation flow
  - Success/error handling
  - Callbacks
  - Loading states

**Total: 57 tests, >90% coverage**

### Running Tests
```bash
# Run all cancellation tests
npm test -- --testPathPattern="BetCancellation|useCountdownTimer|useCancelBet"

# Run with coverage
npm test -- --coverage --testPathPattern="BetCancellation|useCountdownTimer|useCancelBet"
```

## Accessibility

### WCAG 2.1 Compliance
- **Keyboard Navigation**: All buttons focusable, Enter/Space to activate
- **Screen Readers**: 
  - Dialog has `role="alertdialog"`
  - Titles linked via `aria-labelledby`
  - Descriptions linked via `aria-describedby`
  - Toast notifications use `aria-live="polite"`
- **Color Contrast**: All text meets WCAG AA standards
- **Focus Management**: Focus moves to confirm button when dialog opens
- **Motion**: Animations respect `prefers-reduced-motion`

### Aria Labels
```tsx
// Button
aria-label="Cancel bet, 3m 42s remaining"

// Dialog
role="alertdialog"
aria-labelledby="cancel-dialog-title"
aria-describedby="cancel-dialog-description"

// Toast
role="status"
aria-live="polite"
aria-atomic="false"
```

## Error Handling

### User-Facing Errors
1. **Grace period expired**: "Grace period has expired"
2. **Already cancelled**: "Bet already cancelled"
3. **Already paid out**: "Bet already paid out"
4. **Network error**: "Failed to cancel bet. Please try again."

### Error Display
- Shown in red box within confirmation dialog
- Also displayed in error toast
- User can retry or dismiss

## Performance Considerations

1. **Timer Optimization**
   - Updates only every 1 second (not on every render)
   - Cleanup on unmount prevents memory leaks
   - Re-initialization only when `endTime` changes

2. **Query Caching**
   - React Query caches bet list
   - Invalidation on success triggers refetch
   - Stale data shown while refetching

3. **Component Memoization**
   - Consider wrapping in `React.memo` if used in large lists
   - Callbacks memoized with `useCallback`

## Future Enhancements

1. **Batch Cancellation**: Cancel multiple bets at once
2. **Undo**: Show undo option for 5 seconds after cancellation
3. **Analytics**: Track cancellation rates and reasons
4. **Notifications**: Push notification when grace period about to expire
5. **Partial Cancellation**: Cancel portion of a bet

## Related Issues

- #504: Bet Cancellation UI Implementation
- #498: Backend Bet Cancellation (5-minute grace period)

## Files

```
frontend/src/
├── hooks/
│   ├── useCountdownTimer.ts
│   ├── useCancelBet.ts
│   └── __tests__/
│       ├── useCountdownTimer.test.ts
│       └── useCancelBet.test.ts
├── components/
│   ├── BetCancellationButton.tsx
│   ├── BetCancellationConfirmDialog.tsx
│   ├── BetCancellationCell.tsx
│   ├── BET_CANCELLATION_README.md
│   └── __tests__/
│       ├── BetCancellationButton.test.tsx
│       ├── BetCancellationConfirmDialog.test.tsx
│       └── BetCancellationCell.test.tsx
```
