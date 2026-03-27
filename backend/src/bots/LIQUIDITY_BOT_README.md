# Liquidity Bot Hook System

Event-driven architecture for automated market liquidity management. Bots subscribe to platform events and react without polling or tight coupling to route handlers.

## Architecture

```
POST /api/markets  ──► eventBus.emit("market.created")  ──► SeedLiquidityBot
POST /api/bets     ──► eventBus.emit("pool.low")         ──► DepthGuardBot
```

- `eventBus.js` — singleton `EventEmitter` shared across the app
- `BotStrategy.js` — base class; handles registration, kill-switch, error isolation
- `SeedLiquidityBot.js` — seeds initial liquidity on every new market
- `DepthGuardBot.js` — tops up pool when depth falls below threshold
- `registry.js` — instantiates all bots at startup; imported once in `index.js`

## Events

| Event | Emitted from | Payload |
|-------|-------------|---------|
| `market.created` | `POST /api/markets` | `{ marketId, question, outcomes, totalPool }` |
| `pool.low` | `POST /api/bets` | `{ marketId, totalPool, threshold }` |

## Risk Parameters (env vars)

| Variable | Default | Description |
|----------|---------|-------------|
| `SEED_BOT_STAKE` | `10` | XLM staked per outcome on market creation |
| `SEED_BOT_WALLET` | `BOT_SEED_WALLET` | Wallet address for seed bets |
| `DEPTH_BOT_THRESHOLD` | `50` | Minimum pool depth in XLM before top-up |
| `DEPTH_BOT_TOPUP` | `20` | XLM added per outcome when threshold is breached |
| `DEPTH_BOT_WALLET` | `BOT_DEPTH_WALLET` | Wallet address for top-up bets |

## Kill Switch

Each bot instance has an independent `killSwitch` flag. Set it to `true` to stop that instance without affecting any other bot:

```js
const bots = require("./bots/registry");
bots[0].killSwitch = true; // stops SeedLiquidityBot only
```

## Adding a New Strategy

1. Create a file in `backend/src/bots/` extending `BotStrategy`:

```js
const BotStrategy = require("./BotStrategy");

class MyBot extends BotStrategy {
  constructor(config = {}) {
    super("MyBot", { maxStake: config.maxStake ?? 5 });
    this.register(["market.created"]); // subscribe to events
  }
  shouldTrigger(event) { return event.totalPool === 0; }
  async execute(marketId, payload) {
    // your logic here
  }
}
module.exports = MyBot;
```

2. Add an instance to `registry.js`:

```js
const MyBot = require("./MyBot");
const bots = [
  new SeedLiquidityBot(...),
  new DepthGuardBot(...),
  new MyBot({ maxStake: 10 }),  // ← add here
];
```

That's it — no other changes needed.

## Running Tests

```bash
cd backend
npx jest src/tests/bots.test.js --coverage
```
