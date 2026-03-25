"use client";
/**
 * BettingSlipWrapper
 * Client boundary that mounts BettingSlip globally.
 * Reads wallet from a shared WalletContext so the slip can submit transactions.
 */
import BettingSlip from "./BettingSlip";
import { useWalletContext } from "../context/WalletContext";

export default function BettingSlipWrapper() {
  const { publicKey } = useWalletContext();
  return <BettingSlip walletAddress={publicKey} />;
}
