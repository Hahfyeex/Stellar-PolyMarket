"use client";
/**
 * BetHistoryTable
 *
 * Fetches GET /api/bets?wallet=ADDRESS, renders a paginated (20/page) table
 * with sortable columns, a P&L summary row, and a CSV export via papaparse.
 */
import { useState, useEffect, useCallback } from "react";
import Papa from "papaparse";

// ── Types ────────────────────────────────────────────────────────────────────

export interface BetRow {
  id: number;
  date: string;
  marketTitle: string;
  outcomeBetOn: string;
  amountXLM: number;
  result: "Win" | "Loss" | "Pending";
  payoutReceived: number;
}

type SortKey = keyof BetRow;
type SortDir = "asc" | "desc";

const PAGE_SIZE = 20;

// ── Helpers ──────────────────────────────────────────────────────────────────

export function sortBets(rows: BetRow[], key: SortKey, dir: SortDir): BetRow[] {
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av === bv) return 0;
    const cmp = av < bv ? -1 : 1;
    return dir === "asc" ? cmp : -cmp;
  });
}

export function buildCSVRows(rows: BetRow[]) {
  return rows.map((r) => ({
    Date: r.date,
    "Market Title": r.marketTitle,
    "Outcome Bet On": r.outcomeBetOn,
    "Amount (XLM)": r.amountXLM,
    Result: r.result,
    "Payout Received (XLM)": r.payoutReceived,
  }));
}

export function computeSummary(rows: BetRow[]) {
  const totalStaked = rows.reduce((s, r) => s + r.amountXLM, 0);
  const totalWon = rows.reduce((s, r) => s + r.payoutReceived, 0);
  const netPnL = totalWon - totalStaked;
  return { totalStaked, totalWon, netPnL };
}

// ── API ──────────────────────────────────────────────────────────────────────

async function fetchAllBets(wallet: string, apiUrl: string): Promise<BetRow[]> {
  const res = await fetch(`${apiUrl}/api/bets?wallet=${encodeURIComponent(wallet)}`);
  if (!res.ok) throw new Error("Failed to fetch bets");
  const data = await res.json();
  // Normalise raw API shape → BetRow
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.bets ?? []).map(
    (b: any): BetRow => ({
      id: b.id,
      date: b.created_at ?? b.date ?? "",
      marketTitle: b.market_title ?? b.marketTitle ?? `Market #${b.market_id}`,
      outcomeBetOn: b.outcome_label ?? b.outcomeBetOn ?? String(b.outcome_index ?? ""),
      amountXLM: parseFloat(b.amount ?? b.amountXLM ?? "0"),
      result: b.result ?? "Pending",
      payoutReceived: parseFloat(b.payout_received ?? b.payoutReceived ?? "0"),
    })
  );
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  walletAddress: string;
  apiUrl?: string;
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "date", label: "Date" },
  { key: "marketTitle", label: "Market" },
  { key: "outcomeBetOn", label: "Outcome" },
  { key: "amountXLM", label: "Amount (XLM)" },
  { key: "result", label: "Result" },
  { key: "payoutReceived", label: "Payout (XLM)" },
];

export default function BetHistoryTable({ walletAddress, apiUrl = "" }: Props) {
  const [allRows, setAllRows] = useState<BetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!walletAddress) return;
    setLoading(true);
    setError(null);
    fetchAllBets(walletAddress, apiUrl)
      .then(setAllRows)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [walletAddress, apiUrl]);

  const handleSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
      setPage(0);
    },
    [sortKey]
  );

  const sorted = sortBets(allRows, sortKey, sortDir);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const summary = computeSummary(allRows);

  const handleDownloadCSV = useCallback(() => {
    const csv = Papa.unparse(buildCSVRows(sorted));
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bet-history-${walletAddress.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sorted, walletAddress]);

  if (loading) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
        <p className="text-gray-400 text-sm animate-pulse">Loading bet history…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h2 className="text-white font-semibold text-base">Bet History</h2>
        <button
          onClick={handleDownloadCSV}
          disabled={allRows.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          ↓ Download CSV
        </button>
      </div>

      {allRows.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
          <p className="text-gray-500 text-sm">No bets found.</p>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-800 border-b border-gray-700">
                  <tr>
                    {COLUMNS.map(({ key, label }) => (
                      <th
                        key={key}
                        onClick={() => handleSort(key)}
                        className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-white transition-colors whitespace-nowrap"
                      >
                        <span className="flex items-center gap-1">
                          {label}
                          {sortKey === key ? (
                            <span className="text-indigo-400">{sortDir === "asc" ? "↑" : "↓"}</span>
                          ) : (
                            <span className="text-gray-700">↕</span>
                          )}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {pageRows.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                        {new Date(row.date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-gray-200 max-w-xs truncate">
                        {row.marketTitle}
                      </td>
                      <td className="px-4 py-3 text-gray-300">{row.outcomeBetOn}</td>
                      <td className="px-4 py-3 text-white tabular-nums">
                        {row.amountXLM.toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            row.result === "Win"
                              ? "bg-green-900/60 text-green-400"
                              : row.result === "Loss"
                                ? "bg-red-900/60 text-red-400"
                                : "bg-gray-700 text-gray-400"
                          }`}
                        >
                          {row.result}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white tabular-nums">
                        {row.payoutReceived.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* Summary row — pinned to bottom of table */}
                <tfoot className="border-t-2 border-gray-700 bg-gray-800/60">
                  <tr>
                    <td
                      colSpan={3}
                      className="px-4 py-3 text-gray-400 text-xs font-semibold uppercase tracking-wider"
                    >
                      Totals
                    </td>
                    <td className="px-4 py-3 text-white font-semibold tabular-nums">
                      {summary.totalStaked.toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-semibold ${
                          summary.netPnL > 0
                            ? "text-green-400"
                            : summary.netPnL < 0
                              ? "text-red-400"
                              : "text-gray-400"
                        }`}
                      >
                        P&amp;L {summary.netPnL >= 0 ? "+" : ""}
                        {summary.netPnL.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white font-semibold tabular-nums">
                      {summary.totalWon.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-gray-400">
              <span>
                Page {page + 1} of {totalPages} · {allRows.length} bets
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  ← Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page === totalPages - 1}
                  className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
