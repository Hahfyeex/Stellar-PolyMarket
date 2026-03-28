/**
 * Unit tests for BetHistoryTable utilities and component.
 * Covers: sorting, pagination, CSV export output, summary row, loading/error states.
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import Papa from "papaparse";
import BetHistoryTable, {
  sortBets,
  buildCSVRows,
  computeSummary,
  BetRow,
} from "../BetHistoryTable";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ROWS: BetRow[] = [
  {
    id: 1,
    date: "2026-01-03T00:00:00Z",
    marketTitle: "BTC $100k",
    outcomeBetOn: "Yes",
    amountXLM: 100,
    result: "Win",
    payoutReceived: 180,
  },
  {
    id: 2,
    date: "2026-01-01T00:00:00Z",
    marketTitle: "Arsenal win",
    outcomeBetOn: "No",
    amountXLM: 50,
    result: "Loss",
    payoutReceived: 0,
  },
  {
    id: 3,
    date: "2026-01-02T00:00:00Z",
    marketTitle: "ETH flip",
    outcomeBetOn: "Yes",
    amountXLM: 200,
    result: "Pending",
    payoutReceived: 0,
  },
];

// ── sortBets ─────────────────────────────────────────────────────────────────

describe("sortBets", () => {
  it("sorts by amountXLM ascending", () => {
    const result = sortBets(ROWS, "amountXLM", "asc");
    expect(result.map((r) => r.amountXLM)).toEqual([50, 100, 200]);
  });

  it("sorts by amountXLM descending", () => {
    const result = sortBets(ROWS, "amountXLM", "desc");
    expect(result.map((r) => r.amountXLM)).toEqual([200, 100, 50]);
  });

  it("sorts by date ascending", () => {
    const result = sortBets(ROWS, "date", "asc");
    expect(result[0].id).toBe(2);
    expect(result[2].id).toBe(1);
  });

  it("sorts by date descending", () => {
    const result = sortBets(ROWS, "date", "desc");
    expect(result[0].id).toBe(1);
  });

  it("sorts by marketTitle ascending", () => {
    const result = sortBets(ROWS, "marketTitle", "asc");
    expect(result[0].marketTitle).toBe("Arsenal win");
  });

  it("does not mutate the original array", () => {
    const copy = [...ROWS];
    sortBets(ROWS, "amountXLM", "asc");
    expect(ROWS).toEqual(copy);
  });
});

// ── computeSummary ────────────────────────────────────────────────────────────

describe("computeSummary", () => {
  it("computes correct totals", () => {
    const { totalStaked, totalWon, netPnL } = computeSummary(ROWS);
    expect(totalStaked).toBe(350);
    expect(totalWon).toBe(180);
    expect(netPnL).toBeCloseTo(-170);
  });

  it("returns zeros for empty array", () => {
    const { totalStaked, totalWon, netPnL } = computeSummary([]);
    expect(totalStaked).toBe(0);
    expect(totalWon).toBe(0);
    expect(netPnL).toBe(0);
  });

  it("returns positive netPnL when payout exceeds stake", () => {
    const { netPnL } = computeSummary([ROWS[0]]); // staked 100, won 180
    expect(netPnL).toBe(80);
  });
});

// ── buildCSVRows ──────────────────────────────────────────────────────────────

describe("buildCSVRows", () => {
  it("maps all six columns correctly", () => {
    const csv = buildCSVRows([ROWS[0]]);
    expect(csv[0]).toEqual({
      Date: "2026-01-03T00:00:00Z",
      "Market Title": "BTC $100k",
      "Outcome Bet On": "Yes",
      "Amount (XLM)": 100,
      Result: "Win",
      "Payout Received (XLM)": 180,
    });
  });

  it("produces parseable CSV via papaparse", () => {
    const csvString = Papa.unparse(buildCSVRows(ROWS));
    const parsed = Papa.parse<Record<string, string>>(csvString, { header: true });
    expect(parsed.data).toHaveLength(3);
    expect(parsed.meta.fields).toContain("Market Title");
    expect(parsed.meta.fields).toContain("Amount (XLM)");
    expect(parsed.meta.fields).toContain("Payout Received (XLM)");
  });

  it("returns empty array for empty input", () => {
    expect(buildCSVRows([])).toEqual([]);
  });
});

// ── BetHistoryTable component ─────────────────────────────────────────────────

function mockFetch(rows: BetRow[]) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      bets: rows.map((r) => ({
        ...r,
        created_at: r.date,
        market_title: r.marketTitle,
        outcome_label: r.outcomeBetOn,
        amount: String(r.amountXLM),
        payout_received: String(r.payoutReceived),
      })),
    }),
  }) as jest.Mock;
}

describe("BetHistoryTable component", () => {
  beforeEach(() => jest.resetAllMocks());

  it("shows loading state initially", () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as jest.Mock;
    render(<BetHistoryTable walletAddress="GABC" />);
    expect(screen.getByText(/loading bet history/i)).toBeInTheDocument();
  });

  it("shows error state on fetch failure", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as jest.Mock;
    render(<BetHistoryTable walletAddress="GABC" />);
    await waitFor(() => expect(screen.getByText(/failed to fetch bets/i)).toBeInTheDocument());
  });

  it("shows empty state when no bets returned", async () => {
    mockFetch([]);
    render(<BetHistoryTable walletAddress="GABC" />);
    await waitFor(() => expect(screen.getByText(/no bets found/i)).toBeInTheDocument());
  });

  it("renders all six column headers", async () => {
    mockFetch(ROWS);
    render(<BetHistoryTable walletAddress="GABC" />);
    await waitFor(() => expect(screen.getByText("Market")).toBeInTheDocument());
    expect(screen.getByText("Date")).toBeInTheDocument();
    expect(screen.getByText("Outcome")).toBeInTheDocument();
    expect(screen.getByText("Amount (XLM)")).toBeInTheDocument();
    expect(screen.getByText("Result")).toBeInTheDocument();
    expect(screen.getByText("Payout (XLM)")).toBeInTheDocument();
  });

  it("renders market titles in rows", async () => {
    mockFetch(ROWS);
    render(<BetHistoryTable walletAddress="GABC" />);
    await waitFor(() => expect(screen.getByText("BTC $100k")).toBeInTheDocument());
    expect(screen.getByText("Arsenal win")).toBeInTheDocument();
  });

  it("shows sort direction indicator on active column", async () => {
    mockFetch(ROWS);
    render(<BetHistoryTable walletAddress="GABC" />);
    await waitFor(() => expect(screen.getByText("Date")).toBeInTheDocument());
    // Default sort is date desc — indicator should be ↓
    const dateHeader = screen.getByText("Date").closest("th")!;
    expect(dateHeader.textContent).toContain("↓");
  });

  it("toggles sort direction when same column header clicked twice", async () => {
    mockFetch(ROWS);
    render(<BetHistoryTable walletAddress="GABC" />);
    await waitFor(() => expect(screen.getByText("Date")).toBeInTheDocument());
    const dateHeader = screen.getByText("Date").closest("th")!;
    fireEvent.click(dateHeader); // asc
    expect(dateHeader.textContent).toContain("↑");
    fireEvent.click(dateHeader); // desc
    expect(dateHeader.textContent).toContain("↓");
  });

  it("changes active sort column when a different header is clicked", async () => {
    mockFetch(ROWS);
    render(<BetHistoryTable walletAddress="GABC" />);
    await waitFor(() => expect(screen.getByText("Amount (XLM)")).toBeInTheDocument());
    const amountHeader = screen.getByText("Amount (XLM)").closest("th")!;
    fireEvent.click(amountHeader);
    expect(amountHeader.textContent).toContain("↑");
  });

  it("renders summary row with correct totals", async () => {
    mockFetch(ROWS);
    render(<BetHistoryTable walletAddress="GABC" />);
    await waitFor(() => expect(screen.getByText("Totals")).toBeInTheDocument());
    // totalStaked = 350, totalWon = 180, netPnL = -170
    expect(screen.getByText("350.00")).toBeInTheDocument();
    // 180.00 appears in both a data row and the summary footer
    expect(screen.getAllByText("180.00").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/P&L -170\.00/)).toBeInTheDocument();
  });

  it("renders Download CSV button", async () => {
    mockFetch(ROWS);
    render(<BetHistoryTable walletAddress="GABC" />);
    await waitFor(() => expect(screen.getByText(/download csv/i)).toBeInTheDocument());
  });

  it("does not show pagination when rows fit on one page", async () => {
    mockFetch(ROWS); // only 3 rows < 20
    render(<BetHistoryTable walletAddress="GABC" />);
    await waitFor(() => expect(screen.getByText("BTC $100k")).toBeInTheDocument());
    expect(screen.queryByText(/prev/i)).not.toBeInTheDocument();
  });

  it("shows pagination when rows exceed page size", async () => {
    const manyRows: BetRow[] = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1,
      date: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      marketTitle: `Market ${i + 1}`,
      outcomeBetOn: "Yes",
      amountXLM: 10,
      result: "Pending",
      payoutReceived: 0,
    }));
    mockFetch(manyRows);
    render(<BetHistoryTable walletAddress="GABC" />);
    await waitFor(() => expect(screen.getByText(/page 1 of 2/i)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/next/i));
    expect(screen.getByText(/page 2 of 2/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/prev/i));
    expect(screen.getByText(/page 1 of 2/i)).toBeInTheDocument();
  });

  it("triggers CSV download when button clicked", async () => {
    mockFetch(ROWS);
    const createObjectURL = jest.fn(() => "blob:mock");
    const revokeObjectURL = jest.fn();
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURL;

    render(<BetHistoryTable walletAddress="GABC1234" />);
    await waitFor(() => expect(screen.getByText(/download csv/i)).toBeInTheDocument());

    // Spy on anchor click after component is rendered
    const clickMock = jest.fn();
    const origCreate = document.createElement.bind(document);
    jest.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === "a") el.click = clickMock;
      return el;
    });

    fireEvent.click(screen.getByText(/download csv/i));

    expect(createObjectURL).toHaveBeenCalled();
    expect(clickMock).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");
    jest.restoreAllMocks();
  });

  it("renders positive P&L in green", async () => {
    const profitRow: BetRow[] = [
      {
        id: 1,
        date: "2026-01-01T00:00:00Z",
        marketTitle: "Q",
        outcomeBetOn: "Yes",
        amountXLM: 50,
        result: "Win",
        payoutReceived: 200,
      },
    ];
    mockFetch(profitRow);
    render(<BetHistoryTable walletAddress="GABC" />);
    await waitFor(() => expect(screen.getByText(/P&L \+150\.00/)).toBeInTheDocument());
    const pnl = screen.getByText(/P&L \+150\.00/);
    expect(pnl.className).toContain("green");
  });
});
