# Contract Source Attestation (SEP-0157) – PR Summary

## What was added

| File | Purpose |
|---|---|
| `.github/workflows/contract-attestation.yml` | Triggered on version tags — builds WASM reproducibly, generates a GitHub-signed attestation, and creates a release |

---

## How it works

Push a version tag (e.g. `v1.0.0-mvp`) and the workflow:

1. **Builds the WASM** with a pinned Rust toolchain and `SOURCE_DATE_EPOCH` set to the commit timestamp for reproducibility
2. **Optimizes** the WASM using `soroban contract optimize`
3. **Hashes** the optimized binary with SHA-256
4. **Generates a GitHub Attestation** via `actions/attest-build-provenance` — this creates a signed SLSA provenance record linking the binary to the exact commit SHA
5. **Creates a GitHub Release** with the WASM binary and attestation details attached

---

## How a user can verify the hash using the Soroban CLI

### Step 1 — Install the Soroban CLI
```bash
cargo install soroban-cli --locked
```

### Step 2 — Download the WASM from the GitHub Release
```bash
curl -L -o prediction_market.optimized.wasm \
  https://github.com/Idrhas/Stellar-PolyMarket/releases/download/v1.0.0-mvp/prediction_market.optimized.wasm
```

### Step 3 — Hash it locally and compare to the release notes
```bash
sha256sum prediction_market.optimized.wasm
```
The output must match the SHA-256 published in the release body. If it doesn't, the binary has been tampered with.

### Step 4 — Verify the GitHub Attestation using the GitHub CLI
```bash
gh attestation verify prediction_market.optimized.wasm \
  --repo Idrhas/Stellar-PolyMarket
```
A successful output confirms the binary was built by GitHub Actions from the exact commit shown in the attestation — not from a developer's local machine.

### Step 5 — Cross-check on Stellar Expert
- Deploy the contract to Stellar testnet/mainnet
- Visit `https://stellar.expert/explorer/testnet/contract/<CONTRACT_ID>`
- The contract's WASM hash shown in the explorer must match the SHA-256 from Step 3

---

## Triggering the workflow

```powershell
git tag v1.0.0-mvp
git push origin v1.0.0-mvp
```

The attestation and release will be created automatically.

---

## Screenshot placeholder

> _(Attach screenshot of `https://github.com/Idrhas/Stellar-PolyMarket/attestations` showing the verified build after the first tag push)_