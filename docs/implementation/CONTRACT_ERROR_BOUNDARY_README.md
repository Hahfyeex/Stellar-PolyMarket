# Contract Error Boundary

Closes #134

## Overview

`ContractErrorBoundary` is a React class component that wraps any component making Soroban contract calls. When a contract call throws, it:

1. Maps the error code to a user-friendly message
2. Dispatches `setContractError()` to Redux (visible in Redux DevTools)
3. Logs to Sentry with component context
4. Renders a fallback UI with a Retry button

## Usage

```tsx
// Wrap any contract-calling component
<ContractErrorBoundary context="MarketCard" store={store}>
  <MarketCard ... />
</ContractErrorBoundary>

// Or use the HOC
export default withContractErrorBoundary(MyComponent, "MyComponent");
```

## Retry Flow

The Retry button calls `this.setState({ hasError: false })`, which causes React to re-render the children — re-attempting the failed contract call. Non-retryable errors (e.g. market already resolved) hide the Retry button.

## Redux Integration

Errors are dispatched to the `contractError` slice and visible in Redux DevTools under:

```
contractError: {
  code: "Error(Contract, #2)",
  message: "...",
  context: "MarketCard-42",
  capturedAt: "2026-03-25T10:00:00.000Z"
}
```

## Adding a New Error Code Mapping

Edit `frontend/src/constants/contractErrors.ts`:

```ts
"Error(Contract, #8)": {
  title: "Rate Limit Exceeded",
  message: "You've placed too many bets in a short period. Please wait a moment and try again.",
  // retryable: true (default) — set false to hide Retry button
},
```

The key must be a substring of the error message thrown by the Soroban SDK or Horizon. `mapContractError` uses `String.includes()` so partial matches work.

## Wrapped Components

| Component | Context label |
|---|---|
| `MarketCard` | `MarketCard-{id}` |
| `BettingSlip` | `BettingSlip` |

## Files

| File | Purpose |
|---|---|
| `src/constants/contractErrors.ts` | Error code → user message map |
| `src/store/contractErrorSlice.ts` | Redux slice |
| `src/store/index.ts` | Redux store |
| `src/lib/monitoring.ts` | Sentry wrapper |
| `src/components/ContractErrorBoundary.tsx` | Error boundary + HOC |
| `src/components/ReduxProvider.tsx` | Client-side Redux Provider |
| `src/components/__tests__/ContractErrorBoundary.test.tsx` | Unit tests >90% coverage |
