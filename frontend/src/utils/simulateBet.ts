/**
 * simulateBet.ts
 *
 * Pure utilities for parsing Soroban simulateTransaction RPC responses
 * into human-readable payout and fee values.
 *
 * Why pure functions?
 *   Keeping parsing logic free of React/SDK side-effects makes it trivially
 *   unit-testable at 95%+ coverage without mocking the network.
 *
 * Soroban simulateTransaction response shape (SDK v11):
 * {
 *   result?: { retval: xdr.ScVal }   // present on success
 *   error?: string                   // present on failure
 *   minResourceFee: string           // stroops, always present
 *   cost: { cpuInsns: string, memBytes: string }
 * }
 *
 * The contract's place_bet returns void (no retval), so payout is derived
 * from the formula rather than the XDR return value.
 * Network fee comes directly from minResourceFee (in stroops → XLM).
 */

/** 1 XLM = 10_000_000 stroops */
export const STROOPS_PER_XLM = 10_000_000;

/** Platform fee deducted from payouts (3%) */
export const PLATFORM_FEE_RATE = 0.03;

export interface SimulationResult {
  /** Projected payout in XLM if the chosen outcome wins */
  estimatedPayout: number;
  /** Soroban network fee in XLM (from minResourceFee) */
  networkFeeXlm: number;
  /** True if the simulation succeeded */
  success: boolean;
  /** Error message if simulation failed */
  error: string | null;
  /** Ledger sequence number at time of simulation — used for staleness detection */
  ledgerSequence: number | null;
}

/**
 * Parse the raw Soroban RPC simulateTransaction response.
 *
 * @param response        - Raw object from SorobanRpc.Server.simulateTransaction
 * @param stakeAmount     - User's intended stake in XLM
 * @param poolForOutcome  - Current pool for the chosen outcome in XLM
 * @param totalPool       - Total pool across all outcomes in XLM
 */
export function parseSimulationResponse(
  response: Record<string, any>,
  stakeAmount: number,
  poolForOutcome: number,
  totalPool: number
): SimulationResult {
  // Guard: invalid pool state
  if (totalPool <= 0 || stakeAmount <= 0) {
    return {
      estimatedPayout: 0,
      networkFeeXlm: 0,
      success: false,
      error: "Invalid pool or stake amount",
      ledgerSequence: null,
    };
  }

  // Check for simulation-level error
  if (response?.error) {
    return {
      estimatedPayout: 0,
      networkFeeXlm: 0,
      success: false,
      error: String(response.error),
      ledgerSequence: null,
    };
  }

  // Parse network fee from minResourceFee (stroops → XLM)
  // minResourceFee is a string in the SDK response
  const feeStroops = parseInt(String(response?.minResourceFee ?? "0"), 10);
  const networkFeeXlm = isFinite(feeStroops) ? feeStroops / STROOPS_PER_XLM : 0;

  // Extract ledger sequence for staleness detection
  // SDK v11 exposes this on the response object as latestLedger
  const ledgerSequence =
    typeof response?.latestLedger === "number" ? response.latestLedger : null;

  // Derive estimated payout using the same formula as the contract:
  //   share = stakeAmount / (poolForOutcome + stakeAmount)
  //   payout = share * totalPool * (1 - PLATFORM_FEE_RATE)
  //
  // Note: place_bet returns void, so we compute payout client-side from
  // current pool state. This matches the on-chain calculation exactly.
  const share = stakeAmount / (poolForOutcome + stakeAmount);
  const estimatedPayout = share * totalPool * (1 - PLATFORM_FEE_RATE);

  return {
    estimatedPayout: Math.max(0, estimatedPayout),
    networkFeeXlm,
    success: true,
    error: null,
    ledgerSequence,
  };
}

/**
 * Determine whether a cached simulation result is stale.
 *
 * A simulation becomes stale when the ledger has advanced beyond the
 * sequence captured at simulation time. On Stellar, a new ledger closes
 * roughly every 5 seconds. Pool odds can shift with each new bet, so we
 * treat a result as stale after STALE_LEDGER_THRESHOLD ledgers have passed.
 *
 * If the user is still typing (within the debounce window), the UI shows
 * the last known result with a "Refreshing…" indicator rather than clearing
 * the display entirely — avoiding jarring blank states.
 *
 * @param simulatedAtLedger  - Ledger sequence when simulation was run
 * @param currentLedger      - Current ledger sequence from the RPC
 * @param threshold          - Max ledger delta before result is considered stale (default 3)
 */
export const STALE_LEDGER_THRESHOLD = 3;

export function isSimulationStale(
  simulatedAtLedger: number | null,
  currentLedger: number | null,
  threshold = STALE_LEDGER_THRESHOLD
): boolean {
  if (simulatedAtLedger === null || currentLedger === null) return false;
  return currentLedger - simulatedAtLedger > threshold;
}

/**
 * Format a XLM amount for display (up to 4 decimal places, no trailing zeros).
 */
export function formatXlm(amount: number): string {
  if (!isFinite(amount) || amount < 0) return "0 XLM";
  return `${parseFloat(amount.toFixed(4))} XLM`;
}
