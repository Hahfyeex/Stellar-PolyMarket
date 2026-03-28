# Throughput Stress Test Suite

Comprehensive load testing suite for Stellar PolyMarket platform using Taurus framework.

## Overview

This stress test suite validates platform performance under peak load conditions, identifying bottlenecks before they affect production users.

## Test Scenarios

### 1. Concurrent Bets (500 Users)
- **Load**: 500 concurrent users
- **Duration**: 60s ramp-up + 2m sustained load
- **Target**: Each user places 1 bet
- **Success Criteria**: Error rate < 1%, p95 latency < 2s

### 2. Market Resolution Under Load (50 Simultaneous)
- **Load**: 50 concurrent market resolutions
- **Duration**: 10s ramp-up + 1m sustained load
- **Target**: Create, propose, and resolve markets
- **Success Criteria**: p95 latency < 5s, error rate < 1%

### 3. WebSocket Connection Stress (1000 Connections)
- **Load**: 1000 concurrent connections
- **Duration**: 30s ramp-up + 3m sustained
- **Target**: Maintain stable connections with polling
- **Success Criteria**: Connection success rate > 99%

## Prerequisites

### System Requirements
- Python 3.8+
- Node.js 16+
- 4GB+ RAM available
- Backend server running on port 4000

### Installation

1. **Install Python dependencies**:
```bash
pip install -r requirements.txt
```

2. **Verify Taurus installation**:
```bash
bzt --version
```

3. **Start the backend server**:
```bash
cd backend
npm install
npm start
```

4. **Verify backend is running**:
```bash
curl http://localhost:4000/health
```

## Running Tests Locally

### Quick Start
```bash
# Run all stress tests
python3 run-stress-test.py
```

### Manual Taurus Execution
```bash
# Run with default configuration
bzt stress-test.yml

# Run with custom report name
bzt stress-test.yml -o modules.blazemeter.report-name=my-test

# Run specific scenario only
bzt stress-test.yml -o execution[0].scenario=concurrent-bets
```

### Individual Scenario Testing
```bash
# Test only concurrent bets
bzt stress-test.yml -o execution=[{concurrency:500,ramp-up:60s,hold-for:2m,scenario:concurrent-bets}]

# Test only market resolution
bzt stress-test.yml -o execution=[{concurrency:50,ramp-up:10s,hold-for:1m,scenario:market-resolution}]

# Test only WebSocket connections
bzt stress-test.yml -o execution=[{concurrency:1000,ramp-up:30s,hold-for:3m,scenario:websocket-connections}]
```

## Interpreting Results

### Key Metrics

#### Throughput
- **Definition**: Requests per second (RPS) the system can handle
- **Target**: Maintain stable RPS throughout test duration
- **Red Flag**: Declining RPS indicates saturation

#### p95 Latency
- **Definition**: 95% of requests complete within this time
- **Target**: < 2000ms for all endpoints
- **Target (Resolution)**: < 5000ms for market resolution
- **Red Flag**: p95 > 2s indicates performance degradation

#### Error Rate
- **Definition**: Percentage of failed requests (4xx, 5xx)
- **Target**: < 1% across all scenarios
- **Red Flag**: > 1% indicates system instability

#### Concurrent Users
- **Definition**: Maximum simultaneous active users
- **Target**: 500 for bets, 1000 for WebSocket
- **Red Flag**: Connection failures or timeouts

### Report Files

After running tests, check `stress-test-results/[timestamp]/`:
- `kpi.jtl`: Raw performance data (CSV format)
- `error.jtl`: Error logs and stack traces
- `bzt.log`: Taurus execution log
- HTML reports: Visual dashboards (if configured)

### Reading Console Output

```
Cumulative stats:
Label                    Samples  Avg      Min      Max      p50      p90      p95      p99      Errors   Throughput
place-bet                500      145ms    89ms     2341ms   132ms    198ms    287ms    1234ms   0.2%     8.3/s
resolve-market           50       892ms    234ms    4567ms   765ms    1234ms   2345ms   3456ms   0.0%     0.8/s
```

**What to look for**:
- `Avg`: Average response time (lower is better)
- `p95`: 95th percentile (must be < 2000ms)
- `Errors`: Error percentage (must be < 1%)
- `Throughput`: Requests/second (higher is better)

## CI/CD Integration

### GitHub Actions Workflow

The stress test runs automatically on PRs to `main` branch:

```yaml
# .github/workflows/stress-test.yml
name: Stress Test
on:
  pull_request:
    branches: [main]
jobs:
  stress-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.10'
      - name: Install dependencies
        run: pip install -r requirements.txt
      - name: Start backend
        run: |
          cd backend
          npm install
          npm start &
          sleep 10
      - name: Run stress tests
        run: python3 run-stress-test.py
      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: stress-test-results
          path: stress-test-results/
```

### Pass/Fail Criteria

Tests automatically fail if:
- Average response time > 2000ms for 10+ seconds
- p95 latency > 2000ms
- Error rate > 1% for 10+ seconds
- Market resolution p95 > 5000ms

## Common Bottlenecks & Fixes

### 1. Database Connection Pool Exhaustion
**Symptom**: Increasing latency, connection timeout errors

**Fix**:
```javascript
// backend/src/db.js
const pool = new Pool({
  max: 50,  // Increase from default 10
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
```

### 2. Unindexed Database Queries
**Symptom**: Slow query performance under load

**Fix**:
```sql
-- Add indexes on frequently queried columns
CREATE INDEX idx_markets_resolved ON markets(resolved);
CREATE INDEX idx_bets_market_id ON bets(market_id);
CREATE INDEX idx_bets_wallet ON bets(wallet_address);
```

### 3. Synchronous I/O Blocking
**Symptom**: Low throughput despite low CPU usage

**Fix**:
```javascript
// Use async/await properly, avoid blocking operations
// Bad: Synchronous file operations
// Good: Async database queries with connection pooling
```

### 4. Memory Leaks
**Symptom**: Increasing memory usage, eventual crashes

**Fix**:
```javascript
// Ensure proper cleanup of event listeners
// Use connection pooling instead of creating new connections
// Implement request timeouts
```

### 5. Insufficient Server Resources
**Symptom**: High CPU/memory usage, system slowdown

**Fix**:
- Scale horizontally: Add more server instances
- Scale vertically: Increase CPU/RAM allocation
- Implement caching layer (Redis)
- Use CDN for static assets

### 6. Rate Limiting Issues
**Symptom**: 429 errors, throttled requests

**Fix**:
```javascript
// Implement proper rate limiting with Redis
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 100,  // 100 requests per minute
  standardHeaders: true,
});
```

## Troubleshooting

### Backend Not Starting
```bash
# Check if port 4000 is already in use
lsof -i :4000

# Kill existing process
kill -9 <PID>

# Restart backend
cd backend && npm start
```

### Taurus Installation Issues
```bash
# Install with pip
pip install bzt

# Or use pipx for isolated installation
pipx install bzt

# Verify installation
bzt --version
```

### Test Failures
1. Check backend logs for errors
2. Verify database is running and accessible
3. Ensure sufficient system resources
4. Review `stress-test-results/*/error.jtl` for details

### Low Throughput
1. Increase backend server resources
2. Optimize database queries
3. Add database indexes
4. Implement caching
5. Use connection pooling

## Performance Baselines

### Expected Results (Baseline Hardware)
- **Concurrent Bets**: 8-10 RPS, p95 < 500ms
- **Market Resolution**: 0.8-1.0 RPS, p95 < 3000ms
- **WebSocket**: 1000 concurrent connections, 99.9% success

### Hardware Specs (Baseline)
- CPU: 4 cores @ 2.5GHz
- RAM: 8GB
- Disk: SSD
- Network: 100Mbps

## Advanced Configuration

### Custom Load Profiles
Edit `stress-test.yml` to adjust:
- `concurrency`: Number of concurrent users
- `ramp-up`: Time to reach peak load
- `hold-for`: Duration at peak load
- `iterations`: Number of times to repeat scenario

### Environment Variables
```bash
# Set custom backend URL
export BACKEND_URL=http://localhost:4000

# Set custom test duration
export TEST_DURATION=5m

# Run tests
bzt stress-test.yml
```

## Best Practices

1. **Run tests in isolated environment**: Avoid running on production
2. **Monitor system resources**: Use `htop`, `iostat` during tests
3. **Baseline before changes**: Run tests before and after code changes
4. **Gradual load increase**: Use ramp-up to simulate realistic traffic
5. **Test regularly**: Include in CI/CD pipeline
6. **Document results**: Track performance trends over time

## Security Considerations

- Tests use synthetic data only
- No real user credentials or wallets
- Isolated test environment recommended
- Rate limiting should be disabled for stress tests
- Clean up test data after completion

## Support

For issues or questions:
1. Check `bzt.log` in results directory
2. Review backend logs
3. Consult Taurus documentation: https://gettaurus.org/docs/
4. Open an issue in the repository

## License

Same as main project license.
