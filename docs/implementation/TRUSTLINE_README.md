# Trustline Auto-Checker

Closes #132

## What It Does

Before any bet involving a custom Stellar asset is submitted, the system automatically checks whether the connected wallet has the required trustline. If not, a one-click modal guides the user through setting it up via Freighter — then resumes the bet automatically.

## Supported Assets

Any custom Stellar asset can be attached to a market via the `asset` field:

```ts
// Market shape
{
  asset: { code: "USDC", issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" }
}
```

Native XLM markets (`asset` field absent or `code: "XLM"`) skip the check entirely.

## Full Trustline Flow

```
User clicks "Bet"
      │
      ▼
market.asset present?
  No  ──────────────────────────────────────► Submit bet directly
  Yes
      │
      ▼
wallet connected?
  No  ──────────────────────────────────────► Show "Connect Wallet" modal
  Yes
      │
      ▼
GET horizon-testnet.stellar.org/accounts/:wallet
      │
      ├─ Timeout (10s)  ──────────────────► Show "Network Timeout" modal + Retry button
      ├─ HTTP 404       ──────────────────► hasTrustline = false → show trustline modal
      ├─ HTTP 5xx       ──────────────────► Show error modal
      │
      ▼
balances[] contains { asset_code, asset_issuer }?
  Yes ──────────────────────────────────────► Submit bet directly (no modal)
  No
      │
      ▼
Show TrustlineModal: "Your wallet needs to trust [ASSET]"
      │
User clicks "Set Up Trustline"
      │
      ▼
buildTrustlineXdr(wallet, asset)
  → TransactionBuilder + Operation.changeTrust
  → 30s timeout, 100 stroops fee, TESTNET passphrase
      │
      ▼
window.freighter.signTransaction(xdr, { network: "TESTNET" })
      │
      ▼
submitTrustlineTx(signedXdr)
  → Horizon.Server.submitTransaction
      │
      ▼
Trustline confirmed ──────────────────────► Resume original bet submission
```

## Edge Cases

| Scenario | Behaviour |
|---|---|
| Wallet not connected | "Connect Wallet" prompt shown |
| Horizon timeout (>10s) | "Network Timeout" modal with Retry button |
| Account not funded (404) | Treated as no trustline — modal shown |
| User cancels Freighter | Error modal with Dismiss |
| Trustline already exists | Modal never shown, bet proceeds immediately |
| XLM / native asset | Check skipped entirely |

## Files

| File | Purpose |
|---|---|
| `frontend/src/utils/trustline.ts` | `hasTrustline`, `buildTrustlineXdr`, `submitTrustlineTx` |
| `frontend/src/hooks/useTrustline.ts` | Orchestration hook |
| `frontend/src/components/TrustlineModal.tsx` | UI modal for all states |
| `frontend/src/utils/__tests__/trustline.test.ts` | Unit tests (>90% coverage) |
