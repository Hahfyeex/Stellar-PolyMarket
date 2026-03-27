# Security Policy

## Role-Based Access Control (RBAC)

The prediction market contract uses a three-role access control system stored in Soroban persistent storage. Roles do not expire with ledger archival.

### Role Hierarchy

```
Admin (highest privilege)
  └── can assign/reassign all roles
  └── can pause/unpause the contract
  └── controls market lifecycle (create, lock, update params)

Oracle (data layer)
  └── submits proposed outcomes after market is Locked

Resolver (execution layer)
  └── finalizes outcomes after the 24-hour liveness window
```

### Storage Pattern

Each role maps directly to an `Address` in persistent storage:

```rust
env.storage().persistent().set(&Role::Admin, &address);
env.storage().persistent().get(&Role::Admin) -> Option<Address>
```

### Function → Required Role

| Function | Required Role | Notes |
|----------|--------------|-------|
| `initialize` | Admin (bootstrap) | One-time setup; sets all three roles |
| `assign_role` | Admin | Reassign any role to a new address |
| `pause` | Admin | Halts all state-mutating operations |
| `set_market_params` | Admin | Update question/deadline on Open markets only |
| `create_market` | Admin | Deploy a new prediction market |
| `lock_market` | Admin | Close betting; transition Open → Locked |
| `propose_result` | Oracle | Submit outcome; starts 24h liveness window |
| `resolve_market` | Resolver | Finalize outcome after liveness window elapses |
| `place_bet` | None (bettor self-auth) | Only while market is Open and unpaused |
| `distribute_rewards` | None (permissionless) | Only after market is Resolved |
| `get_market` | None (read-only) | — |
| `get_pool` | None (read-only) | — |
| `get_role` | None (read-only) | — |

### Authorization Flow

```
check_role(env, Role::X)
  → fetch address from persistent storage
  → call address.require_auth()        ← Soroban enforces this on-chain
  → panic(ContractError::AccessDenied) if unset or auth fails
```

### Separation of Duties

The three-role model eliminates single points of failure:

- Compromising the **Oracle** key cannot pause the contract or reassign roles.
- Compromising the **Resolver** key cannot submit fraudulent outcomes (Oracle does that).
- Compromising the **Admin** key cannot directly resolve markets (requires Oracle + Resolver).

### Role Reassignment

Only the current Admin can reassign roles via `assign_role(role, new_address)`. This enables key rotation without redeploying the contract.

### Pause Mechanism

The Admin can call `pause(true)` to halt `create_market`, `lock_market`, `set_market_params`, `propose_result`, `resolve_market`, and `place_bet`. Read-only functions and `distribute_rewards` remain available while paused.

## Reporting a Vulnerability

Please open a private security advisory on GitHub rather than a public issue.
