# Logging Migration Examples

This document shows before/after examples of the console.log to structured logging migration.

## Example 1: Server Startup

### Before
```javascript
console.log(`Stella Polymarket API running on port ${PORT}`);
```

### After
```javascript
logger.info({ port: PORT, environment: process.env.NODE_ENV || "development" }, "Server started");
```

### Output (Production)
```json
{
  "level": "INFO",
  "time": "2026-03-24T13:55:53.339Z",
  "service": "stella-polymarket-api",
  "environment": "production",
  "port": 4000,
  "msg": "Server started"
}
```

---

## Example 2: Error Handling

### Before
```javascript
console.error(err.stack);
```

### After
```javascript
logger.error({
  err,
  method: req.method,
  path: req.path,
  body: req.body,
}, "Unhandled error");
```

### Output (Production)
```json
{
  "level": "ERROR",
  "time": "2026-03-24T13:55:53.341Z",
  "service": "stella-polymarket-api",
  "environment": "production",
  "err": {
    "type": "Error",
    "message": "Connection timeout",
    "stack": "Error: Connection timeout\n    at ..."
  },
  "method": "POST",
  "path": "/api/markets/123/resolve",
  "body": { "winningOutcome": 1 },
  "msg": "Unhandled error"
}
```

---

## Example 3: Notification Trigger

### Before
```javascript
console.log(`[Notification Trigger] Market #${marketId} status changed to ${newStatus}`);
console.warn(`[Notification Trigger] Failed to alert notification service: ${err.message}`);
```

### After
```javascript
logger.info({ market_id: marketId, status: newStatus }, "Triggering notification");
logger.warn({ market_id: marketId, status: newStatus, err: err.message }, "Failed to alert notification service");
```

### Output (Production)
```json
{
  "level": "INFO",
  "time": "2026-03-24T13:55:53.340Z",
  "service": "stella-polymarket-api",
  "environment": "production",
  "market_id": 123,
  "status": "RESOLVED",
  "msg": "Triggering notification"
}
```

---

## Example 4: Business Logic Events

### Before
```javascript
// No logging at all
```

### After
```javascript
logger.info({
  bet_id: bet.rows[0].id,
  market_id: marketId,
  wallet_address: walletAddress,
  outcome_index: outcomeIndex,
  amount,
}, "Bet placed");
```

### Output (Production)
```json
{
  "level": "INFO",
  "time": "2026-03-24T13:55:53.340Z",
  "service": "stella-polymarket-api",
  "environment": "production",
  "bet_id": 456,
  "market_id": 123,
  "wallet_address": "GBDEF...",
  "outcome_index": 1,
  "amount": "100.50",
  "msg": "Bet placed"
}
```

---

## Benefits of Structured Logging

### 1. Easy Querying
```bash
# Find all errors for a specific market
jq 'select(.level == "ERROR" and .market_id == 123)' logs.json

# Find all bets by a specific wallet
jq 'select(.wallet_address == "GBDEF...")' logs.json

# Find slow requests
jq 'select(.duration_ms > 1000)' logs.json
```

### 2. Monitoring Integration
- Datadog: Automatic field extraction and indexing
- ELK Stack: Direct JSON ingestion
- Grafana Loki: Label-based querying

### 3. Alerting
```javascript
// Alert on: level == "ERROR" AND market_id exists
// Alert on: duration_ms > 5000
// Alert on: status >= 500
```

### 4. Debugging at 3 AM
Instead of:
```
[Notification Trigger] Market #123 status changed to RESOLVED
[Notification Trigger] Failed to alert notification service: Connection timeout
```

You get:
```json
{
  "level": "WARN",
  "market_id": 123,
  "status": "RESOLVED",
  "err": "Connection timeout",
  "msg": "Failed to alert notification service"
}
```

Now you can instantly query: "Show me all notification failures for market 123" instead of grepping through text logs.
