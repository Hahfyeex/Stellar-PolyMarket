# Freighter Wallet Rejection Fix - Bugfix Design

## Overview

The `connect` function in `useWallet.ts` calls `window.freighter.getPublicKey()`, which throws a plain string (not an `Error` object) when the user dismisses the Freighter permission popup. The current `catch` block reads `err.message` on that string, producing `undefined` for `walletError` and leaving `isLoading` (`connecting`) stuck as `true`. The fix wraps `getPublicKey` in a dedicated try/catch that normalises the thrown value, detects user-rejection strings, and always resets `isLoading` to `false`.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — `getPublicKey` throws a value (string or object) and the catch block fails to produce a meaningful `walletError` or reset `isLoading`
- **Property (P)**: The desired post-catch state — `walletError` is a non-empty, user-readable string AND `isLoading` is `false`
- **Preservation**: All existing behaviour outside the `getPublicKey` error path must remain unchanged
- **useWallet**: The React hook in `frontend/src/hooks/useWallet.ts` that manages wallet connection state
- **connect**: The `useCallback` inside `useWallet` that orchestrates the Freighter connection flow
- **walletError / error**: The `error` state returned by `useWallet` (renamed `walletError` in requirements for clarity; maps to `error` in code)
- **isLoading / connecting**: The `connecting` state returned by `useWallet`
- **rejection string**: A string thrown by the Freighter SDK that contains "user rejected" or "denied" (case-insensitive)

## Bug Details

### Bug Condition

The bug manifests when `window.freighter.getPublicKey()` throws any value. The Freighter SDK throws a plain string on user dismissal (e.g. `"User rejected"` or `"Transaction denied"`). The existing catch block evaluates `err.message` on a string primitive, which is `undefined`, so `setError(undefined)` is called and `connecting` is never reset to `false` because the `finally` block does reset it — however the `error` state is silently `undefined` rather than a user-readable message, leaving the UI in an ambiguous state. Additionally, if the thrown value is not an `Error` instance, the component tree may surface an unhandled rejection.

**Formal Specification:**
```
FUNCTION isBugCondition(err)
  INPUT: err — any value thrown by getPublicKey()
  OUTPUT: boolean

  normalised := (typeof err === 'string') ? err : (err?.message ?? String(err))
  RETURN normalised IS empty OR normalised IS undefined
         // i.e. the current code cannot produce a meaningful walletError
END FUNCTION
```

More precisely, the bug condition is triggered whenever `getPublicKey` throws AND the thrown value is a string (because `string.message === undefined`).

### Examples

- User dismisses popup → Freighter throws `"User rejected"` → `err.message` is `undefined` → `walletError` is `undefined`, UI stuck
- User dismisses popup → Freighter throws `"Transaction denied by user"` → same outcome
- Network error throws `new Error("timeout")` → `err.message` is `"timeout"` → works today, must be preserved
- Freighter not installed → `throw new Error(...)` path → works today, must be preserved

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Successful connection: `publicKey` is set, `error` is cleared, `connecting` is `false`
- Freighter not installed: `error` is set to the "not installed" message, `connecting` is `false`
- Freighter locked: `error` is set to the "please unlock" message, `connecting` is `false`
- Disconnect: `publicKey` is cleared, `error` state is unaffected

**Scope:**
All code paths that do NOT involve `getPublicKey` throwing a string are unaffected by this fix. This includes:
- The `!window.freighter` guard
- The `isConnected()` check
- The happy-path `setPublicKey(key)` call
- The `disconnect` callback

## Hypothesized Root Cause

1. **String thrown instead of Error object**: The Freighter SDK throws a plain string on user rejection. `String.prototype.message` is `undefined`, so `setError(err.message)` silently sets state to `undefined`.

2. **No rejection detection**: The catch block makes no distinction between a user cancellation and a genuine error, so both cases produce the same (broken) outcome.

3. **Missing string normalisation**: The catch block assumes `err` is always an `Error` instance. There is no `typeof err === 'string'` guard.

4. **`finally` block placement**: The `finally` block does reset `connecting`, so `isLoading` is actually reset — but `walletError` remains `undefined`, which is the primary visible defect.

## Correctness Properties

Property 1: Bug Condition - Rejection String Produces User-Readable Error

_For any_ value thrown by `getPublicKey` where `isBugCondition(err)` holds (i.e. the thrown value is a string), the fixed `connect` function SHALL set `error` to a non-empty, user-readable string AND set `connecting` to `false`. Specifically:
- If the string matches `/user rejected|denied/i`, `error` SHALL be `"Connection cancelled. Click Connect Wallet to try again."`
- Otherwise, `error` SHALL be `"Failed to connect wallet. Please try again."`

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Preservation - Non-Rejection Error Paths Unchanged

_For any_ input where the bug condition does NOT hold (i.e. `getPublicKey` succeeds, or throws an `Error` object from the pre-`getPublicKey` guards), the fixed `connect` function SHALL produce the same observable state as the original function, preserving `publicKey`, `error`, and `connecting` values.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

## Fix Implementation

### Changes Required

**File**: `frontend/src/hooks/useWallet.ts`

**Function**: `connect` (the `useCallback` inside `useWallet`)

**Specific Changes**:

1. **Normalise thrown value**: In the catch block, convert the caught value to a string before inspecting it:
   ```ts
   const message = typeof err === 'string' ? err : (err?.message ?? String(err));
   ```

2. **Detect user rejection**: Check the normalised message against a case-insensitive pattern:
   ```ts
   const isRejection = /user rejected|denied/i.test(message);
   ```

3. **Set appropriate error message**:
   ```ts
   setError(
     isRejection
       ? "Connection cancelled. Click Connect Wallet to try again."
       : "Failed to connect wallet. Please try again."
   );
   ```

4. **Ensure `connecting` resets**: The existing `finally` block already calls `setConnecting(false)`, so no change is needed there — but the fix must not remove it.

5. **No other changes**: The `!window.freighter` and `isConnected` guards, the happy path, and `disconnect` are untouched.

**Resulting catch block:**
```ts
} catch (err: unknown) {
  const message = typeof err === 'string' ? err : (err as any)?.message ?? String(err);
  const isRejection = /user rejected|denied/i.test(message);
  setError(
    isRejection
      ? "Connection cancelled. Click Connect Wallet to try again."
      : "Failed to connect wallet. Please try again."
  );
}
```

## Testing Strategy

### Validation Approach

Two-phase approach: first run exploratory tests against the unfixed code to confirm the root cause, then verify the fix satisfies both correctness properties.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug on the UNFIXED code and confirm the root cause.

**Test Plan**: Mock `window.freighter.getPublicKey` to throw a plain string, invoke `connect`, and assert that `error` is a non-empty string and `connecting` is `false`. These assertions will FAIL on unfixed code, confirming the root cause.

**Test Cases**:
1. **Rejection string "User rejected"**: `getPublicKey` throws `"User rejected"` → assert `error !== undefined` (fails on unfixed code)
2. **Rejection string "Transaction denied"**: `getPublicKey` throws `"Transaction denied"` → assert `error !== undefined` (fails on unfixed code)
3. **Generic string error**: `getPublicKey` throws `"network timeout"` → assert `error !== undefined` (fails on unfixed code)
4. **`connecting` reset**: After any thrown string, assert `connecting === false` (may pass on unfixed code due to `finally`, but `error` will be `undefined`)

**Expected Counterexamples**:
- `error` is `undefined` after a string is thrown
- Possible causes: `err.message` evaluated on a string primitive returns `undefined`

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL err WHERE isBugCondition(err) DO
  result := connect_fixed() // getPublicKey throws err
  ASSERT result.error IS non-empty string
  ASSERT result.connecting === false
  IF /user rejected|denied/i.test(err) THEN
    ASSERT result.error === "Connection cancelled. Click Connect Wallet to try again."
  ELSE
    ASSERT result.error === "Failed to connect wallet. Please try again."
  END IF
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT connect_original(input) produces same state as connect_fixed(input)
END FOR
```

**Testing Approach**: Unit tests covering each preserved code path, plus property-based tests generating arbitrary non-rejection inputs to verify state equivalence.

**Test Cases**:
1. **Successful connection**: `getPublicKey` resolves → `publicKey` set, `error` null, `connecting` false
2. **Freighter not installed**: `window.freighter` is undefined → `error` is "not installed" message
3. **Freighter locked**: `isConnected()` returns false → `error` is "please unlock" message
4. **Disconnect**: `disconnect()` clears `publicKey`, does not touch `error`

### Unit Tests

- `getPublicKey` throws `"User rejected"` → `error` is cancellation message, `connecting` is `false`
- `getPublicKey` throws `"Transaction denied by user"` → `error` is cancellation message
- `getPublicKey` throws `"network error"` (non-rejection string) → `error` is generic message
- `getPublicKey` throws `new Error("unexpected")` (Error object) → `error` is generic message
- `getPublicKey` resolves successfully → `publicKey` set, `error` null
- Freighter not installed → `error` is "not installed" message
- Freighter locked → `error` is "please unlock" message

### Property-Based Tests

- Generate random rejection-like strings (containing "rejected" or "denied") and verify `error` is always the cancellation message
- Generate random non-rejection strings and verify `error` is always the generic message
- Generate arbitrary successful key strings and verify `publicKey` is set and `error` is null

### Integration Tests

- Full connect flow with mocked Freighter: dismissal → UI shows cancellation message, Connect button re-enabled
- Full connect flow: success → wallet address displayed
- Full connect flow: Freighter not installed → install prompt shown
