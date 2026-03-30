"use client";
/**
 * BetHistoryFilters
 *
 * Filter bar for BetHistoryTable: date range, outcome, market category.
 * Syncs state with URL query params. Shows active filter count badge.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { BetRow } from "./BetHistoryTable";

export type OutcomeFilter = "All" | "Win" | "Loss" | "Pending";

export interface FilterState {
  startDate: string;
  endDate: string;
  outcome: OutcomeFilter;
  category: string;
}

export const DEFAULT_FILTERS: FilterState = {
  startDate: "",
  endDate: "",
  outcome: "All",
  category: "",
};

// ── URL sync helpers ──────────────────────────────────────────────────────────

export function filtersToParams(f: FilterState): URLSearchParams {
  const p = new URLSearchParams();
  if (f.startDate) p.set("startDate", f.startDate);
  if (f.endDate) p.set("endDate", f.endDate);
  if (f.outcome !== "All") p.set("outcome", f.outcome);
  if (f.category) p.set("category", f.category);
  return p;
}

export function paramsToFilters(params: URLSearchParams): FilterState {
  return {
    startDate: params.get("startDate") ?? "",
    endDate: params.get("endDate") ?? "",
    outcome: (params.get("outcome") as OutcomeFilter) ?? "All",
    category: params.get("category") ?? "",
  };
}

export function countActiveFilters(f: FilterState): number {
  let n = 0;
  if (f.startDate) n++;
  if (f.endDate) n++;
  if (f.outcome !== "All") n++;
  if (f.category) n++;
  return n;
}

// ── Client-side filter logic ──────────────────────────────────────────────────

export function applyFilters(rows: BetRow[], filters: FilterState): BetRow[] {
  return rows.filter((row) => {
    if (filters.startDate) {
      if (new Date(row.date) < new Date(filters.startDate)) return false;
    }
    if (filters.endDate) {
      // Include the full end day
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      if (new Date(row.date) > end) return false;
    }
    if (filters.outcome !== "All" && row.result !== filters.outcome) return false;
    if (filters.category && !row.marketTitle.toLowerCase().includes(filters.category.toLowerCase()))
      return false;
    return true;
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  onClear: () => void;
}

const OUTCOMES: OutcomeFilter[] = ["All", "Win", "Loss", "Pending"];

export default function BetHistoryFilters({ filters, onChange, onClear }: Props) {
  const [open, setOpen] = useState(false);
  const activeCount = countActiveFilters(filters);

  const set = useCallback(
    (key: keyof FilterState, value: string) => onChange({ ...filters, [key]: value }),
    [filters, onChange]
  );

  return (
    <div className="flex flex-col gap-2">
      {/* Toggle button */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors"
          aria-expanded={open}
          aria-label="Toggle filters"
        >
          Filters
          {activeCount > 0 && (
            <span
              className="flex items-center justify-center w-5 h-5 bg-indigo-600 text-white text-xs font-bold rounded-full"
              data-testid="filter-badge"
            >
              {activeCount}
            </span>
          )}
        </button>
        {activeCount > 0 && (
          <button
            onClick={onClear}
            className="px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            aria-label="Clear filters"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Filter bar */}
      {open && (
        <div className="flex flex-wrap gap-3 p-4 bg-gray-800 border border-gray-700 rounded-xl">
          {/* Date range */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400 font-medium">Start Date</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => set("startDate", e.target.value)}
              className="px-3 py-1.5 bg-gray-900 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500"
              aria-label="Start date"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400 font-medium">End Date</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => set("endDate", e.target.value)}
              className="px-3 py-1.5 bg-gray-900 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500"
              aria-label="End date"
            />
          </div>

          {/* Outcome filter */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400 font-medium">Outcome</label>
            <select
              value={filters.outcome}
              onChange={(e) => set("outcome", e.target.value)}
              className="px-3 py-1.5 bg-gray-900 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500"
              aria-label="Outcome filter"
            >
              {OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>

          {/* Category filter */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400 font-medium">Category</label>
            <input
              type="text"
              placeholder="e.g. crypto"
              value={filters.category}
              onChange={(e) => set("category", e.target.value)}
              className="px-3 py-1.5 bg-gray-900 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500 placeholder-gray-600"
              aria-label="Market category filter"
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Hook: manages filter state synced with URL query params.
 */
export function useBetHistoryFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<FilterState>(() => paramsToFilters(searchParams));

  // Restore from URL on mount / URL change
  useEffect(() => {
    setFilters(paramsToFilters(searchParams));
  }, [searchParams]);

  const onChange = useCallback(
    (f: FilterState) => {
      setFilters(f);
      const params = filtersToParams(f);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname]
  );

  const onClear = useCallback(() => {
    onChange(DEFAULT_FILTERS);
  }, [onChange]);

  return { filters, onChange, onClear };
}
