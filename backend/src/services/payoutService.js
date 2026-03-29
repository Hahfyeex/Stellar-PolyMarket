"use strict";

const db = require("../db");
const redis = require("../utils/redis");
const logger = require("../utils/logger");
const { triggerNotification } = require("../utils/notifications");

/**
 * Executes the payout distribution logic for a given market.
 * @param {string|number} marketId
 * @returns {Promise<{ payouts: Array<{wallet: string, payout: string}>, winnersCount: number, totalDistributed: number, totalPool: number, winningStake: number }>}
 */
async function distributePayouts(marketId) {
  const marketResult = await db.query("SELECT * FROM markets WHERE id = $1 AND resolved = TRUE", [
    marketId,
  ]);
  
  if (!marketResult.rows.length) {
    throw new Error("Market not found or not resolved");
  }

  const { winning_outcome, total_pool } = marketResult.rows[0];

  const winners = await db.query(
    "SELECT * FROM bets WHERE market_id = $1 AND outcome_index = $2 AND paid_out = FALSE",
    [marketId, winning_outcome]
  );

  const totalPoolStroops = BigInt(Math.floor(parseFloat(total_pool) * 1e7));

  const winningStakeStroops = winners.rows.reduce((sum, b) => {
    return sum + BigInt(Math.floor(parseFloat(b.amount) * 1e7));
  }, 0n);

  if (winningStakeStroops === 0n) {
    return { payouts: [], winnersCount: 0, totalDistributed: 0, totalPool: parseFloat(total_pool), winningStake: 0 };
  }

  const payoutPoolStroops = (totalPoolStroops * 97n) / 100n;

  const payouts = winners.rows.map((bet) => {
    const betAmountStroops = BigInt(Math.floor(parseFloat(bet.amount) * 1e7));
    const payoutStroops = (betAmountStroops * payoutPoolStroops) / winningStakeStroops;
    const payoutXlm = Number(payoutStroops) / 1e7;
    return { wallet: bet.wallet_address, payout: payoutXlm.toFixed(7) };
  });

  let totalPayoutStroops = 0n;
  for (const payout of payouts) {
    const payoutStroops = BigInt(Math.round(parseFloat(payout.payout) * 10_000_000));
    totalPayoutStroops += payoutStroops;
  }

  if (totalPayoutStroops > payoutPoolStroops) {
    logger.error(
      {
        market_id: marketId,
        total_payout_stroops: totalPayoutStroops.toString(),
        payout_pool_stroops: payoutPoolStroops.toString(),
      },
      "Payout sum exceeds pool"
    );
    throw new Error("Payout calculation error: sum exceeds pool");
  }

  // Mark bets as paid
  await db.query("UPDATE bets SET paid_out = TRUE WHERE market_id = $1 AND outcome_index = $2", [
    marketId,
    winning_outcome,
  ]);

  logger.info(
    {
      market_id: marketId,
      winning_outcome,
      winners_count: winners.rows.length,
      total_pool,
      winning_stake: Number(winningStakeStroops) / 1e7,
    },
    "Payouts distributed"
  );

  // Trigger notifications for winners
  for (const w of winners.rows) {
    await triggerNotification(
      w.wallet_address,
      "PAYOUT_DISTRIBUTED",
      `Your payout for market ${marketId} has been distributed. You received ${payouts.find(p => p.wallet === w.wallet_address)?.payout} XLM.`,
      marketId
    );
  }

  if (winners.rows.length > 0) {
    const winnerAddresses = new Set(winners.rows.map((w) => w.wallet_address));
    const invalidationPromises = Array.from(winnerAddresses).map((addr) =>
      redis.del(`portfolio:${addr}`)
    );
    await Promise.all(invalidationPromises);
    logger.info(
      { market_id: marketId, winners_count: winnerAddresses.size },
      "[Cache] Invalidated portfolio cache for winners"
    );
  }

  return {
    payouts,
    winnersCount: winners.rows.length,
    totalDistributed: Number(totalPayoutStroops) / 1e7,
    totalPool: parseFloat(total_pool),
    winningStake: Number(winningStakeStroops) / 1e7
  };
}

module.exports = { distributePayouts };
