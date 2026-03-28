# Prediction Market Upgrade Guide

This guide describes the in-place WASM upgrade flow for `contracts/prediction_market`.

## Overview

The prediction market contract now supports a staged upgrade process:

1. `propose_upgrade` stores a pending WASM hash and starts a 24-hour ledger timelock.
2. The team and community review the proposed hash during the waiting period.
3. `execute_upgrade` performs the in-place WASM replacement after the timelock expires.
4. `cancel_upgrade` removes a pending proposal if the release must be aborted.

The upgrade is in-place, so the contract address and all stored market state remain unchanged.

## Preconditions

- The caller must hold the `SuperAdmin` role.
- The new WASM must already be uploaded to Soroban and available by hash.
- The release should be validated on testnet before it is proposed on the target network.

## Step 1: Build and Upload the New WASM

Build the contract:

```bash
cargo build --target wasm32-unknown-unknown --release --manifest-path contracts/prediction_market/Cargo.toml
```

Upload the compiled WASM and record the returned hash:

```bash
soroban contract install \
  --network testnet \
  --source admin \
  --wasm target/wasm32-unknown-unknown/release/prediction_market.wasm
```

Keep the resulting 32-byte WASM hash. It is the value passed to `propose_upgrade`.

## Step 2: Propose the Upgrade

Call `propose_upgrade(caller, new_wasm_hash)` as the `SuperAdmin`.

Effects:

- Stores `UpgradeProposal { new_wasm_hash, unlock_ledger }` in instance storage.
- Sets `unlock_ledger = current_ledger + 17280`.
- Emits the `UpProp` contract event.

Example invocation:

```bash
soroban contract invoke \
  --network testnet \
  --source admin \
  --id <CONTRACT_ID> \
  -- propose_upgrade \
  --caller <SUPER_ADMIN_ADDRESS> \
  --new_wasm_hash <WASM_HASH>
```

## Step 3: Wait for the Timelock

Do not execute the upgrade until the contract ledger sequence is at or above `unlock_ledger`.

If `execute_upgrade` is called too early, the contract aborts with:

```text
upgrade timelock is still active
```

During the waiting period:

- Verify the uploaded WASM hash independently.
- Review the source diff and test evidence.
- Confirm monitoring and rollback plans.

## Step 4: Execute the Upgrade

After the timelock expires, call `execute_upgrade(caller)` as the `SuperAdmin`.

Effects:

- Verifies the timelock has elapsed.
- Emits the `Upgrade` contract event with the applied WASM hash.
- Replaces the current contract code in place with `update_current_contract_wasm`.
- Clears the pending upgrade proposal from instance storage.

Example invocation:

```bash
soroban contract invoke \
  --network testnet \
  --source admin \
  --id <CONTRACT_ID> \
  -- execute_upgrade \
  --caller <SUPER_ADMIN_ADDRESS>
```

## Step 5: Post-upgrade Validation

After execution:

- Re-run market creation, betting, dispute, and payout smoke tests.
- Confirm existing market state is still readable.
- Confirm the `Upgrade` event was indexed.
- Verify frontend and backend integrations still point at the same contract ID.

## Cancelling a Pending Upgrade

If the proposal should not proceed, call `cancel_upgrade(caller)` as the `SuperAdmin`.

Effects:

- Removes `DataKey::UpgradeProposal` from instance storage.
- Emits the `UpCancl` contract event.

Example invocation:

```bash
soroban contract invoke \
  --network testnet \
  --source admin \
  --id <CONTRACT_ID> \
  -- cancel_upgrade \
  --caller <SUPER_ADMIN_ADDRESS>
```

## Operational Notes

- Only one upgrade proposal is tracked at a time.
- A new proposal overwrites any previous pending proposal, so do not propose again unless that is intentional.
- The upgrade path preserves contract address continuity, which avoids database and frontend migration work for existing markets.
