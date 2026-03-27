# Oracle Medianizer

Multi-feed price aggregator with outlier detection. Replaces single-source oracle lookups with a manipulation-resistant median across 3+ independent sources.

## How It Works

1. All fetcher functions are called in **parallel** via `Promise.allSettled`
2. Failed or non-finite results are discarded
3. Minimum **3 valid sources** required — throws if fewer survive
4. **Outlier filter**: compute mean + std dev; discard values where `|value − mean| > 2 × stdDev`
5. Minimum 3 sources must survive filtering — throws otherwise
6. **Median** computed on the filtered, sorted set:
   - Odd count → middle element
   - Even count → average of two middle elements
7. All source values, discarded outliers, and final median are **logged** for every resolution

## Supported Oracle Sources (BTC/USD)

| Source | File | Endpoint |
|--------|------|----------|
| CoinGecko | `sources.js` | `api.coingecko.com` |
| Binance | `sources.js` | `api.binance.com` |
| Coinbase | `sources.js` | `api.coinbase.com` |
| Kraken | `sources.js` | `api.kraken.com` |

## Adding a New Source

1. Write an async function in `oracle/sources.js` that returns a finite `number`:
   ```js
   async function fetchMySource() {
     const { data } = await axios.get("https://my-api.com/price", { timeout: 5000 });
     return parseFloat(data.price);
   }
   ```
2. Add it to the `btcSources` array at the bottom of `sources.js`:
   ```js
   const btcSources = [fetchCoinGecko, fetchBinance, fetchCoinbase, fetchKraken, fetchMySource];
   ```
3. No other changes needed — the medianizer picks it up automatically.

## Running Tests

```bash
cd oracle
npm install
npm test
```

Coverage target: >90% (currently ~98%).
