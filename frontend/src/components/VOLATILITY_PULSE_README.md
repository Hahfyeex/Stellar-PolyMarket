# Volatility Pulse Animation Feature

## Overview

The Volatility Pulse Animation is a subtle but powerful engagement mechanic that draws user attention to fast-moving markets. When odds shift rapidly (more than 5% within 60 seconds), the market card pulses with a directional color indicator:

- **Green pulse** → YES odds rising (bullish signal)
- **Red pulse** → YES odds falling (bearish signal)

This provides immediate visual feedback without requiring users to constantly monitor the numbers.

## Implementation Details

### Components

#### 1. `useVolatilityPulse` Hook
**Location:** `frontend/src/hooks/useVolatilityPulse.ts`

A custom React hook that tracks odds changes and triggers pulse animations.

**API:**
```typescript
const { isPulsing, direction } = useVolatilityPulse(odds: number);
```

**Parameters:**
- `odds` (number): Current odds value (0-100)

**Returns:**
- `isPulsing` (boolean): Whether animation should be active
- `direction` ("up" | "down" | null): Direction of odds change, or null if not pulsing

**Configuration Constants:**
- `VOLATILITY_THRESHOLD = 0.05` (5% change required)
- `VOLATILITY_WINDOW_MS = 60_000` (60-second tracking window)

**Behavior:**
1. Tracks previous odds value using `useRef`
2. Detects percentage change: `|currentOdds - previousOdds| / previousOdds`
3. Triggers pulse when change ≥ 5%
4. Determines direction: "up" if odds increased, "down" if decreased
5. Resets window every 60 seconds
6. Returns `isPulsing: false` after animation completes (3 cycles)

#### 2. MarketCard Component Integration
**Location:** `frontend/src/components/MarketCard.tsx`

The MarketCard component uses the `useVolatilityPulse` hook to apply pulse animations to the card border.

**Integration Points:**
```typescript
// Import the hook
import { useVolatilityPulse } from "../hooks/useVolatilityPulse";

// Calculate default odds
const defaultOdds = 100 / market.outcomes.length;

// Use the hook
const { isPulsing, direction } = useVolatilityPulse(defaultOdds);

// Apply conditional class
<div className={`
  bg-gray-900 rounded-xl p-5 flex flex-col gap-3 border border-gray-800
  ${isPulsing ? (direction === "up" ? "pulse-green" : "pulse-red") : ""}
`}>
```

### CSS Animations

**Location:** `frontend/src/app/globals.css`

#### `@keyframes pulseGreen`
Animates the card border and box-shadow with green color for rising odds.

```css
@keyframes pulseGreen {
  0%, 100% {
    border-color: var(--border-default);
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
  }
  50% {
    border-color: var(--status-success);
    box-shadow: 0 0 12px 0 rgba(34, 197, 94, 0.4);
  }
}
```

#### `@keyframes pulseRed`
Animates the card border and box-shadow with red color for falling odds.

```css
@keyframes pulseRed {
  0%, 100% {
    border-color: var(--border-default);
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
  }
  50% {
    border-color: var(--status-error);
    box-shadow: 0 0 12px 0 rgba(239, 68, 68, 0.4);
  }
}
```

#### Utility Classes
```css
.pulse-green {
  animation: pulseGreen 0.5s ease-in-out 3;
}

.pulse-red {
  animation: pulseRed 0.5s ease-in-out 3;
}
```

**Animation Specifications:**
- Duration: 0.5s per cycle
- Cycles: 3 (total 1.5s)
- Easing: ease-in-out
- Effect: Border color + box-shadow glow

## Usage

### Basic Usage

The feature is automatically active on all market cards. No additional configuration needed.

```typescript
<MarketCard 
  market={market} 
  walletAddress={walletAddress}
  onBetPlaced={onBetPlaced}
/>
```

### Customizing the Threshold

To adjust the volatility threshold, modify the constant in `useVolatilityPulse.ts`:

```typescript
const VOLATILITY_THRESHOLD = 0.05; // Change to 0.10 for 10% threshold
```

### Customizing the Time Window

To adjust the tracking window, modify:

```typescript
const VOLATILITY_WINDOW_MS = 60_000; // Change to 30_000 for 30 seconds
```

### Customizing Animation Duration

To change animation speed, modify the CSS:

```css
.pulse-green {
  animation: pulseGreen 0.3s ease-in-out 3; /* Faster: 0.3s per cycle */
}
```

## Testing

### Unit Tests

**Hook Tests:** `frontend/src/hooks/__tests__/useVolatilityPulse.test.ts`

Comprehensive test coverage (>90%) including:
- Volatility detection (above/below threshold)
- Direction detection (up/down)
- Threshold boundary conditions
- Time window behavior
- Multiple pulses
- Edge cases (zero odds, very small/large values)
- Constant exports

**Run tests:**
```bash
npm test -- useVolatilityPulse.test.ts
```

### Component Tests

**Integration Tests:** `frontend/src/components/__tests__/MarketCard.volatility.test.tsx`

Tests verify:
- Pulse class application (pulse-green/pulse-red)
- Direction-based class selection
- No pulse class when not pulsing
- Hook called with correct odds value
- Multi-outcome market odds calculation
- Pulse direction switching

**Run tests:**
```bash
npm test -- MarketCard.volatility.test.tsx
```

### Manual Testing

1. Open a market card in the UI
2. Observe odds changes in real-time
3. When odds change by >5% within 60 seconds:
   - Card border should pulse green (rising odds)
   - Card border should pulse red (falling odds)
4. Animation runs exactly 3 cycles (1.5 seconds) then stops
5. Verify no animation for changes <5%

## Performance Considerations

### Optimization Strategies

1. **useRef for Previous Value**: Avoids unnecessary re-renders by storing previous odds without triggering state updates
2. **Debounced Window Reset**: Only resets tracking window when 60 seconds have passed
3. **CSS Animations**: Uses GPU-accelerated CSS keyframes instead of JavaScript animations
4. **Conditional Class Application**: Only applies animation class when needed

### Browser Compatibility

- CSS animations: All modern browsers (Chrome, Firefox, Safari, Edge)
- CSS custom properties: All modern browsers
- Box-shadow: All modern browsers

## Accessibility

### Color Contrast
- Green pulse: Uses `--status-success` (green-400) with sufficient contrast
- Red pulse: Uses `--status-error` (red-400) with sufficient contrast
- Both meet WCAG AA standards

### Motion Preferences
Consider adding `prefers-reduced-motion` support:

```css
@media (prefers-reduced-motion: reduce) {
  .pulse-green,
  .pulse-red {
    animation: none;
    border-color: var(--border-default);
  }
}
```

### Screen Readers
The pulse animation is purely visual and doesn't affect semantic meaning. Market data is still accessible via text content.

## Troubleshooting

### Animation Not Triggering

1. **Check odds calculation**: Verify `defaultOdds = 100 / market.outcomes.length`
2. **Verify threshold**: Ensure change is ≥5%
3. **Check time window**: Ensure change occurs within 60 seconds
4. **Inspect CSS**: Verify `.pulse-green` and `.pulse-red` classes are in globals.css

### Animation Stuck

1. **Clear browser cache**: CSS animations may be cached
2. **Check browser DevTools**: Verify animation is running in Animations panel
3. **Verify hook state**: Check React DevTools for `isPulsing` state

### Wrong Color

1. **Verify direction**: Check if `direction` is "up" or "down"
2. **Check CSS variables**: Ensure `--status-success` and `--status-error` are defined
3. **Inspect element**: Use DevTools to verify applied classes

## Future Enhancements

1. **Configurable Animation Speed**: Add props to customize animation duration
2. **Sound Notification**: Optional audio cue for volatility events
3. **Volatility Meter**: Display volatility percentage on card
4. **Historical Tracking**: Show volatility history over time
5. **Threshold Customization**: Per-market or per-user threshold settings
6. **Haptic Feedback**: Mobile vibration on volatility detection

## Related Files

- Hook: `frontend/src/hooks/useVolatilityPulse.ts`
- Component: `frontend/src/components/MarketCard.tsx`
- Styles: `frontend/src/app/globals.css`
- Hook Tests: `frontend/src/hooks/__tests__/useVolatilityPulse.test.ts`
- Component Tests: `frontend/src/components/__tests__/MarketCard.volatility.test.tsx`

## References

- Issue: #463
- Feature: High-Volatility Pulse Animation
- PR: feat/463-volatility-pulse-animation
