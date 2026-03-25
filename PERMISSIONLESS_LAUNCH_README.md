# Permissionless Market Creation

Comprehensive guide to automated market validation and permissionless launch system.

## Overview

The permissionless launch system enables community-driven market creation without requiring admin approval. All markets are validated automatically using a robust set of rules, ensuring quality while maintaining decentralization.

## Key Features

- **Automated Validation**: 4 validation rules enforce market quality
- **Rate Limiting**: Prevents spam with 3 markets per wallet per 24 hours
- **Instant Publishing**: Valid markets go live immediately
- **Specific Error Codes**: Actionable feedback for each validation failure
- **Redis-Backed**: Distributed rate limiting with Redis

## Validation Rules

### 1. Description Length (Minimum 50 Characters)

**Rule**: Market questions must be at least 50 characters long.

**Rationale**: Ensures markets have sufficient context for users to make informed decisions.

**Example Valid**:
```
Will Bitcoin reach $100,000 by the end of 2026?
```
(52 characters)

**Example Invalid**:
```
Will BTC hit $100k?
```
(19 characters)

**Error Response**:
```json
{
  "error": {
    "code": "DESCRIPTION_TOO_SHORT",
    "message": "Market question must be at least 50 characters long",
    "statusCode": 400,
    "details": {
      "currentLength": 19,
      "requiredLength": 50
    }
  }
}
```

### 2. Outcome Count (2-5 Outcomes)

**Rule**: Markets must have between 2 and 5 outcomes.

**Rationale**: 
- Binary markets (2 outcomes) are the most common
- Multi-choice markets (3-5 outcomes) provide flexibility
- More than 5 outcomes become difficult to manage and bet on

**Example Valid (Binary)**:
```json
{
  "outcomes": ["Yes", "No"]
}
```

**Example Valid (Multi-choice)**:
```json
{
  "outcomes": ["Bitcoin", "Ethereum", "Cardano", "Solana", "Other"]
}
```

**Example Invalid**:
```json
{
  "outcomes": ["Only One"]
}
```

**Error Response**:
```json
{
  "error": {
    "code": "INVALID_OUTCOME_COUNT",
    "message": "Market must have between 2 and 5 outcomes",
    "statusCode": 400,
    "details": {
      "currentCount": 1,
      "requiredRange": "2-5"
    }
  }
}
```

### 3. Valid End Date (Future, Within 1 Year)

**Rule**: End date must be:
- In the future (after current time)
- Within 1 year from now
- Valid ISO 8601 format

**Rationale**:
- Past dates don't make sense for prediction markets
- 1 year maximum prevents extremely long-term markets that may never resolve
- Standard date format ensures consistency

**Example Valid**:
```json
{
  "endDate": "2026-12-31T23:59:59Z"
}
```

**Example Invalid (Past)**:
```json
{
  "endDate": "2023-01-01T00:00:00Z"
}
```

**Example Invalid (Too Far)**:
```json
{
  "endDate": "2030-01-01T00:00:00Z"
}
```

**Error Response**:
```json
{
  "error": {
    "code": "INVALID_END_DATE",
    "message": "End date must be in the future and within 1 year",
    "statusCode": 400,
    "details": {
      "providedDate": "2023-01-01T00:00:00Z",
      "minimumDate": "2026-03-25T10:00:00Z",
      "maximumDate": "2027-03-25T10:00:00Z"
    }
  }
}
```

### 4. No Duplicate Markets

**Rule**: Market questions must be unique (case-insensitive, whitespace-trimmed).

**Rationale**: Prevents fragmentation of liquidity and user confusion.

**Duplicate Detection**:
- Case-insensitive comparison
- Leading/trailing whitespace ignored
- Exact match after normalization

**Example**:
These are considered duplicates:
```
"Will Bitcoin reach $100,000 by end of 2026?"
"WILL BITCOIN REACH $100,000 BY END OF 2026?"
"  Will Bitcoin reach $100,000 by end of 2026?  "
```

**Error Response**:
```json
{
  "error": {
    "code": "DUPLICATE_MARKET",
    "message": "A market with this question already exists",
    "statusCode": 409,
    "details": {
      "existingMarketId": 123,
      "existingQuestion": "Will Bitcoin reach $100,000 by end of 2026?"
    }
  }
}
```

## Rate Limiting

### Configuration

- **Limit**: 3 markets per wallet per 24 hours
- **Window**: 86400 seconds (24 hours)
- **Storage**: Redis with automatic TTL
- **Key Format**: `rate_limit:create:{walletAddress}`

### How It Works

1. **First Market**: Counter set to 1, TTL set to 24 hours
2. **Second Market**: Counter incremented to 2
3. **Third Market**: Counter incremented to 3 (at limit)
4. **Fourth Market**: Rejected with 429 status

### Rate Limit Headers

All responses include rate limit information:

```http
X-RateLimit-Limit: 3
X-RateLimit-Remaining: 1
X-RateLimit-Reset: 1711368000000
```

When rate limit is exceeded:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 75600
X-RateLimit-Limit: 3
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1711368000000
```

### Error Response

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Maximum 3 markets per wallet per 24 hours",
    "statusCode": 429,
    "details": {
      "limit": 3,
      "windowSeconds": 86400,
      "retryAfterSeconds": 75600,
      "resetAt": "2026-03-26T10:00:00Z"
    }
  }
}
```

## API Usage

### Create Market Endpoint

**Endpoint**: `POST /api/markets`

**Headers**:
```http
Content-Type: application/json
```

**Request Body**:
```json
{
  "question": "Will Bitcoin reach $100,000 by the end of 2026?",
  "endDate": "2026-12-31T23:59:59Z",
  "outcomes": ["Yes", "No"],
  "walletAddress": "GTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  "contractAddress": "CCONTRACT1234567890ABCDEFGHIJKLMNOPQRSTUVW"
}
```

**Required Fields**:
- `question` (string, min 50 chars)
- `endDate` (ISO 8601 string)
- `outcomes` (array of 2-5 strings)
- `walletAddress` (Stellar wallet address)

**Optional Fields**:
- `contractAddress` (Soroban contract address)

### Success Response

**Status**: `201 Created`

```json
{
  "market": {
    "id": 456,
    "question": "Will Bitcoin reach $100,000 by the end of 2026?",
    "end_date": "2026-12-31T23:59:59Z",
    "outcomes": ["Yes", "No"],
    "resolved": false,
    "winning_outcome": null,
    "total_pool": "0",
    "status": "ACTIVE",
    "contract_address": "CCONTRACT1234567890ABCDEFGHIJKLMNOPQRSTUVW",
    "created_at": "2026-03-25T10:00:00Z"
  },
  "message": "Market created successfully and published immediately"
}
```

### Error Responses

All validation errors follow this format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "statusCode": 400,
    "details": {
      // Additional context specific to the error
    }
  }
}
```

**Possible Error Codes**:
- `DESCRIPTION_TOO_SHORT` (400)
- `INVALID_OUTCOME_COUNT` (400)
- `INVALID_END_DATE` (400)
- `DUPLICATE_MARKET` (409)
- `RATE_LIMIT_EXCEEDED` (429)
- `MISSING_WALLET_ADDRESS` (400)
- `MISSING_REQUIRED_FIELDS` (400)
- `DATABASE_ERROR` (500)

## Examples

### Example 1: Valid Binary Market

**Request**:
```bash
curl -X POST http://localhost:4000/api/markets \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Will the global average temperature increase by more than 1.5°C by 2030?",
    "endDate": "2030-12-31T23:59:59Z",
    "outcomes": ["Yes", "No"],
    "walletAddress": "GTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  }'
```

**Response**: `201 Created`

### Example 2: Valid Multi-Choice Market

**Request**:
```bash
curl -X POST http://localhost:4000/api/markets \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Which cryptocurrency will have the highest market cap by end of 2026?",
    "endDate": "2026-12-31T23:59:59Z",
    "outcomes": ["Bitcoin", "Ethereum", "Cardano", "Solana", "Other"],
    "walletAddress": "GTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  }'
```

**Response**: `201 Created`

### Example 3: Description Too Short

**Request**:
```bash
curl -X POST http://localhost:4000/api/markets \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Will BTC hit $100k?",
    "endDate": "2026-12-31T23:59:59Z",
    "outcomes": ["Yes", "No"],
    "walletAddress": "GTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  }'
```

**Response**: `400 Bad Request`
```json
{
  "error": {
    "code": "DESCRIPTION_TOO_SHORT",
    "message": "Market question must be at least 50 characters long",
    "statusCode": 400,
    "details": {
      "currentLength": 19,
      "requiredLength": 50
    }
  }
}
```

### Example 4: Rate Limit Exceeded

**Request** (4th market in 24 hours):
```bash
curl -X POST http://localhost:4000/api/markets \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Will this fourth market be accepted by the system today?",
    "endDate": "2026-12-31T23:59:59Z",
    "outcomes": ["Yes", "No"],
    "walletAddress": "GTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  }'
```

**Response**: `429 Too Many Requests`
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Maximum 3 markets per wallet per 24 hours",
    "statusCode": 429,
    "details": {
      "limit": 3,
      "windowSeconds": 86400,
      "retryAfterSeconds": 75600,
      "resetAt": "2026-03-26T10:00:00Z"
    }
  }
}
```

## Setup & Configuration

### Prerequisites

1. **Redis Server**: Required for rate limiting
2. **PostgreSQL**: Required for market storage
3. **Node.js 16+**: Required for backend

### Installation

1. **Install Dependencies**:
```bash
cd backend
npm install
```

2. **Start Redis**:
```bash
docker compose up -d redis
```

3. **Configure Environment**:
```bash
cp .env.example .env
```

Edit `.env`:
```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
DATABASE_URL=postgresql://user:password@localhost:5432/stella_polymarket
```

4. **Start Backend**:
```bash
npm start
```

### Testing

**Run Unit Tests**:
```bash
npm test
```

**Run Specific Test Suite**:
```bash
npm test marketValidation.test.js
npm test rateLimiting.test.js
```

**Check Coverage**:
```bash
npm test -- --coverage
```

Target: >90% coverage

## Architecture

### Middleware Chain

```
POST /api/markets
    ↓
validateMarketCreation
    ├─ Check description length
    ├─ Check outcome count
    ├─ Check end date validity
    └─ Check for duplicates
    ↓
rateLimitMarketCreation
    ├─ Check wallet address
    ├─ Increment Redis counter
    ├─ Check if limit exceeded
    └─ Set rate limit headers
    ↓
Market Creation Handler
    ├─ Insert into database
    ├─ Log creation
    └─ Return 201 Created
```

### Redis Key Structure

```
rate_limit:create:{walletAddress}
    ↓
Value: Integer (creation count)
TTL: 86400 seconds (24 hours)
```

### Database Schema

```sql
CREATE TABLE markets (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  outcomes TEXT[] NOT NULL,
  resolved BOOLEAN DEFAULT FALSE,
  winning_outcome INT,
  total_pool NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'ACTIVE',
  contract_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Monitoring & Logging

### Log Events

All validation events are logged with structured logging:

```javascript
// Validation passed
logger.debug({ 
  question, 
  outcomes_count: outcomes.length 
}, 'Market validation passed');

// Validation failed
logger.warn({ 
  question_length: question?.length || 0,
  validation: 'DESCRIPTION_TOO_SHORT' 
}, 'Market validation failed: description too short');

// Rate limit exceeded
logger.warn({ 
  wallet_address: walletAddress,
  current_count: currentCount,
  max_creations: maxCreations,
  ttl_seconds: ttl,
  validation: 'RATE_LIMIT_EXCEEDED' 
}, 'Market creation rate limit exceeded');

// Market created
logger.info({
  market_id: result.rows[0].id,
  question,
  wallet_address: walletAddress,
  permissionless: true
}, "Market created via permissionless launch");
```

### Metrics to Track

- **Validation Failures by Type**: Track which validation rules fail most often
- **Rate Limit Hits**: Monitor how often users hit the rate limit
- **Market Creation Rate**: Track markets created per hour/day
- **Duplicate Attempts**: Monitor duplicate market attempts
- **Redis Performance**: Track Redis response times

## Troubleshooting

### Redis Connection Issues

**Symptom**: Rate limiting not working, all requests allowed

**Solution**:
1. Check Redis is running: `docker ps | grep redis`
2. Test connection: `redis-cli ping`
3. Check environment variables: `REDIS_HOST`, `REDIS_PORT`
4. Review logs for Redis connection errors

**Fallback**: If Redis is unavailable, rate limiting is bypassed to prevent blocking all market creation.

### Duplicate Detection Not Working

**Symptom**: Duplicate markets being created

**Solution**:
1. Check database query is case-insensitive
2. Verify TRIM() is applied to questions
3. Check for database connection issues
4. Review logs for duplicate check errors

### Rate Limit Not Resetting

**Symptom**: Users still rate limited after 24 hours

**Solution**:
1. Check Redis TTL: `redis-cli TTL rate_limit:create:{wallet}`
2. Verify TTL is set on first creation
3. Check system clock is correct
4. Manually delete key if needed: `redis-cli DEL rate_limit:create:{wallet}`

## Security Considerations

### Wallet Address Validation

Currently, wallet addresses are accepted as-is. Consider adding:
- Stellar address format validation
- Signature verification to prove ownership
- Blacklist for known malicious addresses

### Rate Limit Bypass Prevention

- Rate limits are per wallet address
- Consider IP-based rate limiting as additional layer
- Monitor for patterns of abuse (many wallets from same IP)

### Duplicate Market Attacks

- Current implementation prevents exact duplicates
- Consider fuzzy matching for similar questions
- Monitor for slight variations of same market

## Future Enhancements

1. **Configurable Rate Limits**: Allow admins to adjust limits per user tier
2. **Market Categories**: Add category validation
3. **Automated Quality Scoring**: ML-based quality assessment
4. **Community Moderation**: Allow users to flag low-quality markets
5. **Reputation System**: Higher limits for trusted users
6. **Market Templates**: Pre-approved templates for common market types

## Support

For issues or questions:
- Check logs: `backend/logs/`
- Review test cases: `backend/src/tests/`
- Open GitHub issue with error details

## License

Same as main project license.
