# Logging Quick Reference

## Import
```javascript
const logger = require('./utils/logger');
```

## Basic Usage

```javascript
// ✅ DO: Include context + message
logger.info({ market_id: 123, status: 'RESOLVED' }, 'Market resolved');

// ❌ DON'T: Just a message
logger.info('Market resolved');

// ❌ DON'T: String interpolation
logger.info(`Market ${marketId} resolved`);
```

## Log Levels (When to Use)

```javascript
// FATAL (60) - App crash, immediate attention needed
logger.fatal({ err, db_host: 'localhost' }, 'Database connection lost permanently');

// ERROR (50) - Errors that allow app to continue
logger.error({ err, market_id: 123 }, 'Failed to resolve market');

// WARN (40) - Potentially harmful situations
logger.warn({ market_id: 999 }, 'Market not found');

// INFO (30) - Application progress (DEFAULT)
logger.info({ market_id: 123, status: 'RESOLVED' }, 'Market resolved');

// DEBUG (20) - Detailed debugging info
logger.debug({ query_result_count: 42 }, 'Query executed');

// TRACE (10) - Very detailed diagnostics (rarely used)
logger.trace({ sql: 'SELECT * FROM...' }, 'Executing query');
```

## Common Patterns

### HTTP Requests
```javascript
logger.info({
  method: req.method,
  path: req.path,
  status: res.statusCode,
  duration_ms: 145,
  ip: req.ip,
}, 'HTTP Request');
```

### Database Operations
```javascript
logger.debug({ 
  table: 'markets', 
  operation: 'SELECT',
  rows_returned: result.rows.length 
}, 'Database query executed');
```

### Business Events
```javascript
logger.info({
  market_id: 123,
  winning_outcome: 1,
  total_pool: '1000.50',
  winners_count: 15,
}, 'Payouts distributed');
```

### Errors
```javascript
logger.error({
  err,  // Always include the error object
  market_id: 123,
  operation: 'resolve',
}, 'Failed to resolve market');
```

### Warnings
```javascript
logger.warn({
  market_id: 123,
  wallet_address: 'GBXYZ...',
  reason: 'market_expired',
}, 'Bet rejected');
```

## Field Naming Conventions

```javascript
// ✅ DO: Use snake_case for consistency
{ market_id: 123, wallet_address: 'GB...' }

// ❌ DON'T: Mix camelCase and snake_case
{ marketId: 123, wallet_address: 'GB...' }

// ✅ DO: Use consistent field names
{ market_id: 123 }  // Always market_id, never marketId or id

// ✅ DO: Include units in field names
{ duration_ms: 145, timeout_seconds: 30 }
```

## Child Loggers

```javascript
const { createChildLogger } = require('./utils/logger');

// Create logger with persistent context
const marketLogger = createChildLogger({ market_id: 123 });

// All logs automatically include market_id: 123
marketLogger.info('Processing market');
marketLogger.warn('Market expired');
```

## Environment Variables

```bash
# Set log level (default: info)
LOG_LEVEL=debug npm run dev

# Production mode (JSON output)
NODE_ENV=production npm start

# Development mode (pretty output)
NODE_ENV=development npm run dev
```

## Testing

```bash
# Run logger demo
npm run test:logger

# View sample output
cat backend/structured-logs-sample.json | jq
```

## Querying Logs

```bash
# Find all errors
jq 'select(.level == "ERROR")' logs.json

# Find logs for specific market
jq 'select(.market_id == 123)' logs.json

# Find slow requests
jq 'select(.duration_ms > 1000)' logs.json

# Count errors by market
jq 'select(.level == "ERROR") | .market_id' logs.json | sort | uniq -c
```

## Best Practices

1. **Always include context**: Add relevant IDs to every log
2. **Use appropriate levels**: Don't log everything as `info`
3. **Include error objects**: Pass `err` when logging errors
4. **Be consistent**: Use same field names across codebase
5. **Avoid PII**: Don't log passwords, private keys, etc.
6. **Add units**: Use `duration_ms`, not just `duration`
7. **Keep messages short**: Context goes in fields, not message

## Anti-Patterns

```javascript
// ❌ String interpolation
logger.info(`Market ${id} resolved with outcome ${outcome}`);

// ✅ Structured fields
logger.info({ market_id: id, winning_outcome: outcome }, 'Market resolved');

// ❌ No context
logger.error('Failed to resolve market');

// ✅ Rich context
logger.error({ err, market_id: 123, winning_outcome: 1 }, 'Failed to resolve market');

// ❌ Logging sensitive data
logger.info({ password: 'secret123' }, 'User login');

// ✅ Logging safe data
logger.info({ user_id: 123, ip: req.ip }, 'User login');
```
