# Permissionless Launch Quick Reference

Quick guide for validation rules, error codes, and common commands.

## Validation Rules Summary

| Rule | Requirement | Error Code |
|------|-------------|------------|
| Description Length | ≥ 50 characters | `DESCRIPTION_TOO_SHORT` |
| Outcome Count | 2-5 outcomes | `INVALID_OUTCOME_COUNT` |
| End Date | Future, within 1 year | `INVALID_END_DATE` |
| Duplicate Check | Unique question | `DUPLICATE_MARKET` |
| Rate Limit | 3 per wallet per 24h | `RATE_LIMIT_EXCEEDED` |

## Error Codes

| Code | Status | Meaning |
|------|--------|---------|
| `DESCRIPTION_TOO_SHORT` | 400 | Question < 50 chars |
| `INVALID_OUTCOME_COUNT` | 400 | Not 2-5 outcomes |
| `INVALID_END_DATE` | 400 | Past or > 1 year |
| `DUPLICATE_MARKET` | 409 | Question exists |
| `RATE_LIMIT_EXCEEDED` | 429 | 3 markets in 24h |
| `MISSING_WALLET_ADDRESS` | 400 | No wallet provided |

## Quick Commands

### Create Valid Market
```bash
curl -X POST http://localhost:4000/api/markets \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Will Bitcoin reach $100,000 by the end of 2026?",
    "endDate": "2026-12-31T23:59:59Z",
    "outcomes": ["Yes", "No"],
    "walletAddress": "GTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  }'
```

### Check Rate Limit
```bash
redis-cli GET rate_limit:create:GTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ
redis-cli TTL rate_limit:create:GTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ
```

### Reset Rate Limit
```bash
redis-cli DEL rate_limit:create:GTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ
```

### Run Tests
```bash
cd backend
npm test marketValidation.test.js
npm test rateLimiting.test.js
npm test -- --coverage
```

## Validation Examples

### ✅ Valid Markets

```json
{
  "question": "Will the global average temperature increase by more than 1.5°C by 2030?",
  "endDate": "2030-12-31T23:59:59Z",
  "outcomes": ["Yes", "No"],
  "walletAddress": "GTEST..."
}
```

```json
{
  "question": "Which cryptocurrency will have the highest market cap by end of 2026?",
  "endDate": "2026-12-31T23:59:59Z",
  "outcomes": ["Bitcoin", "Ethereum", "Cardano", "Solana", "Other"],
  "walletAddress": "GTEST..."
}
```

### ❌ Invalid Markets

**Too Short**:
```json
{
  "question": "Will BTC hit $100k?",  // Only 19 chars
  "endDate": "2026-12-31T23:59:59Z",
  "outcomes": ["Yes", "No"],
  "walletAddress": "GTEST..."
}
```

**Too Many Outcomes**:
```json
{
  "question": "Which team will win the championship this year?",
  "endDate": "2026-12-31T23:59:59Z",
  "outcomes": ["A", "B", "C", "D", "E", "F"],  // 6 outcomes
  "walletAddress": "GTEST..."
}
```

**Past Date**:
```json
{
  "question": "Will Bitcoin reach $100,000 by the end of 2023?",
  "endDate": "2023-12-31T23:59:59Z",  // In the past
  "outcomes": ["Yes", "No"],
  "walletAddress": "GTEST..."
}
```

## Rate Limit Headers

### Request Within Limit
```http
X-RateLimit-Limit: 3
X-RateLimit-Remaining: 1
X-RateLimit-Reset: 1711368000000
```

### Request Exceeds Limit
```http
HTTP/1.1 429 Too Many Requests
Retry-After: 75600
X-RateLimit-Limit: 3
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1711368000000
```

## Redis Commands

### Check Current Count
```bash
redis-cli GET rate_limit:create:{wallet}
```

### Check Time Remaining
```bash
redis-cli TTL rate_limit:create:{wallet}
```

### View All Rate Limits
```bash
redis-cli KEYS "rate_limit:create:*"
```

### Delete Specific Limit
```bash
redis-cli DEL rate_limit:create:{wallet}
```

### Delete All Limits
```bash
redis-cli KEYS "rate_limit:create:*" | xargs redis-cli DEL
```

## Testing Checklist

- [ ] Description < 50 chars rejected
- [ ] Description ≥ 50 chars accepted
- [ ] 1 outcome rejected
- [ ] 6 outcomes rejected
- [ ] 2-5 outcomes accepted
- [ ] Past date rejected
- [ ] Date > 1 year rejected
- [ ] Future date accepted
- [ ] Duplicate question rejected
- [ ] Unique question accepted
- [ ] 4th market in 24h rejected
- [ ] 1st-3rd markets accepted
- [ ] Rate limit resets after 24h
- [ ] Different wallets tracked separately

## Troubleshooting

### Redis Not Working
```bash
# Check Redis is running
docker ps | grep redis

# Test connection
redis-cli ping

# Check logs
docker logs stellar-polymarket-redis
```

### Rate Limit Not Resetting
```bash
# Check TTL
redis-cli TTL rate_limit:create:{wallet}

# Manually reset
redis-cli DEL rate_limit:create:{wallet}
```

### Validation Not Working
```bash
# Check backend logs
tail -f backend/logs/app.log

# Run validation tests
npm test marketValidation.test.js
```

## Environment Variables

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
DATABASE_URL=postgresql://user:password@localhost:5432/stella_polymarket
```

## Common Issues

| Issue | Solution |
|-------|----------|
| Redis connection failed | Start Redis: `docker compose up -d redis` |
| Rate limit bypassed | Check Redis connection and logs |
| Duplicate not detected | Check database query and case sensitivity |
| Tests failing | Run `npm install` and check mocks |

## Quick Setup

```bash
# 1. Install dependencies
cd backend && npm install

# 2. Start Redis
docker compose up -d redis

# 3. Configure environment
cp .env.example .env

# 4. Run tests
npm test

# 5. Start backend
npm start
```

## API Response Format

### Success (201)
```json
{
  "market": { /* market object */ },
  "message": "Market created successfully and published immediately"
}
```

### Error (4xx/5xx)
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "statusCode": 400,
    "details": { /* additional context */ }
  }
}
```

## Monitoring

### Key Metrics
- Markets created per hour
- Validation failures by type
- Rate limit hits per hour
- Duplicate attempts
- Redis response time

### Log Queries
```bash
# Validation failures
grep "validation failed" backend/logs/app.log

# Rate limit hits
grep "RATE_LIMIT_EXCEEDED" backend/logs/app.log

# Markets created
grep "Market created via permissionless" backend/logs/app.log
```

## Support

- Full docs: `PERMISSIONLESS_LAUNCH_README.md`
- Test files: `backend/src/tests/`
- Middleware: `backend/src/middleware/marketValidation.js`
