# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - String Thrown by getPublicKey Produces Undefined walletError
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: Scope the property to concrete failing cases — `getPublicKey` throws a plain string (e.g. `"User rejected"`, `"Transaction denied"`, `"network timeout"`)
  - In `frontend/src/hooks/__tests__/useWallet.test.ts`, mock `window.freighter.getPublicKey` to throw each of the following strings: `"User rejected"`, `"Transaction denied by user"`, `"network timeout"`
  - For each thrown string, invoke `connect()` and assert `error` is a non-empty string (not `undefined`) AND `connecting` is `false`
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL — `error` is `undefined` because `err.message` on a string primitive returns `undefined` (confirms the root cause)
  - Document counterexamples found: e.g. `"getPublicKey throws 'User rejected' → error is undefined instead of cancellation message"`
  - Mark task complete when tests are written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-String-Throw Paths Produce Unchanged State
  - **IMPORTANT**: Follow observation-first methodology
  - Observe on UNFIXED code: successful `getPublicKey` → `publicKey` set, `error` null, `connecting` false
  - Observe on UNFIXED code: `window.freighter` undefined → `error` is "not installed" message, `connecting` false
  - Observe on UNFIXED code: `isConnected()` returns false → `error` is "please unlock" message, `connecting` false
  - Observe on UNFIXED code: `getPublicKey` throws `new Error("unexpected")` (Error object, not string) → `error` is `"unexpected"`, `connecting` false
  - Write property-based tests in `frontend/src/hooks/__tests__/useWallet.test.ts`:
    - For all arbitrary valid public key strings (non-empty alphanumeric), `connect()` sets `publicKey` to that value and `error` to null
    - For all `Error` objects thrown by `getPublicKey`, `error` equals `err.message` and `connecting` is false
  - Write unit tests for the three guard paths (not installed, locked, disconnect)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS — confirms baseline behavior to preserve
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 3. Fix string-throw handling in useWallet connect

  - [x] 3.1 Implement the fix in `frontend/src/hooks/useWallet.ts`
    - Locate the `catch` block inside the `connect` useCallback
    - Replace the existing `catch (err)` body with the normalised message logic:
      ```ts
      const message = typeof err === 'string' ? err : (err as any)?.message ?? String(err);
      const isRejection = /user rejected|denied/i.test(message);
      setError(
        isRejection
          ? "Connection cancelled. Click Connect Wallet to try again."
          : "Failed to connect wallet. Please try again."
      );
      ```
    - Ensure the existing `finally` block (`setConnecting(false)`) is NOT removed
    - Do NOT modify the `!window.freighter` guard, `isConnected()` check, happy-path `setPublicKey`, or `disconnect` callback
    - _Bug_Condition: isBugCondition(err) — typeof err === 'string', causing err.message === undefined_
    - _Expected_Behavior: error is non-empty user-readable string AND connecting is false for all thrown values_
    - _Preservation: all code paths where getPublicKey does not throw a string remain unchanged_
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - String Thrown by getPublicKey Produces User-Readable walletError
    - **IMPORTANT**: Re-run the SAME tests from task 1 — do NOT write new tests
    - The tests from task 1 encode the expected behavior
    - Run the bug condition exploration tests from step 1
    - **EXPECTED OUTCOME**: Tests PASS — confirms the fix resolves the bug
    - Verify: `"User rejected"` thrown → `error === "Connection cancelled. Click Connect Wallet to try again."`
    - Verify: `"Transaction denied by user"` thrown → `error === "Connection cancelled. Click Connect Wallet to try again."`
    - Verify: `"network timeout"` thrown → `error === "Failed to connect wallet. Please try again."`
    - Verify: `connecting === false` in all cases
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-String-Throw Paths Unchanged After Fix
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run all preservation property tests and unit tests from step 2
    - **EXPECTED OUTCOME**: All tests PASS — confirms no regressions introduced
    - Confirm coverage remains above 90% for `useWallet.ts`

- [x] 4. Checkpoint — Ensure all tests pass
  - Run the full test suite for `frontend/src/hooks/__tests__/useWallet.test.ts`
  - Confirm all tests pass (both exploration and preservation)
  - Confirm `useWallet.ts` line/branch coverage is above 90%
  - Ensure no TypeScript errors (`getDiagnostics` on `useWallet.ts`)
  - Ask the user if any questions arise
