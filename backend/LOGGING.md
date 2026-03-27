# Structured JSON Logging

This backend uses [Pino](https://getpino.io/) for structured JSON logging, enabling easy ingestion into monitoring tools like Datadog, ELK Stack, or Grafana.

## Log Levels

Pino uses numeric log levels that map to standard severity names:

| Level | Value | Description | When to Use |
|-------|-------|-------------|-------------|
| **fatal** | 60 | Application crash | System is unusable, requires immediate attention (e.g., database connection lost permanently) |
| **error** | 50 | Error events | Errors that might still allow the app to continue (e.g., failed API call, database query error) |
| **warn** | 40 | Warning messages | Potentially harmful situations (e.g., deprecated API usage, missing optional config) |
| **info** | 30 | Informational messages | Highlight application progress (e.g., server started, market created, bet placed) |
| **debug** | 20 | Detailed debugging info | Detailed information for debugging (e.g., query results, cache hits) |
| **trace** | 10 | Very detailed diagnostics | Extremely detailed diagnostic information (rarely used) |

## Usage

### Basic Logging

```javascript
const logger = require('./utils/logger');

// Info level - general application flow
logger.info({ market_id: 123, status: 'RESOLVED' }, 'Market resolved');

// Error level - with error object
logger.error({ err, market_id: 123 }, 'Failed to resolve market');

// Warn level - potential issues
logger.warn({ market_id: 123 }, 'Market not found');

// Debug level - detailed diagnostics
logger.debug({ query_result_count: 42 }, 'Query executed');
```

### Structured Context

Always include relevant context as the first parameter (object), and a human-readable message as the second:

```javascript
logger.info({
  market_id: req.params.id,
  winning_outcome: winningOutcome,
  total_pool: market.total_pool,
  status: 'RESOLVED'
}, 'Market resolved successfully');
```

### Child Loggers

Create child loggers with persistent context:

```javascript
const { createChildLogger } = require('./utils/logger');

const marketLogger = createChildLogger({ market_id: 123 });
marketLogger.info('Processing market'); // Automatically includes market_id: 123
```

## Configuration

Set the log level via environment variable:

```bash
# Development (shows info, warn, error, fatal)
LOG_LEVEL=info npm run dev

# Debug mode (shows debug, info, warn, error, fatal)
LOG_LEVEL=debug npm run dev

# Production (shows info, warn, error, fatal)
NODE_ENV=production npm start
```

## Output Format

### Development
In development, logs use `pino-pretty` for human-readable output:

```
[2026-03-24 10:30:45.123] INFO: Market resolved
    market_id: 123
    winning_outcome: 1
    status: "RESOLVED"
```

### Production
In production, logs output raw JSON for ingestion by monitoring tools:

```json
{
  "level": "INFO",
  "time": "2026-03-24T10:30:45.123Z",
  "service": "stella-polymarket-api",
  "environment": "production",
  "market_id": 123,
  "winning_outcome": 1,
  "status": "RESOLVED",
  "msg": "Market resolved"
}
```

## Querying Logs

With structured JSON logs, you can easily query specific events:

```bash
# Find all errors for market 123
cat logs.json | jq 'select(.level == "ERROR" and .market_id == 123)'

# Find all market resolutions
cat logs.json | jq 'select(.msg | contains("Market resolved"))'

# Find slow requests (>1000ms)
cat logs.json | jq 'select(.duration_ms > 1000)'
```

## Best Practices

1. **Always include context**: Add relevant IDs (market_id, bet_id, wallet_address) to every log
2. **Use appropriate levels**: Don't log everything as `info` - use `debug` for verbose details
3. **Include error objects**: When logging errors, pass the error object: `logger.error({ err }, 'message')`
4. **Avoid PII**: Don't log sensitive user data (passwords, full wallet private keys, etc.)
5. **Be consistent**: Use the same field names across the codebase (e.g., always `market_id`, not `marketId`)

## Migration Notes

All `console.log`, `console.error`, and `console.warn` statements have been migrated to use the structured logger with appropriate context and log levels.
