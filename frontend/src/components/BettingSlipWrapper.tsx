"use client";
/**
 * BettingSlipWrapper
 * Client boundary that mounts BettingSlip globally.
 * Reads wallet from a shared WalletContext so the slip can submit transactions.
 * Wrapped in ContractErrorBoundary to catch Soroban call failures.
 */
import BettingSlip from "./BettingSlip";
import { useWalletContext } from "../context/WalletContext";
import ContractErrorBoundary from "./ContractErrorBoundary";
import { store } from "../store";

export default function BettingSlipWrapper() {
  const { publicKey } = useWalletContext();
  return (
    <ContractErrorBoundary context="BettingSlip" store={store}>
      <BettingSlip walletAddress={publicKey} />
    </ContractErrorBoundary>
  );
}
