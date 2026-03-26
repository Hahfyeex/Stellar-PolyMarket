"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SearchFilters, SortKey } from "../hooks/useMarketSearch";

const CATEGORIES = ["Crypto", "Sports", "Politics", "Economics", "Tech", "Other"];
const STATUSES = ["open", "closed", "resolved"];
const SORTS: { value: SortKey; label: string }[] = [
  { value: "volume", label: "Volume" },
  { value: "end_date", label: "End Date" },
  { value: "newest", label: "Newest" },
];

interface Props {
  filters: SearchFilters;
  onChange: (f: SearchFilters) => void;
}

export default function MarketFilters({ filters, onChange }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [inputValue, setInputValue] = useState(filters.query);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync URL query params whenever filters change
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    filters.query ? params.set("q", filters.query) : params.delete("q");
    filters.category ? params.set("category", filters.category) : params.delete("category");
    filters.status ? params.set("status", filters.status) : params.delete("status");
    filters.sort !== "newest" ? params.set("sort", filters.sort) : params.delete("sort");
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [filters, router, searchParams]);

  // Debounce search input by 200ms to avoid excessive fuse.js calls
  const handleQueryChange = useCallback(
    (value: string) => {
      setInputValue(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onChange({ ...filters, query: value });
      }, 200);
    },
    [filters, onChange]
  );

  const set = (patch: Partial<SearchFilters>) => onChange({ ...filters, ...patch });

  return (
    <div className="flex flex-col gap-3 mb-6">
      {/* Search input */}
      <input
        type="search"
        placeholder="Search markets…"
        value={inputValue}
        onChange={(e) => handleQueryChange(e.target.value)}
        className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none border border-gray-700 focus:border-blue-500"
        aria-label="Search markets"
      />

      <div className="flex flex-wrap gap-2 items-center">
        {/* Category tag buttons */}
        <button
          onClick={() => set({ category: "" })}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            !filters.category
              ? "bg-blue-600 text-white"
              : "bg-gray-800 text-gray-300 hover:bg-gray-700"
          }`}
        >
          All
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => set({ category: filters.category === cat ? "" : cat })}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filters.category === cat
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            {cat}
          </button>
        ))}

        {/* Status dropdown */}
        <select
          value={filters.status}
          onChange={(e) => set({ status: e.target.value })}
          className="ml-auto bg-gray-800 text-gray-300 text-xs rounded-lg px-3 py-1.5 border border-gray-700 outline-none"
          aria-label="Filter by status"
        >
          <option value="">All Statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>

        {/* Sort dropdown */}
        <select
          value={filters.sort}
          onChange={(e) => set({ sort: e.target.value as SortKey })}
          className="bg-gray-800 text-gray-300 text-xs rounded-lg px-3 py-1.5 border border-gray-700 outline-none"
          aria-label="Sort markets"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              Sort: {s.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
