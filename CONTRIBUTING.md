# Contributing to Stella Polymarket

Thanks for your interest in contributing! Here's everything you need to get started.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How to Contribute](#how-to-contribute)
- [Development Setup](#development-setup)
- [Pull Request Process](#pull-request-process)
- [Commit Convention](#commit-convention)

---

## Code of Conduct

This project follows our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold it.

---

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/Stellar-PolyMarket.git`
3. Create a branch: `git checkout -b feat/your-feature-name`
4. Make your changes
5. Push and open a Pull Request

---

## How to Contribute

### Reporting Bugs
Open an issue using the **Bug Report** template. Include:
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable

### Suggesting Features
Open an issue using the **Feature Request** template. Describe:
- The problem you're solving
- Your proposed solution
- Any alternatives you considered

### Good First Issues
Look for issues tagged `good first issue` — these are beginner-friendly tasks.

---

## Development Setup

### Prerequisites
- Node.js >= 18
- PostgreSQL
- Docker & Docker Compose (for the local Stellar network)
- Rust + Soroban CLI (for smart contracts)

### Local Stellar Network
Before deploying contracts locally, spin up the standalone development network:
```bash
docker compose up -d
```

### Install & Run

```bash
# Backend
cd backend
cp ../.env.example .env   # fill in your values
npm install
npm run dev

# Frontend
cd frontend
npm install
npm run dev

# Oracle
cd oracle
npm install
npm start
```

### Smart Contracts

```bash
# Install Soroban CLI
cargo install --locked soroban-cli

# Build contract
cd contracts/prediction_market
cargo build --target wasm32-unknown-unknown --release

# Run tests
cargo test
```

---

## Pull Request Process

1. Ensure your branch is up to date with `main`
2. Write clear, descriptive commit messages (see below)
3. Update documentation if your change affects behavior
4. Make sure existing tests pass
5. Link the related issue in your PR description

PRs are reviewed within 3–5 business days.

---

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add leaderboard page
fix: correct payout calculation rounding
docs: update getting started guide
chore: bump soroban-sdk to v20.1.0
refactor: simplify oracle resolver logic
```

---

## Questions?

Open a [Discussion](https://github.com/Hahfyeex/Stellar-PolyMarket/discussions) or reach out via Issues.
