"use strict";

const BotStrategy = require("./BotStrategy");
const logger = require("../utils/logger");

/**
 * SeedLiquidityBot — places small equal bets on every outcome when a new
 * market is created, ensuring the pool is never empty at launch.
 *
 * Risk parameters (config):
 *   stakePerOutcome {number} — XLM amount staked on each outcome (default: 10)
 *   walletAddress   {string} — bot's wallet address used in bet records
 *
 * Listens on: "market.created"
 */
class SeedLiquidityBot extends BotStrategy {
  constructor(config = {}) {
    super("SeedLiquidityBot", {
      stakePerOutcome: config.stakePerOutcome ?? 10,
      walletAddress: config.walletAddress ?? "BOT_SEED_WALLET",
    });
    this.register(["market.created"]);
  }

  /** Always trigger on every new market. */
  shouldTrigger() {
    return true;
  }

  /**
   * Place one bet per outcome to seed the initial liquidity pool.
   * In production this would call the Soroban contract; here we log the
   * intended actions so the audit trail is complete without a live chain.
   *
   * @param {string|number} marketId
   * @param {{ outcomes: string[] }} payload
   */
  async execute(marketId, payload) {
    const { stakePerOutcome, walletAddress } = this.config;
    const outcomes = payload.outcomes ?? [];

    for (let i = 0; i < outcomes.length; i++) {
      // Audit log — one entry per seeded outcome
      logger.info(
        {
          bot: this.name,
          marketId,
          outcomeIndex: i,
          outcome: outcomes[i],
          amount: stakePerOutcome,
          walletAddress,
          action: "seed_bet",
        },
        `[SeedLiquidityBot] Seeding outcome ${i} with ${stakePerOutcome} XLM`
      );
    }
  }
}

module.exports = SeedLiquidityBot;
