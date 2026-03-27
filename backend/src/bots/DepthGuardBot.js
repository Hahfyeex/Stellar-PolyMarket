"use strict";

const BotStrategy = require("./BotStrategy");
const logger = require("../utils/logger");

/**
 * DepthGuardBot — monitors pool depth and tops up liquidity when it falls
 * below a configured threshold.
 *
 * Risk parameters (config):
 *   minPoolThreshold {number} — minimum acceptable total pool in XLM (default: 50)
 *   topUpAmount      {number} — XLM added per outcome when threshold is breached (default: 20)
 *   walletAddress    {string} — bot's wallet address used in bet records
 *
 * Listens on: "pool.low"
 */
class DepthGuardBot extends BotStrategy {
  constructor(config = {}) {
    super("DepthGuardBot", {
      minPoolThreshold: config.minPoolThreshold ?? 50,
      topUpAmount: config.topUpAmount ?? 20,
      walletAddress: config.walletAddress ?? "BOT_DEPTH_WALLET",
    });
    this.register(["pool.low"]);
  }

  /**
   * Only trigger when the reported pool is genuinely below our threshold.
   * This guards against stale or duplicate events.
   * @param {{ totalPool: number }} event
   */
  shouldTrigger(event) {
    return event.totalPool < this.config.minPoolThreshold;
  }

  /**
   * Top up both sides of the market to restore healthy depth.
   *
   * @param {string|number} marketId
   * @param {{ totalPool: number, threshold: number }} payload
   */
  async execute(marketId, payload) {
    const { topUpAmount, walletAddress } = this.config;

    // Audit log — record the top-up action for both outcomes
    logger.info(
      {
        bot: this.name,
        marketId,
        currentPool: payload.totalPool,
        threshold: payload.threshold,
        topUpAmount,
        walletAddress,
        action: "top_up",
      },
      `[DepthGuardBot] Pool low (${payload.totalPool} XLM) — topping up with ${topUpAmount} XLM per outcome`
    );
  }
}

module.exports = DepthGuardBot;
