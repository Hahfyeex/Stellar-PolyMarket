/**
 * contractErrors.ts
 *
 * Maps Soroban contract error codes to user-friendly messages.
 *
 * How to add a new error code:
 *   1. Add an entry to CONTRACT_ERROR_MAP with the exact error code string
 *      as the key (match what the Soroban SDK surfaces in error.message).
 *   2. Provide a short `title` (shown as heading) and a `message` (shown as
 *      body text — explain what happened and what the user can do).
 *   3. Optionally set `retryable: false` to hide the Retry button for errors
 *      that cannot be resolved by retrying (e.g. market already resolved).
 *
 * Error code sources:
 *   - Soroban SDK throws errors with codes like "Error(Contract, #1)"
 *   - Horizon submission errors include result_codes like "op_no_trust"
 *   - Freighter rejection surfaces as "User declined access"
 */

export interface ContractErrorInfo {
  /** Short heading shown in the fallback UI */
  title: string;
  /** Full explanation shown below the heading */
  message: string;
  /** Whether the Retry button should be shown (default true) */
  retryable?: boolean;
}

export const CONTRACT_ERROR_MAP: Record<string, ContractErrorInfo> = {
  // ── Soroban contract error codes ──────────────────────────────────────────

  /** Contract error #1: market has already been resolved */
  "Error(Contract, #1)": {
    title: "Market Already Resolved",
    message: "This market has already been resolved and is no longer accepting bets.",
    retryable: false,
  },

  /** Contract error #2: bet amount is below the minimum allowed */
  "Error(Contract, #2)": {
    title: "Bet Too Small",
    message: "Your bet amount is below the minimum required. Please increase your stake and try again.",
  },

  /** Contract error #3: market end date has passed */
  "Error(Contract, #3)": {
    title: "Market Expired",
    message: "The betting window for this market has closed. No more bets can be placed.",
    retryable: false,
  },

  /** Contract error #4: caller is not authorised for this operation */
  "Error(Contract, #4)": {
    title: "Not Authorised",
    message: "Your wallet is not authorised to perform this action on this contract.",
    retryable: false,
  },

  /** Contract error #5: insufficient token balance to cover the bet */
  "Error(Contract, #5)": {
    title: "Insufficient Balance",
    message: "You don't have enough tokens to place this bet. Please top up your wallet and try again.",
  },

  /** Contract error #6: outcome index is out of range */
  "Error(Contract, #6)": {
    title: "Invalid Outcome",
    message: "The selected outcome does not exist for this market. Please refresh and try again.",
  },

  /** Contract error #7: market is paused by the DAO */
  "Error(Contract, #7)": {
    title: "Market Paused",
    message: "This market has been temporarily paused by the Stellar Council. Check back later.",
    retryable: false,
  },

  // ── Horizon / network error codes ─────────────────────────────────────────

  /** Trustline missing for the required asset */
  "op_no_trust": {
    title: "Trustline Required",
    message: "Your wallet hasn't trusted the required asset yet. Set up a trustline and try again.",
  },

  /** Account does not exist on the network (unfunded) */
  "op_no_account": {
    title: "Account Not Found",
    message: "Your Stellar account doesn't exist on the network yet. Fund it with at least 1 XLM to activate it.",
    retryable: false,
  },

  /** Transaction fee too low — network congestion */
  "tx_insufficient_fee": {
    title: "Fee Too Low",
    message: "The network is congested and your transaction fee was too low. Please retry — the fee will be adjusted automatically.",
  },

  // ── Freighter wallet errors ────────────────────────────────────────────────

  /** User rejected the transaction in Freighter */
  "User declined access": {
    title: "Transaction Rejected",
    message: "You declined the transaction in your Freighter wallet. Click Retry if you'd like to try again.",
  },

  /** Freighter extension not installed */
  "Freighter wallet not installed": {
    title: "Wallet Not Found",
    message: "Freighter wallet is not installed. Install it from freighter.app and refresh the page.",
    retryable: false,
  },
};

/** Fallback used when no specific mapping is found */
export const DEFAULT_CONTRACT_ERROR: ContractErrorInfo = {
  title: "Contract Error",
  message: "Something went wrong with the contract call. Please try again or contact support if the issue persists.",
};

/**
 * Look up a user-friendly error info object for a given error.
 * Checks error.message against CONTRACT_ERROR_MAP keys (substring match).
 */
export function mapContractError(error: Error): ContractErrorInfo {
  for (const [code, info] of Object.entries(CONTRACT_ERROR_MAP)) {
    if (error.message?.includes(code)) return info;
  }
  return DEFAULT_CONTRACT_ERROR;
}
