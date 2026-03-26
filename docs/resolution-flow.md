# Resolution Flow: Proposed Outcome State Machine

## State Transition Diagram

```
Open ──(lock_market)──► Locked ──(propose_result)──► Proposed ──(24h liveness)──► Resolved
```

## States

| State | Description |
|-------|-------------|
| `Open` | Market is accepting bets. |
| `Locked` | Betting is closed. Awaiting oracle proposal. |
| `Proposed` | Oracle has submitted an outcome. Dispute window is active. |
| `Resolved` | Liveness window elapsed. Outcome is final; rewards can be distributed. |

## Functions

### `lock_market(market_id)`
- **Auth**: Admin only.
- **Guard**: Status must be `Open`.
- **Action**: Transitions to `Locked`.

### `propose_result(oracle, market_id, outcome_id)`
- **Auth**: Caller must be the registered oracle address (`oracle.require_auth()`).
- **Guard**: Status must be `Locked`.
- **Action**: Sets status to `Proposed`, stores `proposed_outcome` and `proposal_timestamp` (current ledger time).

### `resolve_market(market_id)`
- **Auth**: Permissionless — callable by anyone after the window.
- **Guard**: Status must be `Proposed` AND `current_time >= proposal_timestamp + 86400`.
- **Action**: Copies `proposed_outcome` → `winning_outcome`, transitions to `Resolved`.

### `distribute_rewards(market_id)`
- **Guard**: Status must be `Resolved`.
- **Action**: Pays out winners proportionally from the pool (3% platform fee retained).

## Liveness Window

```
LIVENESS_WINDOW = 86_400 seconds (24 hours)
```

The window exists to allow off-chain dispute mechanisms or governance to intervene before an outcome becomes final. During this period, `resolve_market` will revert with `"Liveness window has not elapsed"`.

## Storage Fields Added to `Market`

| Field | Type | Purpose |
|-------|------|---------|
| `proposed_outcome` | `Option<u32>` | Outcome index submitted by the oracle. `None` until proposed. |
| `proposal_timestamp` | `u64` | Ledger timestamp (seconds) when `propose_result` was called. |

## Example Timeline

```
T+0h   lock_market()        → status: Locked
T+1h   propose_result(0)    → status: Proposed, proposal_timestamp = T+1h
T+2h   resolve_market()     → PANIC: liveness window has not elapsed
T+25h  resolve_market()     → OK: status: Resolved, winning_outcome = 0
T+25h  distribute_rewards() → Winners paid out
```
