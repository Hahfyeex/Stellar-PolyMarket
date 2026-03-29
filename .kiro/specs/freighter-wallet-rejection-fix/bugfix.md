# Bugfix Requirements Document

## Introduction

When a user clicks "Connect Wallet" and then dismisses the Freighter permission popup, the `getPublicKey` call throws a string error (not an `Error` object). The `connect` function in `useWallet.ts` does not distinguish this rejection from other errors, and the existing `catch` block attempts to read `.message` on a plain string, resulting in `walletError` being set to `undefined`. This leaves the UI in a broken loading state and can cause an unhandled promise rejection that crashes the React component tree, showing a blank screen. Users must refresh the page to recover.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the user dismisses the Freighter permission popup THEN the system throws an unhandled string error that is not caught correctly, leaving `isLoading` as `true` and `walletError` as `undefined`

1.2 WHEN the Freighter SDK throws a string containing "user rejected" or "denied" THEN the system attempts to read `.message` on the string, producing `undefined` instead of a user-friendly message

1.3 WHEN any error occurs during `getPublicKey` THEN the system may propagate an unhandled promise rejection that crashes the React component tree and renders a blank screen

### Expected Behavior (Correct)

2.1 WHEN the user dismisses the Freighter permission popup THEN the system SHALL set `walletError` to "Connection cancelled. Click Connect Wallet to try again." and set `isLoading` to `false`

2.2 WHEN the Freighter SDK throws a string containing "user rejected" or "denied" (case-insensitive) THEN the system SHALL detect it as a user rejection and set `walletError` to the cancellation message without crashing

2.3 WHEN any other error occurs during `getPublicKey` THEN the system SHALL set `walletError` to "Failed to connect wallet. Please try again." and set `isLoading` to `false`

2.4 WHEN a connection attempt fails for any reason THEN the system SHALL always reset `isLoading` to `false` so the UI remains interactive

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the user successfully connects their Freighter wallet THEN the system SHALL CONTINUE TO set `publicKey` with the returned key and clear any previous error

3.2 WHEN Freighter is not installed THEN the system SHALL CONTINUE TO set `walletError` to the "not installed" message

3.3 WHEN the Freighter wallet is locked THEN the system SHALL CONTINUE TO set `walletError` to the "please unlock" message

3.4 WHEN the user disconnects THEN the system SHALL CONTINUE TO clear `publicKey` without affecting error state
