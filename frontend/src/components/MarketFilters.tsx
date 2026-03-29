"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { SearchFilters, SortKey } from "../hooks/useMarketSearch";

/** Internal keys used for i18n lookup; display labels are resolved at render time */
const CATEGORY_KEYS = ["crypto", "sports", "politics", "economics", "tech", "other"] as const;
const STATUS_KEYS = ["open", "closed", "resolved"] as const;
const SORT_KEYS: SortKey[] = ["volume", "end_date", "newest"];

interface Props {
  filters: SearchFilters;
  onChange: (f: SearchFilters) => void;
}

export default function MarketFilters({ filters, onChange }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [inputValue, setInputValue] = useState(filters.query);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { t } = useTranslation("common");

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
      {/* Search input with magnifying glass icon */}
      <div className="relative">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          data-testid="market-search-input"
          placeholder={t("filters.search_placeholder")}
          value={inputValue}
          onChange={(e) => handleQueryChange(e.target.value)}
          className="w-full bg-gray-800 text-white rounded-lg pl-9 pr-4 py-2.5 text-sm outline-none border border-gray-700 focus:border-blue-500"
          aria-label={t("filters.search_label")}
        />
      </div>

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
          {t("filters.all")}
        </button>
        {CATEGORY_KEYS.map((key) => {
          const label = t(`filters.categories.${key}`);
          return (
            <button
              key={key}
              onClick={() => set({ category: filters.category === label ? "" : label })}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filters.category === label
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              {label}
            </button>
          );
        })}

        {/* Status dropdown */}
        <select
          value={filters.status}
          onChange={(e) => set({ status: e.target.value })}
          className="ml-auto bg-gray-800 text-gray-300 text-xs rounded-lg px-3 py-1.5 border border-gray-700 outline-none"
          aria-label={t("filters.filter_by_status")}
        >
          <option value="">{t("filters.all_statuses")}</option>
          {STATUS_KEYS.map((key) => (
            <option key={key} value={key}>
              {t(`filters.statuses.${key}`)}
            </option>
          ))}
        </select>

        {/* Sort dropdown */}
        <select
          value={filters.sort}
          onChange={(e) => set({ sort: e.target.value as SortKey })}
          className="bg-gray-800 text-gray-300 text-xs rounded-lg px-3 py-1.5 border border-gray-700 outline-none"
          aria-label={t("filters.sort_markets")}
        >
          {SORT_KEYS.map((key) => (
            <option key={key} value={key}>
              {t("filters.sort_prefix", { label: t(`filters.sorts.${key}`) })}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
