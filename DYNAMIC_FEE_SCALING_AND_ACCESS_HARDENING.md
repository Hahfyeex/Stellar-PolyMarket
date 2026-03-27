# Implementation: Dynamic Fee-Scaling and Access Hardening (#43)

## 📊 Volume-to-Fee Curve
The platform fee scales dynamically based on market volume, measured in **stroops** (1 XLM = 10,000,000 stroops).

| Volume (XLM) | Volume (Stroops) | Fee (%) | Fee (BPS) | Status |
| :--- | :--- | :--- | :--- | :--- |
| **100** | 1,000,000,000 | 2.0% | 200 | Base Fee |
| **10,000** | 100,000,000,000 | 1.85% | 185 | Interpolated |
| **100,000** | 1,000,000,000,000 | 0.5% | 50 | Floor Reached |
| **>100k** | >1e12 | 0.5% | 50 | Floor Enforced |

**Mathematical Formula:**
`Fee_BPS = Max(50, 200 - (Volume_Stroops * 150 / 1,000,000,000,000))`

---

## 🛡️ Access Control & Host Safety

The protocol has been refactored to use a centralized, collision-resistant access control system in `access.rs`.

### 1. Storage Isolation
To prevent Soroban host errors (`Auth` / `ExistingValue`) during initialization, we transitioned to isolated storage namespaces:
- **`AccessKey`**: Handles protocol-wide authorization and status (Admin, Platform Status).
- **`DataKey`**: Handles market-specific domain data (Markets, Shares, cursors).

This isolation ensures that a market created with ID `0` does not collide with the `Admin` role (which previously shared index `0` in a unified enum).

### 2. Platform Status Management
Implemented a three-tier status system managed by the `AccessPlatformStatus` enum:
- **`Active`**: All operations enabled.
- **`Paused`**: Temporary suspension of betting/creation; resolution remains active.
- **`Shutdown`**: Permanent blocking of new activity. Payouts and resolution are preserved to allow user exits.

---

## ⚖️ Settlement & Resolution Flows

The settlement engine has been hardened to ensure protocol fairness and resistance to manipulation.

### 1. Liveness Enforcement
Final resolution is now gated by a mandatory **86,400s (24h) cooling-off period**. 
- **Sequence**: `propose_resolution` → `+24h Liveness Window` → `resolve_market`.
- **Purpose**: Provides a guaranteed window for the community or administrative observers to `dispute` a malicious proposal.

### 2. Bonded Disputes
Disputes now require a fixed **100 stroop bond** (configurable) to prevent spamming the resolution queue. Bonds are handled via the Stellar Asset Contract (SAC) in a secure escrow flow.

---

## 🧪 Verification Coverage
The integration test suite was upgraded to **High-Fidelity Mocks**, passing all **40 tests**:
- **Dynamic Fees**: Verified across 100, 10k, and 100k XLM volumes.
- **Access Hardening**: Confirmed that `initialize` and `create_market` no longer suffer from storage collisions.
- **Settlement Cycles**: Successfully simulated full cycles from Creation → Betting → Proposal → Cooling-off → Resolution → Batch Distribution.
- **Edge Cases**: Verified that betting is blocked during shutdown while resolution remains enabled.

---

## 📈 Gas and Complexity Analysis
- **Execution Cost**: O(1) time complexity for all authorization and fee calculations.
- **Storage Safety**: Heavy use of `i128` and `Persistent` storage for market data ensures protocol longevity (TTL management via `bump_instance_ttl`).
- **Scalability**: `batch_distribute` uses a cursor-based approach to resolve large markets without hitting Soroban transaction size limits.
