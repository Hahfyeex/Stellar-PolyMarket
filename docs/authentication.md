# SEP-10 Web Authentication

This document describes the Stellar SEP-10 challenge-response authentication flow used to issue JWTs that are cryptographically linked to a user's Stellar wallet.

## Overview

Standard JWT auth has no proof of wallet ownership. SEP-10 fixes this: the server issues a challenge transaction, the client signs it with their private key, and the server verifies the signature before issuing a JWT.

## Flow

```
Client                                  Server
  |                                       |
  |-- GET /api/auth/challenge?wallet=G... |
  |                                       |-- Build Stellar tx with manageData op
  |                                       |-- Sign with server keypair
  |                                       |-- Store XDR in Redis (TTL 5 min)
  |<-- { transaction: "<base64 XDR>" } ---|
  |                                       |
  |-- Sign tx with wallet private key     |
  |                                       |
  |-- POST /api/auth/token                |
  |   { transaction: "<signed XDR>" }     |
  |                                       |-- Fetch stored XDR from Redis
  |                                       |-- Verify XDR matches stored (replay check)
  |                                       |-- Verify client signature on tx hash
  |                                       |-- Delete challenge from Redis (single-use)
  |                                       |-- Issue JWT (sub = wallet address)
  |<-- { token: "<JWT>", expires_in } ----|
```

## Endpoints

### GET /api/auth/challenge

**Query params:** `wallet` — Stellar public key (G...)

**Response 200:**
```json
{
  "transaction": "<base64-encoded XDR>",
  "network_passphrase": "Test SDF Network ; September 2015"
}
```

**Errors:** `400` missing/invalid wallet, `500` server misconfiguration.

---

### POST /api/auth/token

**Body:**
```json
{ "transaction": "<base64-encoded signed XDR>" }
```

**Response 200:**
```json
{
  "token": "<JWT>",
  "expires_in": 86400
}
```

**JWT claims:**
| Claim | Value |
|-------|-------|
| `sub` | Stellar wallet address |
| `wallet` | Stellar wallet address |
| `role` | `"user"` or `"admin"` |

**Expiry:** 24 hours for regular users, 1 hour for admin wallets (configured via `ADMIN_WALLETS` env var).

**Errors:**
| Status | Reason |
|--------|--------|
| `400` | Missing transaction or malformed XDR |
| `401` | Challenge expired (> 5 min), challenge not found, XDR mismatch (replay), or invalid signature |

## Security Properties

- **Single-use challenges:** The challenge XDR is deleted from Redis immediately after successful verification. Replaying the same signed transaction returns `401`.
- **5-minute TTL:** Challenges stored in Redis with a 300-second TTL. Submitting after expiry returns `401`.
- **Signature binding:** The JWT `sub` claim equals the wallet address whose private key signed the challenge. No other party can obtain a valid token for that wallet.
- **Existing endpoints:** All existing `jwtAuth`-protected endpoints continue to work — they verify the JWT signature and `sub` claim regardless of how the token was issued.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `STELLAR_SERVER_SECRET` | Server Stellar keypair secret (required) |
| `STELLAR_NETWORK` | `"mainnet"` or `"testnet"` (default: testnet) |
| `HOME_DOMAIN` | Domain prefix for the manageData operation name |
| `ADMIN_WALLETS` | Comma-separated list of admin wallet addresses |
| `JWT_SECRET` | Secret used to sign JWTs |

## Client Example

```js
// 1. Get challenge
const { transaction, network_passphrase } = await fetch(
  `/api/auth/challenge?wallet=${keypair.publicKey()}`
).then(r => r.json());

// 2. Sign challenge
const tx = new StellarSdk.Transaction(transaction, network_passphrase);
tx.sign(keypair);
const signed = tx.toEnvelope().toXDR("base64");

// 3. Exchange for JWT
const { token } = await fetch("/api/auth/token", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ transaction: signed }),
}).then(r => r.json());

// 4. Use JWT on protected endpoints
fetch("/api/admin/...", { headers: { Authorization: `Bearer ${token}` } });
```
