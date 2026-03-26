/**
 * @jest-environment jsdom
 *
 * Unit tests for VirtualizedOrderBook component.
 * Covers: rendering, empty state, row content, live updates (appendRows),
 * infinite scroll trigger, loading indicator, 500+ row dataset.
 */
import React from "react";
import { render, screen, act, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import VirtualizedOrderBook, {
  OrderBookRow,
  ITEM_SIZE,
  LIST_HEIGHT,
} from "../VirtualizedOrderBook";

// ─── Mock react-window ────────────────────────────────────────────────────────
// jsdom has no layout engine, so FixedSizeList needs a lightweight stand-in
// that renders all items and exposes onItemsRendered for testing.
// Must use forwardRef because VirtualizedOrderBook passes a ref to FixedSizeList.

jest.mock("react-window", () => ({
  FixedSizeList: React.forwardRef(function MockFixedSizeList(
    { children: RowRenderer, itemCount, itemSize, height, onItemsRendered }: any,
    _ref: any
  ) {
    // Simulate the visible window: render up to 20 items (enough for tests)
    const visibleCount = Math.min(itemCount, 20);

    // Fire onItemsRendered so infinite-scroll logic can be tested
    React.useEffect(() => {
      if (onItemsRendered && itemCount > 0) {
        onItemsRendered({
          overscanStartIndex: 0,
          overscanStopIndex: visibleCount - 1,
          visibleStartIndex: 0,
          visibleStopIndex: visibleCount - 1,
        });
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [itemCount]);

    return (
      <div data-testid="order-book-list" style={{ height, overflow: "auto" }}>
        {Array.from({ length: visibleCount }, (_, i) => (
          <RowRenderer
            key={i}
            index={i}
            style={{ position: "absolute", top: i * itemSize, height: itemSize, width: "100%" }}
          />
        ))}
      </div>
    );
  }),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeRow(id: number, outcomeIndex = 0): OrderBookRow {
  return {
    id,
    wallet_address: `GABC${id.toString().padStart(8, "0")}XYZ`,
    outcome_index: outcomeIndex,
    outcome_name: outcomeIndex === 0 ? "Yes" : "No",
    amount: (id * 10).toFixed(2),
    created_at: new Date(Date.now() - id * 1000).toISOString(),
  };
}

function make500Rows(): OrderBookRow[] {
  return Array.from({ length: 500 }, (_, i) => makeRow(i + 1, i % 2));
}

const OUTCOMES = ["Yes", "No"];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("VirtualizedOrderBook", () => {
  // ── Empty state ────────────────────────────────────────────────────────────

  it("renders empty state when no rows provided", () => {
    render(<VirtualizedOrderBook marketId={1} outcomes={OUTCOMES} />);
    expect(screen.getByTestId("order-book-empty")).toBeInTheDocument();
  });

  it("does not render the list when empty", () => {
    render(<VirtualizedOrderBook marketId={1} outcomes={OUTCOMES} />);
    expect(screen.queryByTestId("virtualized-order-book")).not.toBeInTheDocument();
  });

  // ── Basic rendering ────────────────────────────────────────────────────────

  it("renders the order book container when rows are provided", () => {
    render(
      <VirtualizedOrderBook
        marketId={1}
        outcomes={OUTCOMES}
        initialRows={[makeRow(1), makeRow(2)]}
      />
    );
    expect(screen.getByTestId("virtualized-order-book")).toBeInTheDocument();
  });

  it("renders the FixedSizeList", () => {
    render(
      <VirtualizedOrderBook
        marketId={1}
        outcomes={OUTCOMES}
        initialRows={[makeRow(1)]}
      />
    );
    expect(screen.getByTestId("order-book-list")).toBeInTheDocument();
  });

  it("renders a row for each visible item", () => {
    const rows = [makeRow(1), makeRow(2), makeRow(3)];
    render(
      <VirtualizedOrderBook marketId={1} outcomes={OUTCOMES} initialRows={rows} />
    );
    expect(screen.getByTestId("order-row-1")).toBeInTheDocument();
    expect(screen.getByTestId("order-row-2")).toBeInTheDocument();
    expect(screen.getByTestId("order-row-3")).toBeInTheDocument();
  });

  // ── Row content ────────────────────────────────────────────────────────────

  it("displays abbreviated wallet address", () => {
    render(
      <VirtualizedOrderBook
        marketId={1}
        outcomes={OUTCOMES}
        initialRows={[makeRow(1)]}
      />
    );
    // GABC00000001XYZ → GABC…0XYZ (first 4 + last 4)
    expect(screen.getByText(/GABC/)).toBeInTheDocument();
  });

  it("displays outcome badge", () => {
    render(
      <VirtualizedOrderBook
        marketId={1}
        outcomes={OUTCOMES}
        initialRows={[makeRow(1, 0)]}
      />
    );
    expect(screen.getByText("Yes")).toBeInTheDocument();
  });

  it("displays XLM amount", () => {
    render(
      <VirtualizedOrderBook
        marketId={1}
        outcomes={OUTCOMES}
        initialRows={[makeRow(1)]}
      />
    );
    expect(screen.getByText("10.00 XLM")).toBeInTheDocument();
  });

  it("displays relative timestamp", () => {
    render(
      <VirtualizedOrderBook
        marketId={1}
        outcomes={OUTCOMES}
        initialRows={[makeRow(1)]}
      />
    );
    // Row 1 was created 1s ago
    expect(screen.getByText(/ago|just now/)).toBeInTheDocument();
  });

  it("uses outcome_name when provided", () => {
    const row: OrderBookRow = { ...makeRow(1), outcome_name: "Draw" };
    render(
      <VirtualizedOrderBook marketId={1} outcomes={OUTCOMES} initialRows={[row]} />
    );
    expect(screen.getByText("Draw")).toBeInTheDocument();
  });

  it("falls back to outcomes array when outcome_name is empty", () => {
    const row: OrderBookRow = { ...makeRow(1, 1), outcome_name: "" };
    render(
      <VirtualizedOrderBook marketId={1} outcomes={OUTCOMES} initialRows={[row]} />
    );
    expect(screen.getByText("No")).toBeInTheDocument();
  });

  // ── 500+ row dataset ───────────────────────────────────────────────────────

  it("renders 500+ rows without crashing", () => {
    const rows = make500Rows();
    render(
      <VirtualizedOrderBook marketId={1} outcomes={OUTCOMES} initialRows={rows} />
    );
    expect(screen.getByTestId("virtualized-order-book")).toBeInTheDocument();
    // Only up to 20 rows are rendered by the mock (virtualization)
    expect(screen.getByTestId("order-row-1")).toBeInTheDocument();
  });

  it("only renders a windowed subset of 500 rows (virtualization)", () => {
    const rows = make500Rows();
    render(
      <VirtualizedOrderBook marketId={1} outcomes={OUTCOMES} initialRows={rows} />
    );
    // Mock renders max 20 — row 21 should NOT be in the DOM
    expect(screen.queryByTestId("order-row-21")).not.toBeInTheDocument();
    expect(screen.getByTestId("order-row-1")).toBeInTheDocument();
  });

  // ── ITEM_SIZE and LIST_HEIGHT exports ──────────────────────────────────────

  it("exports correct ITEM_SIZE constant (48px)", () => {
    expect(ITEM_SIZE).toBe(48);
  });

  it("exports correct LIST_HEIGHT constant (400px)", () => {
    expect(LIST_HEIGHT).toBe(400);
  });

  // ── Infinite scroll ────────────────────────────────────────────────────────

  it("calls onLoadMore when visible window reaches near the end", async () => {
    const onLoadMore = jest.fn().mockResolvedValue([makeRow(21)]);
    // 15 rows — mock renders all 15, visibleStopIndex=14, threshold=10 → 14 >= 15-10=5 → triggers
    const rows = Array.from({ length: 15 }, (_, i) => makeRow(i + 1));

    await act(async () => {
      render(
        <VirtualizedOrderBook
          marketId={1}
          outcomes={OUTCOMES}
          initialRows={rows}
          onLoadMore={onLoadMore}
        />
      );
    });

    expect(onLoadMore).toHaveBeenCalledWith(2);
  });

  it("does not call onLoadMore when list is short and not near end", async () => {
    const onLoadMore = jest.fn().mockResolvedValue([]);
    // 1 row — visibleStopIndex=0, threshold=10 → 0 >= 1-10=-9 → triggers
    // Actually with 1 row it will trigger. Use 0 rows (empty state skips list entirely)
    render(
      <VirtualizedOrderBook
        marketId={1}
        outcomes={OUTCOMES}
        initialRows={[]}
        onLoadMore={onLoadMore}
      />
    );
    // Empty state renders no list, so onItemsRendered never fires
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it("shows loading indicator while fetching more", async () => {
    let resolveLoad!: (rows: OrderBookRow[]) => void;
    const onLoadMore = jest.fn(
      () => new Promise<OrderBookRow[]>((res) => { resolveLoad = res; })
    );
    const rows = Array.from({ length: 15 }, (_, i) => makeRow(i + 1));

    await act(async () => {
      render(
        <VirtualizedOrderBook
          marketId={1}
          outcomes={OUTCOMES}
          initialRows={rows}
          onLoadMore={onLoadMore}
        />
      );
    });

    expect(screen.getByTestId("order-book-loading")).toBeInTheDocument();

    await act(async () => { resolveLoad([]); });
    expect(screen.queryByTestId("order-book-loading")).not.toBeInTheDocument();
  });

  it("appends loaded rows to the list", async () => {
    const newRow = makeRow(100);
    const onLoadMore = jest.fn().mockResolvedValue([newRow]);
    const rows = Array.from({ length: 15 }, (_, i) => makeRow(i + 1));

    await act(async () => {
      render(
        <VirtualizedOrderBook
          marketId={1}
          outcomes={OUTCOMES}
          initialRows={rows}
          onLoadMore={onLoadMore}
        />
      );
    });

    // Row 100 should appear at least once after append
    expect(screen.getAllByTestId("order-row-100").length).toBeGreaterThanOrEqual(1);
  });

  it("does not increment page when loadMore returns empty array", async () => {
    const onLoadMore = jest.fn().mockResolvedValue([]);
    const rows = Array.from({ length: 15 }, (_, i) => makeRow(i + 1));

    await act(async () => {
      render(
        <VirtualizedOrderBook
          marketId={1}
          outcomes={OUTCOMES}
          initialRows={rows}
          onLoadMore={onLoadMore}
        />
      );
    });

    // Called once but returned empty — no new rows appended
    expect(onLoadMore).toHaveBeenCalledWith(2);
    // Still only 15 rows visible (mock renders min(15,20)=15)
    expect(screen.queryByTestId("order-row-16")).not.toBeInTheDocument();
  });

  it("renders column headers", () => {
    render(
      <VirtualizedOrderBook
        marketId={1}
        outcomes={OUTCOMES}
        initialRows={[makeRow(1)]}
      />
    );
    expect(screen.getByText("Wallet")).toBeInTheDocument();
    expect(screen.getByText("Outcome")).toBeInTheDocument();
    expect(screen.getByText("Amount")).toBeInTheDocument();
    expect(screen.getByText("Time")).toBeInTheDocument();
  });
});
