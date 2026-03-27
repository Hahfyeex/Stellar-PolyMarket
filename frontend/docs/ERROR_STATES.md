# Error States & Recovery Paths

This document lists the 5 critical error states designed for Stella Polymarket and their respective recovery paths.

## 1. Market Not Found (404)
- **Scenario**: User navigates to a market ID that does not exist or hasn't been synced from the Soroban contract yet.
- **Copy**: "This Market hasn't been created on the Ledger yet."
- **Recovery Path**: "Return to Dashboard" button to guide the user back to valid markets.

## 2. Market Paused (Circuit Breaker)
- **Scenario**: Admin has triggered the circuit breaker on a specific market due to investigation or maintenance.
- **Copy**: "This Market's circuit breaker has been triggered."
- **Recovery Path**: Link to network status and "Return to Dashboard".

## 3. Insufficient Gas (XLM)
- **Scenario**: User has enough betting tokens but lacks the minimum XLM required by the Stellar network for transaction fees.
- **Copy**: "You don't have enough XLM to cover the transaction gas fees."
- **Recovery Path**: "Deposit XLM" action and close modal.

## 4. Transaction Failed
- **Scenario**: The Soroban contract rejected the transaction (e.g., slippage too high, balance changed).
- **Copy**: "The Ledger rejected this transaction."
- **Recovery Path**: "Try Again" to refresh the state or "Return to Dashboard".

## 5. Wallet Disconnected
- **Scenario**: The session with Freighter or other Stellar wallet provider was lost.
- **Copy**: "Your connection to the Stellar network has been interrupted."
- **Recovery Path**: "Reconnect Wallet" button to immediately restore the session.

---
*All error states feature a "Stellar Rocket" themed illustration consistent with the brand identity.*
