# Multi-asset Bet Payments with Stellar Pathfinding

This document describes the implementation of multi-asset bet payments in the Stellar-PolyMarket backend.

## Overview

Users may hold various assets on the Stellar network (e.g., USDC, ARS, BRL) but want to bet on a market that requires a specific token (usually XLM). Instead of requiring users to manually swap assets first, the system uses Stellar pathfinding to allow "strict-send" or "strict-receive" payment paths in a single transaction.

## API Endpoints

### 1. Query Payment Paths
The frontend can query available conversion paths for a given source asset and amount.

**GET** `/api/bets/payment-paths`

**Query Parameters:**
- `source_asset`: (string) Asset code of the user's held asset (e.g., `USDC`).
- `source_issuer`: (string) Asset issuer of the source asset (undefined for `XLM`).
- `dest_asset`: (string) Asset code of the market's required token (e.g., `XLM`).
- `dest_issuer`: (string) Asset issuer of the destination asset.
- `amount`: (string) Source amount in stroops.

**Example Response:**
```json
{
  "status": "success",
  "data": [
    {
      "source_asset_code": "USDC",
      "source_amount": "10000000",
      "destination_asset_code": "XLM",
      "destination_amount": "150000000",
      "path": [
        { "asset_code": "BTC", "asset_issuer": "..." }
      ]
    }
  ]
}
```

### 2. Place Bet with Multi-asset
When placing a bet, the frontend can optional provide the `sourceAssetCode` and `sourceAssetIssuer`.

**POST** `/api/bets`

**Request Body Enhancement:**
```json
{
  "marketId": 1,
  "outcomeIndex": 0,
  "amount": "10000000",
  "walletAddress": "...",
  "transaction_hash": "...",
  "sourceAssetCode": "USDC",
  "sourceAssetIssuer": "..."
}
```

The backend then:
1. Verifies that a valid conversion path exists on-chain.
2. Returns the best `paymentPath` alongside the confirmed bet record.

## Technical Details

- **Horizon API**: The backend uses the `/paths/strict-send` Horizon endpoint.
- **Strict Send**: The user specifies exactly how much of the source asset they want to spend, and the network determines the best destination amount for the bet.
- **Conversion Paths**: If the direct path has low liquidity, Horizon returns multi-hop paths (e.g., USDC -> BTC -> XLM).

## Transaction Flow
1. User selects "Pay with USDC" in the UI.
2. UI calls `/api/bets/payment-paths` to show the expected XLM output and the path hops.
3. User signs a `Path Payment Strict Send` transaction on Stellar.
4. UI calls `POST /api/bets` with the transaction hash and source asset details.
5. Backend confirms the transaction and records the bet in the database.
