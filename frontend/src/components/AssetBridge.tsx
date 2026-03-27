"use client";
/**
 * AssetBridge
 *
 * UI for swapping/bridging between Stellar assets.
 * Constructs a Stellar path payment transaction via Freighter.
 *
 * Flow:
 *   1. User picks source asset + amount
 *   2. User picks destination asset
 *   3. GET /api/bridge/quote → estimated receive amount + path
 *   4. User confirms → TransactionBuilder (pathPaymentStrictSend)
 *   5. Freighter signs → submit to Horizon
 */
import { useState, useEffect } from "react";
import AssetSelector, { Asset } from "./AssetSelector";

const SUPPORTED_ASSETS: Asset[] = [
  { code: "XLM", issuer: null, name: "Stellar Lumens", icon: "⭐" },
  { code: "USDC", issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN", name: "USD Coin", icon: "💵" },
  { code: "AQUA", issuer: "GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA", name: "Aquarius", icon: "🌊" },
  { code: "yXLM", issuer: "GARDNV3Q7YGT4AKSDF25LT32YSCCW4EV22Y2TV3I2PU2MMXJTEDL5T55", name: "Yield XLM", icon: "📈" },
];

interface Quote {
  receiveAmount: string;
  path: string[];
  fee: string;
}

interface Props {
  walletAddress: string | null;
  onConnect?: () => void;
}

export default function AssetBridge({ walletAddress, onConnect }: Props) {
  const [fromAsset, setFromAsset] = useState<Asset>(SUPPORTED_ASSETS[0]);
  const [toAsset, setToAsset] = useState<Asset>(SUPPORTED_ASSETS[1]);
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [status, setStatus] = useState<"idle" | "signing" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Swap from/to
  function swapAssets() {
    setFromAsset(toAsset);
    setToAsset(fromAsset);
    setQuote(null);
  }

  // Fetch quote whenever inputs change
  useEffect(() => {
    if (!amount || parseFloat(amount) <= 0 || fromAsset.code === toAsset.code) {
      setQuote(null);
      return;
    }
    const timer = setTimeout(async () => {
      setQuoting(true);
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/bridge/quote?` +
          `from=${fromAsset.code}&to=${toAsset.code}&amount=${amount}`
        );
        if (res.ok) {
          setQuote(await res.json());
        } else {
          // Fallback mock quote for demo
          setQuote({
            receiveAmount: (parseFloat(amount) * 0.97).toFixed(4),
            path: [fromAsset.code, toAsset.code],
            fee: "0.00001 XLM",
          });
        }
      } catch {
        setQuote({
          receiveAmount: (parseFloat(amount) * 0.97).toFixed(4),
          path: [fromAsset.code, toAsset.code],
          fee: "0.00001 XLM",
        });
      } finally {
        setQuoting(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [amount, fromAsset, toAsset]);

  async function handleBridge() {
    if (!walletAddress || !amount || !quote) return;
    setStatus("signing");
    setErrorMsg(null);
    try {
      // Build XDR via backend
      const buildRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/bridge/build`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress,
          fromAsset: { code: fromAsset.code, issuer: fromAsset.issuer },
          toAsset: { code: toAsset.code, issuer: toAsset.issuer },
          amount,
          minReceive: quote.receiveAmount,
        }),
      });
      const { xdr } = await buildRes.json();
      if (!window.freighter) throw new Error("Freighter not installed");
      const signed = await window.freighter.signTransaction(xdr, { network: "TESTNET" });
      setStatus("submitting");
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/bridge/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedXdr: signed }),
      });
      setStatus("success");
      setAmount("");
      setQuote(null);
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err.message ?? "Bridge failed");
    }
  }

  const sameAsset = fromAsset.code === toAsset.code;
  const canBridge = !!walletAddress && !!amount && parseFloat(amount) > 0 && !!quote && !sameAsset;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex flex-col gap-4 w-full max-w-md">
      <div className="flex items-center justify-between">
        <h2 className="text-white font-bold text-lg">Asset Bridge</h2>
        <span className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded-full">Testnet</span>
      </div>

      {/* From */}
      <div className="bg-gray-800 rounded-xl p-4 flex flex-col gap-2">
        <label className="text-xs text-gray-400">You send</label>
        <div className="flex items-center gap-3">
          <input
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="flex-1 bg-transparent text-white text-2xl font-bold outline-none placeholder-gray-600 min-w-0"
            aria-label="Amount to send"
          />
          <AssetSelector
            assets={SUPPORTED_ASSETS}
            selected={fromAsset}
            walletAddress={walletAddress}
            onChange={(a) => { setFromAsset(a); setQuote(null); }}
          />
        </div>
      </div>

      {/* Swap button */}
      <div className="flex justify-center -my-1">
        <button
          onClick={swapAssets}
          className="w-9 h-9 rounded-full bg-gray-800 hover:bg-gray-700 border border-gray-700 flex items-center justify-center transition-colors"
          aria-label="Swap assets"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-gray-400">
            <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        </button>
      </div>

      {/* To */}
      <div className="bg-gray-800 rounded-xl p-4 flex flex-col gap-2">
        <label className="text-xs text-gray-400">You receive (est.)</label>
        <div className="flex items-center gap-3">
          <span className="flex-1 text-2xl font-bold text-white">
            {quoting ? (
              <span className="text-gray-500 animate-pulse text-base">Fetching quote...</span>
            ) : quote ? (
              quote.receiveAmount
            ) : (
              <span className="text-gray-600">—</span>
            )}
          </span>
          <AssetSelector
            assets={SUPPORTED_ASSETS}
            selected={toAsset}
            walletAddress={walletAddress}
            onChange={(a) => { setToAsset(a); setQuote(null); }}
          />
        </div>
      </div>

      {/* Quote details */}
      {quote && !sameAsset && (
        <div className="bg-gray-800/50 rounded-xl px-4 py-3 flex flex-col gap-1.5 text-xs text-gray-400">
          <div className="flex justify-between">
            <span>Rate</span>
            <span className="text-white">
              1 {fromAsset.code} ≈ {(parseFloat(quote.receiveAmount) / parseFloat(amount)).toFixed(4)} {toAsset.code}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Network fee</span>
            <span className="text-green-400">{quote.fee}</span>
          </div>
          <div className="flex justify-between">
            <span>Path</span>
            <span className="text-white">{quote.path.join(" → ")}</span>
          </div>
        </div>
      )}

      {sameAsset && (
        <p className="text-yellow-400 text-xs text-center">Select different assets to bridge</p>
      )}

      {/* Status messages */}
      {status === "success" && (
        <div className="bg-green-900/30 border border-green-700 rounded-xl px-4 py-3 text-green-400 text-sm text-center">
          ✓ Bridge successful
        </div>
      )}
      {status === "error" && errorMsg && (
        <div className="bg-red-900/30 border border-red-700 rounded-xl px-4 py-3 text-red-400 text-sm text-center">
          {errorMsg}
        </div>
      )}

      {/* Action */}
      {!walletAddress ? (
        <button
          onClick={onConnect}
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-white font-semibold text-sm transition-colors"
        >
          Connect Wallet to Bridge
        </button>
      ) : (
        <button
          onClick={handleBridge}
          disabled={!canBridge || status === "signing" || status === "submitting"}
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-white font-semibold text-sm transition-colors"
        >
          {status === "signing" ? "Waiting for Freighter..." :
           status === "submitting" ? "Submitting..." :
           `Bridge ${fromAsset.code} → ${toAsset.code}`}
        </button>
      )}
    </div>
  );
}
