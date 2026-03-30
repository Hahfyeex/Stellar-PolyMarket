/**
 * Unit tests for BetHistoryFilters utilities and component.
 * Covers: applyFilters, countActiveFilters, URL sync helpers, component rendering.
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import BetHistoryFilters, {
  applyFilters,
  countActiveFilters,
  filtersToParams,
  paramsToFilters,
  DEFAULT_FILTERS,
  FilterState,
} from "../BetHistoryFilters";
import { BetRow } from "../BetHistoryTable";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ROWS: BetRow[] = [
  {
    id: 1,
    date: "2026-01-15T00:00:00Z",
    marketTitle: "BTC $100k crypto",
    outcomeBetOn: "Yes",
    amountXLM: 100,
    result: "Win",
    payoutReceived: 180,
  },
  {
    id: 2,
    date: "2026-02-10T00:00:00Z",
    marketTitle: "Arsenal win sports",
    outcomeBetOn: "No",
    amountXLM: 50,
    result: "Loss",
    payoutReceived: 0,
  },
  {
    id: 3,
    date: "2026-03-01T00:00:00Z",
    marketTitle: "ETH flip crypto",
    outcomeBetOn: "Yes",
    amountXLM: 200,
    result: "Pending",
    payoutReceived: 0,
  },
];

// ── applyFilters ──────────────────────────────────────────────────────────────

describe("applyFilters", () => {
  it("returns all rows when no filters active", () => {
    expect(applyFilters(ROWS, DEFAULT_FILTERS)).toHaveLength(3);
  });

  it("filters by startDate — excludes rows before start", () => {
    const result = applyFilters(ROWS, { ...DEFAULT_FILTERS, startDate: "2026-02-01" });
    expect(result.map((r) => r.id)).toEqual([2, 3]);
  });

  it("filters by endDate — excludes rows after end", () => {
    const result = applyFilters(ROWS, { ...DEFAULT_FILTERS, endDate: "2026-01-31" });
    expect(result.map((r) => r.id)).toEqual([1]);
  });

  it("filters by date range", () => {
    const result = applyFilters(ROWS, {
      ...DEFAULT_FILTERS,
      startDate: "2026-01-10",
      endDate: "2026-02-15",
    });
    expect(result.map((r) => r.id)).toEqual([1, 2]);
  });

  it("filters by outcome Win", () => {
    const result = applyFilters(ROWS, { ...DEFAULT_FILTERS, outcome: "Win" });
    expect(result).toHaveLength(1);
    expect(result[0].result).toBe("Win");
  });

  it("filters by outcome Loss", () => {
    const result = applyFilters(ROWS, { ...DEFAULT_FILTERS, outcome: "Loss" });
    expect(result).toHaveLength(1);
    expect(result[0].result).toBe("Loss");
  });

  it("filters by outcome Pending", () => {
    const result = applyFilters(ROWS, { ...DEFAULT_FILTERS, outcome: "Pending" });
    expect(result).toHaveLength(1);
    expect(result[0].result).toBe("Pending");
  });

  it("filters by category (case-insensitive)", () => {
    const result = applyFilters(ROWS, { ...DEFAULT_FILTERS, category: "CRYPTO" });
    expect(result.map((r) => r.id)).toEqual([1, 3]);
  });

  it("returns empty array when no rows match", () => {
    const result = applyFilters(ROWS, { ...DEFAULT_FILTERS, outcome: "Win", category: "sports" });
    expect(result).toHaveLength(0);
  });
});

// ── countActiveFilters ────────────────────────────────────────────────────────

describe("countActiveFilters", () => {
  it("returns 0 for default filters", () => {
    expect(countActiveFilters(DEFAULT_FILTERS)).toBe(0);
  });

  it("counts each active filter", () => {
    expect(
      countActiveFilters({
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        outcome: "Win",
        category: "crypto",
      })
    ).toBe(4);
  });

  it("does not count outcome=All", () => {
    expect(countActiveFilters({ ...DEFAULT_FILTERS, outcome: "All" })).toBe(0);
  });
});

// ── URL sync helpers ──────────────────────────────────────────────────────────

describe("filtersToParams / paramsToFilters", () => {
  it("round-trips filters through URL params", () => {
    const f: FilterState = {
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      outcome: "Win",
      category: "crypto",
    };
    const params = filtersToParams(f);
    expect(paramsToFilters(params)).toEqual(f);
  });

  it("omits default values from params", () => {
    const params = filtersToParams(DEFAULT_FILTERS);
    expect(params.toString()).toBe("");
  });

  it("restores defaults from empty params", () => {
    expect(paramsToFilters(new URLSearchParams())).toEqual(DEFAULT_FILTERS);
  });

  it("does not include outcome=All in params", () => {
    const params = filtersToParams({ ...DEFAULT_FILTERS, outcome: "All" });
    expect(params.has("outcome")).toBe(false);
  });
});

// ── BetHistoryFilters component ───────────────────────────────────────────────

describe("BetHistoryFilters component", () => {
  const noop = jest.fn();

  it("renders Filters button", () => {
    render(<BetHistoryFilters filters={DEFAULT_FILTERS} onChange={noop} onClear={noop} />);
    expect(screen.getByRole("button", { name: /filters/i })).toBeInTheDocument();
  });

  it("shows active filter badge when filters are active", () => {
    render(
      <BetHistoryFilters
        filters={{ ...DEFAULT_FILTERS, outcome: "Win", category: "crypto" }}
        onChange={noop}
        onClear={noop}
      />
    );
    expect(screen.getByTestId("filter-badge")).toHaveTextContent("2");
  });

  it("does not show badge when no filters active", () => {
    render(<BetHistoryFilters filters={DEFAULT_FILTERS} onChange={noop} onClear={noop} />);
    expect(screen.queryByTestId("filter-badge")).not.toBeInTheDocument();
  });

  it("toggles filter bar on button click", () => {
    render(<BetHistoryFilters filters={DEFAULT_FILTERS} onChange={noop} onClear={noop} />);
    expect(screen.queryByLabelText("Start date")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /filters/i }));
    expect(screen.getByLabelText("Start date")).toBeInTheDocument();
  });

  it("shows Clear Filters button when filters are active", () => {
    render(
      <BetHistoryFilters
        filters={{ ...DEFAULT_FILTERS, outcome: "Win" }}
        onChange={noop}
        onClear={noop}
      />
    );
    expect(screen.getByRole("button", { name: /clear filters/i })).toBeInTheDocument();
  });

  it("calls onClear when Clear Filters is clicked", () => {
    const onClear = jest.fn();
    render(
      <BetHistoryFilters
        filters={{ ...DEFAULT_FILTERS, outcome: "Win" }}
        onChange={noop}
        onClear={onClear}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /clear filters/i }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("calls onChange when outcome is changed", () => {
    const onChange = jest.fn();
    render(<BetHistoryFilters filters={DEFAULT_FILTERS} onChange={onChange} onClear={noop} />);
    fireEvent.click(screen.getByRole("button", { name: /filters/i }));
    fireEvent.change(screen.getByLabelText("Outcome filter"), { target: { value: "Win" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ outcome: "Win" }));
  });

  it("calls onChange when start date is changed", () => {
    const onChange = jest.fn();
    render(<BetHistoryFilters filters={DEFAULT_FILTERS} onChange={onChange} onClear={noop} />);
    fireEvent.click(screen.getByRole("button", { name: /filters/i }));
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-01-01" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ startDate: "2026-01-01" }));
  });
});
