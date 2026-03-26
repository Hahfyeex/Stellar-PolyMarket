/**
 * trustline.ts
 *
 * Utilities for checking and constructing Stellar trustline transactions.
 *
 * Supported assets are custom Stellar assets (non-native). XLM (native) never
 * requires a trustline and is always skipped.
 *
 * Horizon API reference:
 *   GET https://horizon-testnet.stellar.org/accounts/:accountId
 *   Response shape (relevant fields):
 *   {
 *     balances: [
 *       // Native XLM entry — no asset_code / asset_issuer
 *       { asset_type: "native", balance: "100.0000000" },
 *
 *       // Custom asset entry — has asset_code + asset_issuer
 *       { asset_type: "credit_alphanum4", asset_code: "USDC",
 *         asset_issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
 *         balance: "50.0000000", limit: "922337203685.4775807" }
 *     ]
 *   }
 */

import {
  Asset,
  Horizon,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

/** A custom Stellar asset that may require a trustline */
export interface StellarAsset {
  code: string;
  issuer: string;
}

const HORIZON_TESTNET = "https://horizon-testnet.stellar.org";
const HORIZON_TIMEOUT_MS = 10_000;

/**
 * Check whether a wallet already has a trustline for the given asset.
 *
 * @param walletAddress - Stellar public key (G...)
 * @param asset         - { code, issuer } of the custom asset
 * @returns true if trustline exists, false if not, throws on network error
 */
export async function hasTrustline(
  walletAddress: string,
  asset: StellarAsset
): Promise<boolean> {
  // Native XLM never needs a trustline — short-circuit immediately
  if (asset.code === "XLM" && !asset.issuer) return true;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HORIZON_TIMEOUT_MS);

  try {
    const res = await fetch(
      `${HORIZON_TESTNET}/accounts/${encodeURIComponent(walletAddress)}`,
      { signal: controller.signal }
    );

    if (!res.ok) {
      // 404 means the account doesn't exist on-chain yet (unfunded)
      if (res.status === 404) return false;
      throw new Error(`Horizon returned HTTP ${res.status}`);
    }

    const account = await res.json();

    /**
     * Walk the balances array looking for an entry that matches both
     * asset_code and asset_issuer. The native XLM entry has asset_type
     * "native" and no asset_code/asset_issuer, so it will never match
     * a custom asset check.
     */
    return (account.balances as any[]).some(
      (b) =>
        b.asset_code === asset.code &&
        b.asset_issuer === asset.issuer
    );
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error("Horizon request timed out. Please check your connection and retry.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Build an unsigned Stellar XDR for a changeTrust operation.
 *
 * Uses TransactionBuilder with a 30-second timeout and a base fee of 100
 * stroops (the Stellar minimum). The caller is responsible for signing
 * via Freighter and submitting to Horizon.
 *
 * @param walletAddress - The account that needs the trustline
 * @param asset         - { code, issuer } of the asset to trust
 * @returns Base64-encoded XDR string ready for Freighter
 */
export async function buildTrustlineXdr(
  walletAddress: string,
  asset: StellarAsset
): Promise<string> {
  const server = new Horizon.Server(HORIZON_TESTNET);

  // Load the account to get the current sequence number (required by TransactionBuilder)
  const account = await server.loadAccount(walletAddress);

  const stellarAsset = new Asset(asset.code, asset.issuer);

  const tx = new TransactionBuilder(account, {
    fee: "100",                    // 100 stroops = Stellar minimum base fee
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      // changeTrust with no limit argument defaults to the maximum allowed limit,
      // meaning the user trusts the asset up to the protocol maximum.
      Operation.changeTrust({ asset: stellarAsset })
    )
    .setTimeout(30)               // Transaction expires in 30 seconds if not submitted
    .build();

  return tx.toXDR();
}

/**
 * Submit a signed XDR to Horizon testnet.
 *
 * @param signedXdr - Base64-encoded signed transaction XDR from Freighter
 * @returns Horizon transaction result
 */
export async function submitTrustlineTx(signedXdr: string): Promise<Horizon.HorizonApi.TransactionResponse> {
  const server = new Horizon.Server(HORIZON_TESTNET);
  const { TransactionBuilder } = await import("@stellar/stellar-sdk");
  const tx = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);
  return server.submitTransaction(tx);
}
