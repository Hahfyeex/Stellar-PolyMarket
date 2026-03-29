/**
 * Tests for OddsChart component
 * Covers: range toggle, data fetch per range, loading skeleton,
 *         crosshair tooltip rendering, active button highlight,
 *         fetch error fallback, and responsive container.
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import OddsChart, { OddsPoint } from "../../components/OddsChart";

// ── Recharts mock ─────────────────────────────────────────────────────────────
jest.mock("recharts", () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", null, children);

  return {
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-testid": "responsive-container" }, children),
    AreaChart: ({ children, data }: { children: React.ReactNode; data: OddsPoint[] }) =>
      React.createElement(
        "div",
        { "data-testid": "area-chart", "data-points": data?.length },
        children
      ),
    Area: Passthrough,
    XAxis: Passthrough,
    YAxis: Passthrough,
    CartesianGrid: Passthrough,
    Tooltip: ({ content }: { content: React.ReactElement }) =>
      React.cloneElement(content, {
        active: true,
        label: "12:00",
        payload: [
          { dataKey: "yes", value: 62.5, color: "#22c55e" },
          { dataKey: "no", value: 37.5, color: "#f97316" },
        ],
      }),
    defs: Passthrough,
    linearGradient: Passthrough,
    stop: Passthrough,
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const MOCK_DATA: OddsPoint[] = [
  { timestamp: "12:00", yes: 62.5, no: 37.5 },
  { timestamp: "12:30", yes: 58.0, no: 42.0 },
  { timestamp: "13:00", yes: 65.0, no: 35.0 },
];

function makeFetcher(data: OddsPoint[] = MOCK_DATA) {
  return jest.fn().mockResolvedValue(data);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("OddsChart", () => {
  it("renders the chart container", async () => {
    render(<OddsChart marketId={1} fetcher={makeFetcher()} />);
    await waitFor(() => expect(screen.getByTestId("odds-chart")).toBeInTheDocument());
  });

  it("renders all four time range buttons", async () => {
    render(<OddsChart marketId={1} fetcher={makeFetcher()} />);
    await waitFor(() => screen.getByTestId("area-chart"));
    for (const r of ["1H", "6H", "1D", "All"]) {
      expect(screen.getByTestId(`range-btn-${r}`)).toBeInTheDocument();
    }
  });

  it("highlights the active range button (default 1D)", async () => {
    render(<OddsChart marketId={1} fetcher={makeFetcher()} />);
    await waitFor(() => screen.getByTestId("area-chart"));
    const activeBtn = screen.getByTestId("range-btn-1D");
    expect(activeBtn).toHaveAttribute("aria-pressed", "true");
    expect(activeBtn.className).toContain("bg-blue-600");
  });

  it("shows loading skeleton while fetching", async () => {
    let resolve!: (v: OddsPoint[]) => void;
    const fetcher = jest.fn(
      () =>
        new Promise<OddsPoint[]>((res) => {
          resolve = res;
        })
    );

    render(<OddsChart marketId={1} fetcher={fetcher} />);
    expect(screen.getByTestId("odds-chart")).toBeInTheDocument();
    expect(screen.queryByTestId("area-chart")).not.toBeInTheDocument();

    await act(async () => resolve(MOCK_DATA));
    await waitFor(() => expect(screen.getByTestId("area-chart")).toBeInTheDocument());
  });

  it("fetches data on mount with default range 1D", async () => {
    const fetcher = makeFetcher();
    render(<OddsChart marketId={5} fetcher={fetcher} />);
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith(5, "1D"));
  });

  it("fetches new data when range changes", async () => {
    const fetcher = makeFetcher();
    render(<OddsChart marketId={1} fetcher={fetcher} />);
    await waitFor(() => screen.getByTestId("area-chart"));

    fireEvent.click(screen.getByTestId("range-btn-1H"));
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith(1, "1H"));

    fireEvent.click(screen.getByTestId("range-btn-6H"));
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith(1, "6H"));

    fireEvent.click(screen.getByTestId("range-btn-All"));
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith(1, "All"));
  });

  it("updates active button highlight on range change", async () => {
    const fetcher = makeFetcher();
    render(<OddsChart marketId={1} fetcher={fetcher} />);
    await waitFor(() => screen.getByTestId("area-chart"));

    fireEvent.click(screen.getByTestId("range-btn-6H"));
    await waitFor(() => {
      expect(screen.getByTestId("range-btn-6H")).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByTestId("range-btn-1D")).toHaveAttribute("aria-pressed", "false");
    });
  });

  it("passes fetched data to the chart", async () => {
    render(<OddsChart marketId={1} fetcher={makeFetcher(MOCK_DATA)} />);
    await waitFor(() => {
      expect(screen.getByTestId("area-chart")).toHaveAttribute(
        "data-points",
        String(MOCK_DATA.length)
      );
    });
  });

  it("renders with initialData without calling fetcher", () => {
    const fetcher = jest.fn();
    render(<OddsChart marketId={1} initialData={MOCK_DATA} fetcher={fetcher} />);
    expect(screen.getByTestId("area-chart")).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("falls back to mock data when fetcher throws", async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error("network error"));
    render(<OddsChart marketId={1} fetcher={fetcher} />);
    await waitFor(() => expect(screen.getByTestId("area-chart")).toBeInTheDocument());
  });

  it("renders crosshair tooltip with YES and NO odds and timestamp", async () => {
    render(<OddsChart marketId={1} fetcher={makeFetcher()} />);
    await waitFor(() => screen.getByTestId("area-chart"));

    const tooltip = screen.getByTestId("odds-tooltip");
    expect(tooltip).toHaveTextContent("YES: 62.5%");
    expect(tooltip).toHaveTextContent("NO: 37.5%");
    expect(tooltip).toHaveTextContent("12:00");
  });

  it("renders YES and NO legend labels", async () => {
    render(<OddsChart marketId={1} fetcher={makeFetcher()} />);
    await waitFor(() => screen.getByTestId("area-chart"));
    expect(screen.getByText("YES")).toBeInTheDocument();
    expect(screen.getByText("NO")).toBeInTheDocument();
  });

  it("renders the responsive container for mobile responsiveness", async () => {
    render(<OddsChart marketId={1} fetcher={makeFetcher()} />);
    await waitFor(() => expect(screen.getByTestId("responsive-container")).toBeInTheDocument());
  });
});
