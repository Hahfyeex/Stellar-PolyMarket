"use client";
/**
 * useGasSavings
 *
 * Fetches live Ethereum gas data from the Etherscan Gas Oracle API and
 * calculates how much the user saved by transacting on Stellar (Soroban)
 * instead of Ethereum.
 *
 * Formula:
 *   saved_usd = (eth_avg_gas_gwei - stellar_actual_gas_xlm_equivalent) * xlm_price_usd
 *
 * Where:
 *   eth_avg_gas_gwei  = ProposeGasPrice from Etherscan (standard tx cost in gwei)
 *   stellar_actual    = actual Stellar base fee in stroops converted to XLM
 *   xlm_price_usd     = live XLM/USD price from CoinGecko
 */

import { useState, useEffect, useCallback } from "react";

// Stellar base fee for a standard transaction (100 stroops = 0.00001 XLM)
const STELLAR_BASE_FEE_STROOPS = 100;
const STROOPS_PER_XLM = 10_000_000;

// A standard ETH transfer costs 21 000 gas units
const ETH_TRANSFER_GAS_UNITS = 21_000;
// 1 gwei = 1e-9 ETH
const GWEI_TO_ETH = 1e-9;

export interface GasSavingsResult {
  savedUsd: number;
  ethCostUsd: number;
  stellarCostUsd: number;
  xlmPrice: number;
  ethGasGwei: number;
  loading: boolean;
  error: string | null;
}

async function fetchEthGasGwei(): Promise<number> {
  const apiKey = process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY ?? "";
  const url = `https://api.etherscan.io/api?module=gastracker&action=gasoracle&apikey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Etherscan responded ${res.status}`);
  const json = await res.json();
  if (json.status !== "1") throw new Error("Etherscan gas oracle unavailable");
  return parseFloat(json.result.ProposeGasPrice);
}

async function fetchXlmPriceUsd(): Promise<number> {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd"
  );
  if (!res.ok) throw new Error(`CoinGecko responded ${res.status}`);
  const json = await res.json();
  return json.stellar.usd as number;
}

export function calculateSavings(
  ethGasGwei: number,
  xlmPriceUsd: number,
  stellarFeeStroops = STELLAR_BASE_FEE_STROOPS
): Pick<GasSavingsResult, "savedUsd" | "ethCostUsd" | "stellarCostUsd"> {
  // ETH cost: gas_units * gas_price_gwei * gwei_to_eth * eth_price
  // We derive ETH price from XLM price ratio — but we don't have ETH price here.
  // Instead we express everything in USD via the two fetched values.
  // ETH gas cost in ETH:
  const ethCostEth = ETH_TRANSFER_GAS_UNITS * ethGasGwei * GWEI_TO_ETH;

  // We need ETH/USD. Fetch separately or accept as param.
  // For simplicity this function receives ethCostUsd directly when called from the hook.
  // This overload is used for unit-testing the pure math.
  // Stellar cost in USD:
  const stellarCostXlm = stellarFeeStroops / STROOPS_PER_XLM;
  const stellarCostUsd = stellarCostXlm * xlmPriceUsd;

  // ethCostEth is returned so the hook can multiply by ETH price
  return {
    ethCostUsd: ethCostEth, // caller multiplies by ETH/USD
    stellarCostUsd,
    savedUsd: ethCostEth - stellarCostUsd, // caller adjusts after ETH price applied
  };
}

export function calculateSavingsUsd(
  ethGasGwei: number,
  ethPriceUsd: number,
  xlmPriceUsd: number,
  stellarFeeStroops = STELLAR_BASE_FEE_STROOPS
): Pick<GasSavingsResult, "savedUsd" | "ethCostUsd" | "stellarCostUsd"> {
  const ethCostEth = ETH_TRANSFER_GAS_UNITS * ethGasGwei * GWEI_TO_ETH;
  const ethCostUsd = ethCostEth * ethPriceUsd;

  const stellarCostXlm = stellarFeeStroops / STROOPS_PER_XLM;
  const stellarCostUsd = stellarCostXlm * xlmPriceUsd;

  return {
    ethCostUsd,
    stellarCostUsd,
    savedUsd: ethCostUsd - stellarCostUsd,
  };
}

async function fetchEthPriceUsd(): Promise<number> {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
  );
  if (!res.ok) throw new Error(`CoinGecko ETH price responded ${res.status}`);
  const json = await res.json();
  return json.ethereum.usd as number;
}

export function useGasSavings(): GasSavingsResult {
  const [state, setState] = useState<GasSavingsResult>({
    savedUsd: 0,
    ethCostUsd: 0,
    stellarCostUsd: 0,
    xlmPrice: 0,
    ethGasGwei: 0,
    loading: true,
    error: null,
  });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const [ethGasGwei, xlmPriceUsd, ethPriceUsd] = await Promise.all([
        fetchEthGasGwei(),
        fetchXlmPriceUsd(),
        fetchEthPriceUsd(),
      ]);

      const { ethCostUsd, stellarCostUsd, savedUsd } = calculateSavingsUsd(
        ethGasGwei,
        ethPriceUsd,
        xlmPriceUsd
      );

      setState({
        savedUsd,
        ethCostUsd,
        stellarCostUsd,
        xlmPrice: xlmPriceUsd,
        ethGasGwei,
        loading: false,
        error: null,
      });
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to fetch gas data",
      }));
    }
  }, []);

  useEffect(() => {
    load();
    // Refresh every 60 seconds
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  return state;
}
