# Onboarding Wizard

Closes #120

## Overview

A 4-step modal wizard shown once to new users on first visit. Persists completion in `localStorage` so it never re-shows after the user finishes or skips.

## Steps

| # | Title | Content |
|---|---|---|
| 1 | Connect Your Wallet | Freighter connect button via `useWallet` hook |
| 2 | How Markets Work | Static explainer with market mechanics diagram |
| 3 | Place a Bet | Demo MarketCard with disabled bet form |
| 4 | Payouts | Worked payout calculation example |

## localStorage Key Structure

```
Key:   "stella_onboarding_complete"
Type:  "true" | absent
Set:   On step 4 "Get Started" click OR "Skip →" from any step
Clear: Call resetOnboarding() (for testing only)
```

Why `localStorage` (not `sessionStorage`): persists across browser restarts so returning users never see the wizard again.

## Resetting Onboarding (for testing)

Open the browser console and run:

```js
localStorage.removeItem("stella_onboarding_complete");
location.reload();
```

Or call `resetOnboarding()` from the `useOnboarding` hook in a dev component.

## Navigation

- Next → / Back ← buttons step through the wizard
- Skip → dismisses from any step
- Get Started → on step 4 marks complete
- Progress stepper at top shows completed (✓), active (highlighted), and upcoming steps

## Files

| File | Purpose |
|---|---|
| `src/hooks/useOnboarding.ts` | State + localStorage persistence |
| `src/components/onboarding/OnboardingWizard.tsx` | Main wizard shell + stepper |
| `src/components/onboarding/StepWallet.tsx` | Step 1 |
| `src/components/onboarding/StepMarkets.tsx` | Step 2 |
| `src/components/onboarding/StepBetting.tsx` | Step 3 |
| `src/components/onboarding/StepPayouts.tsx` | Step 4 |
| `src/hooks/__tests__/useOnboarding.test.ts` | Unit tests >90% coverage |
