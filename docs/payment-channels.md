# Stellar Payment Channels

## Overview

Payment channels allow high-frequency bettors to batch multiple off-chain bet transactions and settle them on-chain in a single Stellar transaction, dramatically reducing fees.

## Flow

```
User                    Backend                  Stellar Network
 |                         |                           |
 |-- POST /channels/open ->|                           |
 |                         |-- fund channel account -->|
 |<-- channel_id ----------|                           |
 |                         |                           |
 |-- POST /channels/submit (signed XDR) ->|            |
 |   (repeat up to 100x or 1 hour)        |            |
 |                         |                           |
 |-- POST /channels/settle ->|                         |
 |                         |-- batch submit all XDRs ->|
 |<-- settled_count --------|                          |
```

## Auto-Settle Triggers

- **100 queued transactions** — channel settles automatically
- **1 hour** since first queued transaction — channel settles automatically

## Endpoints

### `POST /api/channels/open`
Opens a channel account funded by the user.

**Auth:** JWT required

**Body:**
```json
{
  "walletAddress": "G...",
  "channelPublicKey": "G...",
  "channelSecretKey": "S..."
}
```

**Response:** `201` with `{ channel: { id, wallet_address, channel_public_key, status, created_at } }`

---

### `POST /api/channels/submit`
Queues a signed off-chain bet transaction.

**Auth:** JWT required

**Body:**
```json
{
  "channelId": 1,
  "signedXdr": "AAAAAQ..."
}
```

**Response:** `201` with `{ transaction: { id, channel_id, created_at } }`

Auto-settle is triggered if 100 transactions are queued or the oldest is >1 hour old.

---

### `POST /api/channels/settle`
Manually settles all queued transactions for a channel.

**Auth:** JWT required

**Body:**
```json
{ "channelId": 1 }
```

**Response:** `200` with `{ settled_count: N }`

## Security

- Channel account secret keys are stored **AES-256-GCM encrypted** in the database.
- Set `CHANNEL_ENCRYPTION_KEY` (32-byte hex) in environment variables.
- All endpoints require a valid JWT token.
