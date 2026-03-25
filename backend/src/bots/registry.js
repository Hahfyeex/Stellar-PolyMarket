"use strict";

const SeedLiquidityBot = require("./SeedLiquidityBot");
const DepthGuardBot = require("./DepthGuardBot");
const logger = require("../utils/logger");

/**
 * Bot registry — instantiates and registers all active bot strategies.
 *
 * Adding a new strategy:
 *   1. Create a class extending BotStrategy in its own file.
 *   2. Import it here and push a new instance into the `bots` array.
 *   3. No other changes needed — the constructor calls register() automatically.
 *
 * Risk parameters are read from environment variables so they can be tuned
 * per deployment without code changes.
 */
const bots = [
  new SeedLiquidityBot({
    stakePerOutcome: Number(process.env.SEED_BOT_STAKE) || 10,
    walletAddress: process.env.SEED_BOT_WALLET || "BOT_SEED_WALLET",
  }),
  new DepthGuardBot({
    minPoolThreshold: Number(process.env.DEPTH_BOT_THRESHOLD) || 50,
    topUpAmount: Number(process.env.DEPTH_BOT_TOPUP) || 20,
    walletAddress: process.env.DEPTH_BOT_WALLET || "BOT_DEPTH_WALLET",
  }),
];

logger.info({ count: bots.length, names: bots.map((b) => b.name) }, "Bot registry initialised");

module.exports = bots;
