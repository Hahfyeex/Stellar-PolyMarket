"use client";

import { useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export const CHIP_CATEGORIES = [
  "All",
  "Sports",
  "Crypto",
  "Finance",
  "Politics",
  "Weather",
  "Entertainment",
] as const;

export type ChipCategory = (typeof CHIP_CATEGORIES)[number];

interface CategoryFilterChipsProps {
  /** Currently active categories (empty = "All") */
  activeCategories: string[];
  onChange: (categories: string[]) => void;
}

/**
 * CategoryFilterChips
 *
 * Horizontal scrollable row of chip buttons for multi-select category filtering.
 * - "All" chip clears all selections.
 * - Other chips toggle independently (multi-select AND logic).
 * - Active state syncs to/from URL `categories` query param (comma-separated).
 */
export default function CategoryFilterChips({
  activeCategories,
  onChange,
}: CategoryFilterChipsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Sync URL ? state on mount / back-navigation
  useEffect(() => {
    const param = searchParams.get("categories");
    if (param) {
      const fromUrl = param.split(",").filter(Boolean);
      // Only update if different to avoid infinite loop
      if (JSON.stringify(fromUrl.sort()) !== JSON.stringify([...activeCategories].sort())) {
        onChange(fromUrl);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync state ? URL whenever activeCategories changes
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (activeCategories.length > 0) {
      params.set("categories", activeCategories.join(","));
    } else {
      params.delete("categories");
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [activeCategories, router, searchParams]);

  const toggle = useCallback(
    (cat: string) => {
      if (cat === "All") {
        onChange([]);
        return;
      }
      if (activeCategories.includes(cat)) {
        onChange(activeCategories.filter((c) => c !== cat));
      } else {
        onChange([...activeCategories, cat]);
      }
    },
    [activeCategories, onChange]
  );

  const isAllActive = activeCategories.length === 0;

  return (
    <div
      role="group"
      aria-label="Filter by category"
      className="flex gap-2 overflow-x-auto scrollbar-none pb-1"
    >
      {CHIP_CATEGORIES.map((cat) => {
        const isActive = cat === "All" ? isAllActive : activeCategories.includes(cat);
        return (
          <button
            key={cat}
            onClick={() => toggle(cat)}
            aria-pressed={isActive}
            className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
              isActive
                ? "bg-blue-600 text-white"
                : "bg-transparent text-gray-300 border border-gray-600 hover:border-blue-500 hover:text-white"
            }`}
          >
            {cat}
          </button>
        );
      })}
    </div>
  );
}
