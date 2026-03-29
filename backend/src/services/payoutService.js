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
function parseXlmToStroops(decimalValue) {
  if (decimalValue === null || decimalValue === undefined) {
    throw new Error("Unable to parse zero-float value");
  }

  const value = decimalValue.toString();
  if (!/^\d+(\.\d+)?$/.test(value)) {
    throw new Error(`Invalid numeric value ${value}`);
  }

  const [whole, decimals = ""] = value.split(".");
  const paddedDecimals = (decimals + "0000000").slice(0, 7);

  return BigInt(whole) * 10000000n + BigInt(paddedDecimals);
}

function formatStroopsToXlmString(stroops) {
  const whole = stroops / 10000000n;
  const remainder = stroops % 10000000n;
  return `${whole.toString()}.${remainder.toString().padStart(7, "0")}`;
}

async function distributePayouts(marketId) {
  const marketResult = await db.query("SELECT * FROM markets WHERE id = $1 AND resolved = TRUE", [marketId]);

  if (!marketResult.rows.length) {
    throw new Error("Market not found or not resolved");
  }

  const { winning_outcome, total_pool, fee_rate_bps } = marketResult.rows[0];
  const feeRate = Number.isFinite(Number(fee_rate_bps)) ? Number(fee_rate_bps) : 300;
  if (feeRate < 0 || feeRate > 10000) {
    throw new Error(`Invalid fee_rate_bps ${fee_rate_bps}`);
  }

  const winners = await db.query(
    "SELECT * FROM bets WHERE market_id = $1 AND outcome_index = $2 AND paid_out = FALSE",
    [marketId, winning_outcome]
  );

  const totalPoolStroops = parseXlmToStroops(total_pool);

  const winningStakeStroops = winners.rows.reduce((sum, b) => {
    return sum + parseXlmToStroops(b.amount);
  }, 0n);

  if (winningStakeStroops === 0n) {
    return {
      payouts: [],
      winnersCount: 0,
      totalDistributed: 0,
      totalPool: Number(total_pool),
      winningStake: 0,
    };
  }

  const payoutPoolStroops = (totalPoolStroops * BigInt(10000 - feeRate)) / 10000n;

  const payouts = winners.rows.map((bet) => {
    const betAmountStroops = parseXlmToStroops(bet.amount);
    const payoutStroops = (betAmountStroops * payoutPoolStroops) / winningStakeStroops;
    return {
      wallet: bet.wallet_address,
      payout: formatStroopsToXlmString(payoutStroops),
    };
  });

  let totalPayoutStroops = 0n;
  for (const payout of payouts) {
    const payoutStroops = parseXlmToStroops(payout.payout);
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
