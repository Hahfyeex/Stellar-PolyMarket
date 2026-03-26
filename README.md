# Stella Polymarket

> A decentralized prediction market built on the Stellar blockchain

---

## 🏗️ Monorepo Layout

Root workspace now uses npm workspaces and shares constants through `constants/`.

- `contracts/` - Soroban smart contract Rust code
- `frontend/` - Next.js frontend
- `backend/` - Node.js API server
- `oracle/` - Oracle connectors
- `constants/` - shared TypeScript constants / config


![Stellar](https://img.shields.io/badge/Stellar-XLM-blue?logo=stellar)
![Soroban](https://img.shields.io/badge/Smart%20Contracts-Soroban-purple)
![License](https://img.shields.io/badge/license-MIT-green)

---

## 🧠 Overview

Stella Polymarket is a decentralized prediction market platform where users forecast real-world events and earn rewards using Stellar (XLM) or custom tokens.

It combines:
- ⚡ Stellar's fast, low-cost transactions
- 🧩 Smart contracts via Soroban
- 📊 Real-time data via oracles
- 🌍 Focus on global and African markets

---

## 🤔 Why Stella Polymarket?

Prediction markets are one of the most powerful tools for aggregating collective intelligence — yet most existing platforms are:

- **Expensive** — high gas fees make small stakes impractical
- **Exclusive** — built for crypto-native users in developed markets
- **Opaque** — centralized platforms can manipulate outcomes
- **Slow** — settlement takes days on congested networks

Stella Polymarket fixes this by building on Stellar, a blockchain designed for fast, cheap, and accessible financial transactions.

| Problem | Stella Polymarket Solution |
|--------|---------------------------|
| High fees on Ethereum | Stellar transactions cost fractions of a cent |
| Slow settlement | Stellar confirms in 3–5 seconds |
| Centralized control | Soroban smart contracts — trustless and transparent |
| Inaccessible to emerging markets | Built with Africa and global south in mind |
| Complex UX | Simple wallet connect + one-click betting |

Whether you're a casual user predicting football results or a serious forecaster tracking macroeconomic trends, Stella Polymarket gives you a fair, fast, and transparent arena to put your knowledge to work.

---

## 🎯 Core Idea

Users stake tokens on outcomes of real-world events.

- Correct prediction → earn rewards
- Wrong prediction → lose stake

---

## 🔮 Example Markets

| Market | Type |
|--------|------|
| Will Bitcoin reach $100k before 2027? | Binary |
| Will Nigeria inflation drop below 15% this year? | Binary |
| Will Arsenal win the Premier League? | Binary |
| Will AI replace 30% of jobs by 2030? | Binary |

---

## ⚙️ How It Works

1. **Market Creation** — Anyone can create a market with automated validation (permissionless)
2. **User Participation** — Users connect their Stellar wallet and stake XLM or tokens on an outcome
3. **Fund Locking** — Funds are locked in Soroban smart contracts (transparent + tamper-proof)
4. **Oracle Resolution** — External data source confirms the result (sports API, financial feed, etc.)
5. **Payout Distribution** — Winners share the pool proportionally; platform takes a small fee

### Permissionless Market Creation

Markets are created instantly without admin approval through automated validation:
- **Description**: Minimum 50 characters for context
- **Outcomes**: 2-5 options (binary or multi-choice)
- **End Date**: Must be future date within 1 year
- **No Duplicates**: Unique questions only
- **Rate Limit**: 3 markets per wallet per 24 hours
- **Creation Fee**: Configurable fee (default 0) charged in the market's token — burned or sent to DAO treasury

See [Permissionless Launch Guide](PERMISSIONLESS_LAUNCH_README.md) for details.
See [Creation Fee & DAO Governance](contracts/prediction_market/CREATION_FEE_README.md) for fee configuration.

---

## 🏗️ System Architecture

```
Client (Web/App)
    ↓
API Layer (Node.js / Express)
    ↓
Stellar Network (Soroban Smart Contracts)
    ↓
Database (PostgreSQL / MongoDB)
    ↓
Oracle Services (External APIs)
    ↓
Response → UI Dashboard
```

---

## 💡 Key Features

- 📊 **Prediction Markets** — Binary (Yes/No) and multiple choice
- 💰 **Tokenized Staking** — XLM or custom Stellar assets, optional liquidity pools
- 🧾 **On-chain Transparency** — All bets recorded on-chain, publicly verifiable
- 🧠 **AI Insights (Optional)** — Predictive suggestions and trend analysis
- 🏆 **Gamification** — Leaderboards, reputation scores, NFT badges (future)

---

## 🔐 Smart Contract Logic

```rust
// Simplified Soroban contract flow

create_market(question, end_date, outcomes)
place_bet(market_id, outcome, amount)
lock_funds(market_id, user, amount)
resolve_market(market_id, winning_outcome)  // oracle-triggered
distribute_rewards(market_id)
```

---

## 🪙 Token Model (Optional)

**STELLA Token** — used for:
- Governance voting
- Fee discounts
- Rewards distribution

---

## ⚖️ Dispute Voting & Governance

Oracles can sometimes be wrong. The dispute voting mechanism gives the community a way to challenge incorrect resolutions and protect users.

**Dispute Flow:**
1. **Open Dispute:** Any token holder can open a dispute within 24 hours of market resolution. This pauses all payout distributions.
2. **Weighted Voting:** For the next 24 hours, users can cast votes (Support or Reject). Voting power is strictly weighted 1:1 by the user's STELLA token balance at the time of voting.
3. **Threshold Check:** If the 'Support' votes cross the 60% threshold (`support_votes / total_votes > 0.6`), the market immediately enters a `ReReview` state.
4. **Resolution:** After the deadline, the dispute is closed, and the final outcome is determined based on the vote results or admin review if in `ReReview`.

---

## 🧰 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React / Next.js, Tailwind CSS, Freighter Wallet |
| Backend | Node.js / Express |
| Database | PostgreSQL / MongoDB |
| Blockchain | Stellar Network, Soroban Smart Contracts |
| Oracles | Chainlink / Custom APIs |

---

## 🎨 UI Sections

- Landing Page (hero + live stats)
- Market Dashboard
- Market Detail Page
- Wallet + Portfolio
- Leaderboard

---

## 📦 Example Use Case

```
User predicts: "NGN will strengthen vs USD"
Stakes: 50 XLM
Market closes → Oracle confirms result
User wins → receives 120 XLM
```

---

## 🚀 Unique Selling Points

- 🌍 Built for global and African markets
- ⚡ Ultra-low fees (Stellar advantage)
- 📱 Mobile-friendly prediction platform
- 🔗 Transparent and trustless system

---

## 🔥 Future Enhancements

- DAO governance
- Social prediction feeds
- Copy trading (follow top predictors)
- Cross-chain support
- Mobile app

---

## 📁 Project Structure

```
stella-polymarket/
├── frontend/          # Next.js + Tailwind UI
├── backend/           # Node.js API server
├── contracts/         # Soroban smart contracts (Rust)
├── oracle/            # Oracle integration services
└── docs/              # Architecture diagrams + specs
```

---

## 🛠️ Getting Started

### Local Blockchain Environment (Docker)
To test smart contracts locally without spending real Testnet XLM, you can spin up a standalone Stellar network with the Soroban RPC enabled:

```bash
docker compose up -d
```
### Application Setup
```bash
# Clone the repo
git clone https://github.com/your-username/stella-polymarket.git
cd stella-polymarket

# Install frontend deps
cd frontend && npm install

# Install backend deps
cd ../backend && npm install

# Run locally
npm run dev
```

> Smart contract deployment requires the [Soroban CLI](https://soroban.stellar.org/docs/getting-started/setup).

---

## 🧪 Performance & Load Testing

Stella Polymarket includes comprehensive stress testing to ensure platform stability under peak load.

### Quick Start
```bash
# Install test dependencies
pip install -r requirements.txt

# Start backend server
cd backend && npm start

# Run stress tests
python3 run-stress-test.py
```

### Test Coverage
- **500 concurrent users** placing bets simultaneously
- **50 simultaneous market resolutions** under load
- **1000 concurrent WebSocket connections** for real-time updates

### Performance Targets
- p95 latency < 2000ms
- Error rate < 1%
- Throughput > 8 requests/second

### Documentation
- 📖 [Full Testing Guide](STRESS_TEST_README.md)
- 🔍 [Bottleneck Analysis](STRESS_TEST_BOTTLENECKS.md)
- ⚡ [Quick Reference](STRESS_TEST_QUICK_REFERENCE.md)

### CI/CD Integration
Stress tests run automatically on every PR to `main` branch via GitHub Actions. Tests must pass before merge.

---

## 📄 License

MIT © Stella Polymarket
