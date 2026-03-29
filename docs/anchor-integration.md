# Stellar Anchor Integration (SEP-24)

This document describes the Stellar Anchor integration implemented in `/api/anchor`. It enables fiat on-ramp and off-ramp for African currencies via SEP-24.

## Endpoints

- `GET /api/anchor/info`
  - Requires Authorization `Bearer <JWT>`.
  - Returns supported assets and nominal limits.
  - Response:
    - `supported_assets` (array)
    - `deposit` (min/max)
    - `withdrawal` (min/max)
    - `interactive_deposit_endpoint`
    - `interactive_withdraw_endpoint`

- `POST /api/anchor/deposit`
  - Requires JWT.
  - Request body: `{ wallet, asset, amount? }`.
  - Returns an interactive URL for SEP-24 deposit flow.

- `GET /api/anchor/transactions?wallet=<address>`
  - Requires JWT.
  - Returns transaction history from anchor API.

## Implementation notes

- All anchor routes are protected via `jwtAuth` middleware in `/backend/src/routes/anchor.js`.
- Config via env vars:
  - `ANCHOR_BASE_URL` (defaults to demo anchor URL)
  - `ANCHOR_SUPPORTED_ASSETS` (JSON array string or default `XLM/NGN/KES/GHS`)

## SEP-24 flow

1. User hits `POST /api/anchor/deposit` with wallet, asset, amount.
2. Backend builds an interactive URL and returns it.
3. Frontend redirects user to anchor interactive deposit UI.
4. Anchor completes KYC/payment handshake and redirects user back.
5. Users can query `GET /api/anchor/transactions?wallet=` for history.

## Security

- Anchor API keys should be stored in environment variables (not committed).
- All anchor endpoints require JWT authentication.
