"use client";
/**
 * AssetSelector
 *
 * Dropdown for selecting a Stellar asset (native XLM or custom).
 * Fetches the wallet's existing trustlines from Horizon to show
 * real balances alongside each asset option.
 *
 * Props:
 *   assets        — list of supported assets to display
 *   selected      — currently selected asset
 *   walletAddress — used to fetch live balances from Horizon
 *   onChange      — called when user picks a different asset
 */
import { useState, useEffect, useRef } from "react";

export interface Asset {
  code: string;
  issuer: string | null; // null = native XLM
  name: string;
  icon?: string; // emoji or URL
}

interface Props {
  assets: Asset[];
  selected: Asset;
  walletAddress: string | null;
  onChange: (asset: Asset) => void;
}

const HORIZON = "https://horizon-testnet.stellar.org";

export default function AssetSelector({ assets, selected, walletAddress, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [balances, setBalances] = useState<Record<string, string>>({});
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Fetch wallet balances from Horizon
  useEffect(() => {
    if (!walletAddress) return;
    fetch(`${HORIZON}/accounts/${encodeURIComponent(walletAddress)}`)
      .then((r) => r.json())
      .then((data) => {
        const map: Record<string, string> = {};
        for (const b of data.balances ?? []) {
          if (b.asset_type === "native") {
            map["XLM"] = parseFloat(b.balance).toFixed(2);
          } else if (b.asset_code && b.asset_issuer) {
            map[`${b.asset_code}:${b.asset_issuer}`] = parseFloat(b.balance).toFixed(2);
          }
        }
        setBalances(map);
      })
      .catch(() => {}); // fail silently — balances are cosmetic
  }, [walletAddress]);

  function balanceFor(asset: Asset): string | null {
    const key = asset.issuer ? `${asset.code}:${asset.issuer}` : asset.code;
    return balances[key] ?? null;
  }

  return (
    <div ref={ref} className="relative" data-testid="asset-selector">
      {/* Trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white transition-colors min-w-[120px]"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="text-base">{selected.icon ?? "🪙"}</span>
        <span className="font-semibold">{selected.code}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-gray-400 ml-auto">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          role="listbox"
          className="absolute top-full mt-1 left-0 z-50 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden min-w-[220px]"
        >
          {assets.map((asset) => {
            const bal = balanceFor(asset);
            const isSelected = asset.code === selected.code && asset.issuer === selected.issuer;
            return (
              <button
                key={`${asset.code}-${asset.issuer}`}
                role="option"
                aria-selected={isSelected}
                onClick={() => { onChange(asset); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors text-left
                  ${isSelected ? "bg-blue-900/40 text-blue-300" : "text-white hover:bg-gray-800"}`}
              >
                <span className="text-lg">{asset.icon ?? "🪙"}</span>
                <div className="flex-1">
                  <p className="font-semibold">{asset.code}</p>
                  <p className="text-xs text-gray-400">{asset.name}</p>
                </div>
                {bal !== null && (
                  <span className="text-xs text-gray-400 shrink-0">{bal}</span>
                )}
                {isSelected && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 text-blue-400 shrink-0">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
