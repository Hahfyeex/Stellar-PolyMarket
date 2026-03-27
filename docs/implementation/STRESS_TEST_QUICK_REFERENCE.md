# Stress Test Quick Reference

Quick commands and troubleshooting for Stellar PolyMarket stress testing.

## Quick Start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Start backend
cd backend && npm start

# 3. Run stress tests
python3 run-stress-test.py
```

## Common Commands

### Run Tests
```bash
# Full test suite
bzt stress-test.yml

# Specific scenario only
bzt stress-test.yml -o execution=[{concurrency:500,scenario:concurrent-bets}]

# With custom duration
bzt stress-test.yml -o execution[0].hold-for=5m

# Quiet mode (less output)
bzt stress-test.yml -q
```

### Check Backend
```bash
# Health check
curl http://localhost:4000/health

# Check if running
lsof -i :4000

# View logs
cd backend && npm run dev
```

### Analyze Results
```bash
# Find latest results
ls -lt stress-test-results/

# View error log
cat stress-test-results/*/error.jtl

# Count total requests
wc -l stress-test-results/*/kpi.jtl

# Calculate error rate
grep -c "false" stress-test-results/*/kpi.jtl
```

## Performance Thresholds

| Metric | Threshold | Command to Check |
|--------|-----------|------------------|
| p95 Latency | < 2000ms | Check kpi.jtl p95 column |
| Error Rate | < 1% | `grep -c "false" kpi.jtl` |
| Throughput | > 8 RPS | Check console output |
| Resolution p95 | < 5000ms | Filter by label |

## Troubleshooting

### Backend Won't Start
```bash
# Kill existing process
pkill -f "node.*backend"

# Check port availability
lsof -i :4000

# Restart
cd backend && npm start
```

### Taurus Not Found
```bash
# Install
pip install bzt

# Verify
bzt --version

# Alternative: use pipx
pipx install bzt
```

### Connection Errors
```bash
# Check database
docker ps | grep postgres

# Check backend health
curl -v http://localhost:4000/health

# Check logs
tail -f backend/*.log
```

### High Error Rate
1. Check backend logs for errors
2. Verify database is running
3. Reduce concurrency: `-o execution[0].concurrency=100`
4. Increase ramp-up: `-o execution[0].ramp-up=120s`

### Low Throughput
1. Check system resources: `htop`
2. Monitor database: `pg_stat_activity`
3. Review bottleneck analysis: `STRESS_TEST_BOTTLENECKS.md`
4. Implement recommended fixes

## CI/CD Integration

### GitHub Actions
```yaml
# Trigger manually
gh workflow run stress-test.yml

# View results
gh run list --workflow=stress-test.yml

# Download artifacts
gh run download <run-id>
```

### Local CI Simulation
```bash
# Run with CI environment
CI=true python3 run-stress-test.py

# Check exit code
echo $?  # 0 = pass, 1 = fail
```

## Key Files

| File | Purpose |
|------|---------|
| `stress-test.yml` | Taurus configuration |
| `run-stress-test.py` | Test runner script |
| `STRESS_TEST_README.md` | Full documentation |
| `STRESS_TEST_BOTTLENECKS.md` | Performance fixes |
| `stress-test-results/` | Test output directory |

## Metrics Interpretation

### Console Output
```
Label: place-bet
Samples: 500
Avg: 145ms      ← Average response time
p95: 287ms      ← 95th percentile (KEY METRIC)
Errors: 0.2%    ← Error rate (must be < 1%)
Throughput: 8.3/s  ← Requests per second
```

### What's Good?
- ✅ p95 < 2000ms
- ✅ Error rate < 1%
- ✅ Throughput stable throughout test
- ✅ No connection errors

### What's Bad?
- ❌ p95 > 2000ms
- ❌ Error rate > 1%
- ❌ Declining throughput
- ❌ Connection timeouts

## Emergency Fixes

### Quick Performance Boost
```javascript
// backend/src/db.js
const pool = new Pool({
  max: 50,  // Increase from 10
  idleTimeoutMillis: 30000
});
```

### Quick Rate Limiting
```javascript
// backend/src/index.js
const rateLimit = require('express-rate-limit');
app.use(rateLimit({ windowMs: 60000, max: 100 }));
```

### Quick Caching
```javascript
// backend/src/routes/markets.js
const cache = {};
router.get("/", (req, res) => {
  if (cache.markets && Date.now() - cache.time < 30000) {
    return res.json(cache.markets);
  }
  // ... fetch from DB
  cache.markets = result;
  cache.time = Date.now();
});
```

## Support

- Full docs: `STRESS_TEST_README.md`
- Bottlenecks: `STRESS_TEST_BOTTLENECKS.md`
- Taurus docs: https://gettaurus.org/docs/
- Issues: Open GitHub issue with test results

## Cheat Sheet

```bash
# Complete workflow
pip install -r requirements.txt
cd backend && npm start &
sleep 5
python3 run-stress-test.py
ls -lt stress-test-results/

# Quick validation
curl http://localhost:4000/health && bzt stress-test.yml -q

# CI check
bzt stress-test.yml && echo "✅ PASSED" || echo "❌ FAILED"
```
