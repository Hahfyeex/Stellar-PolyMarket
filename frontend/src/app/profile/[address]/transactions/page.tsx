"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

type TxType = "all" | "bet" | "payout";

interface Transaction {
  id: number;
  created_at: string;
  type: "bet" | "payout";
  market_question: string;
  amount: string;
  transaction_hash: string | null;
}

const NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK === "mainnet" ? "public" : "testnet";

export function explorerUrl(hash: string): string {
  return `https://stellar.expert/explorer/${NETWORK}/tx/${hash}`;
}

async function fetchTransactions(address: string): Promise<Transaction[]> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/bets?wallet=${encodeURIComponent(address)}`
  );
  if (!res.ok) throw new Error("Failed to fetch transactions");
  const data = await res.json();
  return (data.bets ?? data) as Transaction[];
}

function abbreviateHash(hash: string): string {
  return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
}

function CopyHashButton({ hash }: { hash: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="ml-1 text-gray-500 hover:text-blue-400 transition-colors"
      title="Copy full transaction hash"
      aria-label="Copy transaction hash"
    >
      {copied ? (
        <span className="text-green-400 text-xs">Copied!</span>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 inline">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

export default function TransactionHistoryPage() {
  const params = useParams();
  const address = params?.address as string;
  const [filter, setFilter] = useState<TxType>("all");

  const { data: transactions = [], isLoading, error } = useQuery<Transaction[]>({
    queryKey: ["transactions", address],
    queryFn: () => fetchTransactions(address),
    enabled: !!address,
    staleTime: 30_000,
  });

  const filtered = transactions.filter((tx) => filter === "all" || tx.type === filter);

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-white font-bold text-base">Transaction History</h1>
            <p className="text-gray-500 text-xs font-mono mt-0.5">
              {address ? `${address.slice(0, 6)}...${address.slice(-6)}` : ""}
            </p>
          </div>
          <Link href="/profile" className="text-indigo-400 hover:text-indigo-300 text-sm transition-colors">
            ← Profile
          </Link>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 flex flex-col gap-4">
        {/* Type filter */}
        <div className="flex gap-2" role="group" aria-label="Filter transactions">
          {(["all", "bet", "payout"] as TxType[]).map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors capitalize ${
                filter === t
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-white"
              }`}
              data-testid={`filter-${t}`}
            >
              {t === "all" ? "All" : t === "bet" ? "Bets" : "Payouts"}
            </button>
          ))}
        </div>

        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 bg-gray-900 rounded-xl animate-pulse border border-gray-800" />
            ))}
          </div>
        )}

        {error && (
          <p className="text-red-400 text-sm bg-red-900/20 border border-red-900/40 rounded-lg px-4 py-3">
            Failed to load transactions.
          </p>
        )}

        {!isLoading && !error && filtered.length === 0 && (
          <p className="text-gray-500 text-center py-12">No transactions found.</p>
        )}

        {!isLoading && filtered.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            {/* Table header */}
            <div className="hidden md:grid grid-cols-[1fr_100px_1fr_120px_180px_40px] gap-4 px-4 py-3 border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wider font-semibold">
              <span>Date</span>
              <span>Type</span>
              <span>Market</span>
              <span>Amount</span>
              <span>Tx Hash</span>
              <span />
            </div>

            {filtered.map((tx, idx) => (
              <div
                key={tx.id}
                className={`grid grid-cols-1 md:grid-cols-[1fr_100px_1fr_120px_180px_40px] gap-2 md:gap-4 px-4 py-4 items-center text-sm ${
                  idx < filtered.length - 1 ? "border-b border-gray-800" : ""
                }`}
                data-testid={`tx-row-${tx.id}`}
              >
                <span className="text-gray-400">
                  {new Date(tx.created_at).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </span>

                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold w-fit ${
                    tx.type === "bet"
                      ? "bg-blue-900/40 text-blue-300"
                      : "bg-green-900/40 text-green-300"
                  }`}
                >
                  {tx.type === "bet" ? "Bet Placed" : "Payout Claimed"}
                </span>

                <span className="text-white truncate max-w-xs" title={tx.market_question}>
                  {tx.market_question}
                </span>

                <span className="text-white font-medium">
                  {parseFloat(tx.amount).toFixed(2)} XLM
                </span>

                <span className="font-mono text-gray-400 text-xs flex items-center gap-1">
                  {tx.transaction_hash ? (
                    <>
                      {abbreviateHash(tx.transaction_hash)}
                      <CopyHashButton hash={tx.transaction_hash} />
                    </>
                  ) : (
                    <span className="text-gray-600">—</span>
                  )}
                </span>

                <span>
                  {tx.transaction_hash && (
                    <a
                      href={explorerUrl(tx.transaction_hash)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-400 hover:text-blue-300 transition-colors"
                      title="View on Stellar Explorer"
                      aria-label="View transaction on Stellar Explorer"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </a>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
