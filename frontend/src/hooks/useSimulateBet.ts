"use client";
/**
 * useSimulateBet
 *
 * Calls the Soroban simulateTransaction RPC whenever the user changes their
 * stake amount or selected outcome. Results are debounced (400ms) to avoid
 * hammering the RPC on every keystroke.
 *
 * Staleness handling:
 *   Each simulation captures the latestLedger from the RPC response.
 *   A background interval polls the current ledger every 5 seconds.
 *   If the ledger has advanced by more than STALE_LEDGER_THRESHOLD since
 *   the last simulation, `isStale` is set to true and the UI shows a
 *   "Refreshing…" badge — the last known values remain visible rather than
 *   blanking out, preventing jarring UX during active ledger progression.
 *   The next debounced simulation clears the stale flag automatically.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import {
  parseSimulationResponse,
  isSimulationStale,
  SimulationResult,
  STALE_LEDGER_THRESHOLD,
} from "../utils/simulateBet";
const LEDGER_POLL_MS = 5000;

interface UseSimulateBetOptions {
  contractId: string | null;
  walletAddress: string | null;
  marketId: number;
  outcomeIndex: number | null;
  stakeAmount: number;
  poolForOutcome: number;
  totalPool: number;
}

interface UseSimulateBetResult {
  result: SimulationResult | null;
  simulating: boolean;
  isStale: boolean;
}

export function useSimulateBet({
  contractId,
  walletAddress,
  marketId,
  outcomeIndex,
  stakeAmount,
  poolForOutcome,
  totalPool,
}: UseSimulateBetOptions): UseSimulateBetResult {
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [currentLedger, setCurrentLedger] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ledgerPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Determine if the last simulation result is stale based on ledger drift
  const isStale = isSimulationStale(
    result?.ledgerSequence ?? null,
    currentLedger,
    STALE_LEDGER_THRESHOLD
  );

  /**
   * Run simulateTransaction via the Stellar SDK.
   * Builds a minimal transaction envelope for place_bet and sends it to
   * the Soroban RPC endpoint — no signing required for simulation.
   */
  const runSimulation = useCallback(async () => {
    // Skip if inputs are incomplete
    if (
      !contractId ||
      !walletAddress ||
      outcomeIndex === null ||
      stakeAmount <= 0 ||
      totalPool <= 0
    ) {
      setResult(null);
      return;
    }

    setSimulating(true);
    try {
      // Dynamic import keeps the heavy Stellar SDK out of the initial bundle
      const { SorobanRpc, TransactionBuilder, Networks, BASE_FEE, xdr, Address, nativeToScVal } =
        await import("@stellar/stellar-sdk");

      const rpcUrl =
        (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_SOROBAN_RPC_URL) ||
        "https://soroban-testnet.stellar.org";
      const server = new SorobanRpc.Server(rpcUrl);

      // Fetch the source account to get the current sequence number
      const account = await server.getAccount(walletAddress);

      // Build a transaction that calls place_bet(market_id, option_index, bettor, amount)
      // Amount in stroops (1 XLM = 10_000_000 stroops)
      const amountStroops = BigInt(Math.round(stakeAmount * 10_000_000));

      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          // @ts-ignore — contract() is available in SDK v11
          (await import("@stellar/stellar-sdk")).contract.contractInvocation({
            contractId,
            method: "place_bet",
            args: [
              nativeToScVal(BigInt(marketId), { type: "u64" }),
              nativeToScVal(outcomeIndex, { type: "u32" }),
              new Address(walletAddress).toScVal(),
              nativeToScVal(amountStroops, { type: "i128" }),
            ],
          })
        )
        .setTimeout(30)
        .build();

      // simulateTransaction does NOT submit — safe to call without signing
      const simResponse = await server.simulateTransaction(tx);

      // Parse the raw response into our clean SimulationResult shape
      const parsed = parseSimulationResponse(
        simResponse as unknown as Record<string, any>,
        stakeAmount,
        poolForOutcome,
        totalPool
      );

      setResult(parsed);
      // Track current ledger for staleness detection
      if (parsed.ledgerSequence !== null) {
        setCurrentLedger(parsed.ledgerSequence);
      }
    } catch (err: any) {
      // Surface simulation errors without crashing the UI
      setResult({
        estimatedPayout: 0,
        networkFeeXlm: 0,
        success: false,
        error: err?.message ?? "Simulation failed",
        ledgerSequence: null,
      });
    } finally {
      setSimulating(false);
    }
  }, [contractId, walletAddress, marketId, outcomeIndex, stakeAmount, poolForOutcome, totalPool]);

  // Debounce simulation on input changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(runSimulation, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [runSimulation]);

  // Poll current ledger every 5s to detect staleness
  useEffect(() => {
    ledgerPollRef.current = setInterval(async () => {
      try {
        const { SorobanRpc } = await import("@stellar/stellar-sdk");
      const rpcUrl =
        (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_SOROBAN_RPC_URL) ||
        "https://soroban-testnet.stellar.org";
        const server = new SorobanRpc.Server(rpcUrl);
        const ledger = await server.getLatestLedger();
        setCurrentLedger(ledger.sequence);
      } catch {
        // Ignore poll errors — staleness detection is best-effort
      }
    }, LEDGER_POLL_MS);

    return () => {
      if (ledgerPollRef.current) clearInterval(ledgerPollRef.current);
    };
  }, []);

  return { result, simulating, isStale };
}
