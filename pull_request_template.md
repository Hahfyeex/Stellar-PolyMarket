# Pull Request: Fix Multiple Issues — #487, #499, #500, #501

## Summary

This PR resolves four open issues across the smart contract and backend layers. Each fix is logically isolated to its relevant module with accompanying unit tests.

---

## Issues Resolved

### Issue #487 — Zero-Amount Bet Guard (Smart Contract)

**Problem:** The `place_bet` function in the `prediction_market` smart contract did not validate that the bet amount was greater than zero, allowing zero-value bets to pass through and corrupt pool accounting.

**Fix:**
- Added an early `require!(amount > 0)` guard at the top of `internal_place_bet`.
- Added a post-transfer balance check to confirm the contract actually received the expected token amount before crediting the bet.

**Files changed:**
- `contracts/prediction_market/src/lib.rs`

---

### Issue #499 — Admin Audit Trail

**Problem:** Admin actions (e.g. manually resolving a market) were not logged, making it impossible to audit who did what and when.

**Fix:**
- Added a `logAdminAction` utility that inserts a row into the `admin_audit_log` table on every privileged action, recording: `admin_wallet`, `action_type`, `target_id`, `target_type`, `payload`, `ip_address`, and `created_at`.
- Wired `logAdminAction` into the `POST /api/admin/markets/:id/resolve` endpoint.
- Added a new `GET /api/admin/audit-log` endpoint that returns paginated audit records, filterable by `actionType`, `startDate`, and `endDate`.

**Files changed:**
- `backend/src/routes/admin.js`
- `backend/src/routes/tests/admin.test.js`

---

### Issue #500 — Stellar Horizon Transaction Verification on Bet Placement

**Problem:** The `POST /api/bets` endpoint accepted bets without verifying that the accompanying Stellar transaction actually occurred on-chain, opening up the possibility of fake bets.

**Fix:**
- Before inserting a bet, the endpoint now fetches the transaction from the Stellar Horizon API using the provided `transaction_hash`.
- Validates that `source_account` matches the submitted `walletAddress` and that the on-chain `amount` matches the bet `amount`.
- Returns `400` if the transaction is not found or does not match; returns `400` if the Stellar wallet address format is invalid.
- Added Redis-backed deduplication to prevent replayed transaction hashes.

**Files changed:**
- `backend/src/routes/bets.js`
- `backend/src/routes/tests/bets.test.js`

---

### Issue #501 — Dispute Window for Market Resolution

**Problem:** After a market was resolved, payouts were processed immediately with no opportunity for participants to dispute an incorrect outcome.

**Fix:**
- When a market is resolved, a `dispute_window_ends_at` timestamp is now set (configurable, default 24 hours).
- The `POST /api/markets/payout/:marketId` endpoint checks whether the dispute window is still open; if so it returns `400 — Dispute window is still open`.
- Added a new `GET /api/markets/:marketId/dispute-status` endpoint that returns the current dispute window status and time remaining.

**Files changed:**
- `backend/src/routes/markets.js`
- `backend/src/routes/tests/markets.test.js`

---

## Testing

Unit tests were added for all backend changes. Each test file mocks database and third-party dependencies to run in isolation:

| File | Tests |
|------|-------|
| `backend/src/routes/tests/admin.test.js` | Admin audit log insertion, audit log endpoint with filters |
| `backend/src/routes/tests/bets.test.js` | Invalid wallet rejection, transaction hash mismatch, valid bet acceptance |
| `backend/src/routes/tests/markets.test.js` | Dispute window set on resolution, payouts blocked during window, payouts allowed after window, dispute status endpoint |

Smart contract tests are in `contracts/prediction_market/` and cover the zero-amount guard.

---

## Database Migrations Required

```sql
-- Issue #499: Admin audit trail
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id            SERIAL PRIMARY KEY,
  admin_wallet  TEXT        NOT NULL,
  action_type   TEXT        NOT NULL,
  target_id     INTEGER,
  target_type   TEXT,
  payload       JSONB,
  ip_address    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Issue #501: Dispute window column
ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS dispute_window_ends_at TIMESTAMPTZ;
```

---

## Checklist

- [x] Issue #487 — Zero-amount guard in smart contract
- [x] Issue #499 — Admin audit trail with logging and retrieval endpoint
- [x] Issue #500 — Stellar Horizon transaction verification on bet placement
- [x] Issue #501 — Dispute window blocking premature payouts
- [x] Unit tests added for all backend changes
- [x] No breaking changes to existing API contracts
- [x] DB migration SQL documented above
