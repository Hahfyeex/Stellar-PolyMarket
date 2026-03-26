# GasSavingsWidget

Dashboard widget that shows users how much they saved by using Stella (Soroban/Stellar) instead of Ethereum.

## Formula

```
saved_usd = eth_cost_usd - stellar_cost_usd

eth_cost_usd     = 21,000 gas_units × eth_gas_gwei × 1e-9 × eth_price_usd
stellar_cost_usd = (100 stroops / 10,000,000) × xlm_price_usd
```

## Ethereum Gas Data Source

Gas prices are fetched from the **[Etherscan Gas Oracle API](https://docs.etherscan.io/api-endpoints/gas-tracker)**:

```
GET https://api.etherscan.io/api?module=gastracker&action=gasoracle&apikey=<KEY>
```

The `ProposeGasPrice` field (standard/average gas price in gwei) is used for the comparison. This is the price a typical user would pay for a standard ETH transfer (21 000 gas units).

Set your key in `.env.local`:

```
NEXT_PUBLIC_ETHERSCAN_API_KEY=your_key_here
```

Without a key the API still works at a lower rate limit (5 req/s free tier).

## XLM & ETH Price Source

Live prices are fetched from **[CoinGecko Simple Price API](https://www.coingecko.com/en/api)** (no key required for basic usage):

```
GET https://api.coingecko.com/api/v3/simple/price?ids=stellar,ethereum&vs_currencies=usd
```

## Usage

```tsx
// Single transaction comparison
<GasSavingsWidget />

// Scale to N transactions (e.g. monthly activity)
<GasSavingsWidget txCount={47} />
```

## Refresh Rate

Data refreshes every **60 seconds** via `setInterval` in `useGasSavings`.

## Max Fee Cap Note

Stellar's base fee is fixed at **100 stroops (0.00001 XLM)** — roughly $0.000003 USD at current prices. There is no dynamic fee cap concern on the savings widget side; the comparison always uses the Stellar network minimum.
