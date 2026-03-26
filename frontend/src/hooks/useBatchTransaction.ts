/**
 * useBatchTransaction
 *
 * Bundles multiple Soroban operations into a single Freighter wallet approval
 * using Stellar's TransactionBuilder — one pop-up for N operations.
 *
 * Supported batch flows:
 *   - [placeBet, addTrustline]  — bet on a custom-asset market
 *   - [placeBet, payFee]        — bet with platform fee payment
 *
 * Flow:
 *   1. Build a Stellar Transaction containing all operations via TransactionBuilder
 *   2. Convert to XDR and pass to Freighter signTransaction → single user approval
 *   3. Submit the signed XDR to Horizon (testnet)
 *
 * On failure: the entire transaction is atomic — no partial state is left on-chain.
 *             The error is parsed to identify which operation caused the failure.
 */
import { useState, useCallback } from "react";
// Named imports for tree-shaking — stellar-sdk is large (~500KB); only pull
// what is used so webpack can eliminate the rest.
import {
  TransactionBuilder,
  Networks,
  Operation,
  Asset,
  BASE_FEE,
  xdr,
} from "@stellar/stellar-sdk";
import { QueuedBet } from "../context/BettingSlipContext";

/** Soroban testnet RPC endpoint */
export const SOROBAN_TESTNET_RPC = "https://soroban-testnet.stellar.org";

/** Horizon testnet endpoint for account loading and submission */
export const HORIZON_TESTNET = "https://horizon-testnet.stellar.org";

/** Maps an operation index to a human-readable label for error messages */
const OP_LABELS: Record<string, string> = {
  placeBet: "Place Bet",
  addTrustline: "Add Trustline",
  payFee: "Pay Fee",
};

export interface BatchOperation {
  /** Identifies the operation for error reporting */
  type: "placeBet" | "addTrustline" | "payFee";
  /** Pre-built Stellar SDK Operation XDR string, or a raw Operation object */
  operation: ReturnType<typeof Operation.payment> | ReturnType<typeof Operation.changeTrust> | xdr.Operation;
}

interface UseBatchTransactionResult {
  submitting: boolean;
  error: string | null;
  success: boolean;
  /**
   * Submit a batch of QueuedBets as a single atomic Stellar transaction.
   * Each bet becomes a `payment` operation; trustline ops can be prepended.
   */
  submitBatch: (bets: QueuedBet[], walletAddress: string) => Promise<boolean>;
  /**
   * Lower-level: submit an explicit array of typed operations atomically.
   * Useful for [placeBet + addTrustline] or [placeBet + payFee] flows.
   */
  submitOperations: (ops: BatchOperation[], walletAddress: string) => Promise<boolean>;
}

/**
 * Fetch the Stellar account sequence number from Horizon testnet.
 * Required to build a valid TransactionBuilder.
 */
async function loadAccount(walletAddress: string) {
  const res = await fetch(`${HORIZON_TESTNET}/accounts/${walletAddress}`);
  if (!res.ok) throw new Error(`Failed to load account: ${res.statusText}`);
  const data = await res.json();
  return data;
}

/**
 * Submit a signed XDR transaction envelope to Horizon testnet.
 * Returns the Horizon response JSON.
 */
async function submitToHorizon(signedXdr: string): Promise<any> {
  const body = new URLSearchParams({ tx: signedXdr });
  const res = await fetch(`${HORIZON_TESTNET}/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();
  if (!res.ok) {
    // Horizon returns result_codes when a specific operation fails
    const opCodes: string[] = data?.extras?.result_codes?.operations ?? [];
    throw Object.assign(new Error(data?.extras?.result_codes?.transaction ?? "Transaction failed"), {
      operationCodes: opCodes,
    });
  }
  return data;
}

/**
 * Parse a Horizon error to identify which operation failed.
 * Returns a user-friendly message naming the failing operation.
 */
function parseOperationError(err: any, opLabels: string[]): string {
  const codes: string[] = err?.operationCodes ?? [];
  // Find the first non-success operation result code
  const failIdx = codes.findIndex((c) => c !== "op_success");
  if (failIdx !== -1 && opLabels[failIdx]) {
    return `"${opLabels[failIdx]}" failed: ${codes[failIdx].replace(/_/g, " ")}`;
  }
  return err.message ?? "Transaction failed";
}

export function useBatchTransaction(
  onSuccess?: () => void
): UseBatchTransactionResult {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  /**
   * Core atomic submission logic.
   * Builds a TransactionBuilder with all provided operations,
   * requests a single Freighter approval, then submits to Horizon.
   */
  const submitOperations = useCallback(
    async (ops: BatchOperation[], walletAddress: string): Promise<boolean> => {
      if (!ops.length) return false;

      setSubmitting(true);
      setError(null);
      setSuccess(false);

      // Ordered labels for per-operation error messages
      const opLabels = ops.map((o) => OP_LABELS[o.type] ?? o.type);

      try {
        // Step 1: Load account to get current sequence number
        const account = await loadAccount(walletAddress);

        // Step 2: Build a single transaction containing all operations atomically
        const builder = new TransactionBuilder(
          { id: account.id, sequence: account.sequence, incrementSequenceNumber() { this.sequence = String(BigInt(this.sequence) + 1n); } } as any,
          {
            fee: String(Number(BASE_FEE) * ops.length), // scale fee by op count
            networkPassphrase: Networks.TESTNET,
          }
        );

        // Add each operation to the transaction builder
        for (const { operation } of ops) {
          builder.addOperation(operation as xdr.Operation);
        }

        // 30-second validity window
        builder.setTimeout(30);
        const tx = builder.build();

        // Step 3: Request a single Freighter approval for the entire batch
        if (!window.freighter) throw new Error("Freighter wallet not installed");

        // signTransaction returns the signed XDR string
        const signedXdr = await window.freighter.signTransaction(tx.toXDR(), {
          network: "TESTNET",
        });

        // Step 4: Submit the signed atomic transaction to Horizon testnet
        await submitToHorizon(signedXdr);

        setSuccess(true);
        onSuccess?.();
        return true;
      } catch (err: any) {
        // Surface a specific message identifying which operation failed
        setError(parseOperationError(err, opLabels));
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [onSuccess]
  );

  /**
   * Convenience wrapper: converts QueuedBets into payment operations
   * and submits them as a single atomic batch.
   * Each bet is a native XLM payment to the contract address.
   */
  const submitBatch = useCallback(
    async (bets: QueuedBet[], walletAddress: string): Promise<boolean> => {
      if (!bets.length) return false;

      // Map each queued bet to a typed BatchOperation (native XLM payment)
      const ops: BatchOperation[] = bets.map((bet) => ({
        type: "placeBet",
        // Payment to a placeholder contract address; real integration passes the contract account
        operation: Operation.payment({
          destination: walletAddress, // replace with contract account in production
          asset: Asset.native(),
          amount: bet.amount.toFixed(7),
        }),
      }));

      return submitOperations(ops, walletAddress);
    },
    [submitOperations]
  );

  return { submitting, error, success, submitBatch, submitOperations };
}
