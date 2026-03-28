import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import PortfolioDashboard from "../PortfolioDashboard";
import { PortfolioPosition } from "../../utils/portfolio";

jest.mock("recharts", () => ({
  ResponsiveContainer: () => <div data-testid="mock-chart" />,
  AreaChart: () => <div />,
  Area: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
}));

const BASE_POSITIONS: PortfolioPosition[] = [
  {
    id: "1",
    marketTitle: "Resolved win",
    stakeAmount: 100,
    currentValue: 150,
    outcomeLabel: "Yes",
    status: "won",
    openedAt: "2026-03-01T10:00:00.000Z",
    resolvedAt: "2026-03-03T10:00:00.000Z",
  },
  {
    id: "2",
    marketTitle: "Resolved loss",
    stakeAmount: 80,
    currentValue: 0,
    outcomeLabel: "No",
    status: "lost",
    openedAt: "2026-03-04T10:00:00.000Z",
    resolvedAt: "2026-03-05T10:00:00.000Z",
  },
  {
    id: "3",
    marketTitle: "Pending trade",
    stakeAmount: 40,
    currentValue: 55,
    outcomeLabel: "Yes",
    status: "pending",
    openedAt: "2026-03-26T10:00:00.000Z",
    resolvedAt: null,
  },
];

describe("PortfolioDashboard", () => {
  it("renders summary stats and color-coded rows", () => {
    render(<PortfolioDashboard positions={BASE_POSITIONS} />);

    expect(screen.getByText(/Total staked/i)).toBeInTheDocument();
    expect(screen.getByText("Resolved win")).toBeInTheDocument();
    expect(screen.getByText("Resolved win").closest("tr")).toHaveAttribute("data-status", "won");
    expect(screen.getByText("Resolved loss").closest("tr")).toHaveAttribute("data-status", "lost");
    expect(screen.getByText("Pending trade").closest("tr")).toHaveAttribute("data-status", "pending");
  });

  it("updates the chart when a new resolved market is added", () => {
    const { rerender } = render(<PortfolioDashboard positions={BASE_POSITIONS} />);
    expect(screen.getByTestId("chart-point-count")).toHaveTextContent("2 points");

    rerender(
      <PortfolioDashboard
        positions={[
          ...BASE_POSITIONS,
          {
            id: "4",
            marketTitle: "Late winner",
            stakeAmount: 60,
            currentValue: 120,
            outcomeLabel: "Yes",
            status: "won",
            openedAt: "2026-03-27T10:00:00.000Z",
            resolvedAt: "2026-03-28T10:00:00.000Z",
          },
        ]}
      />
    );

    expect(screen.getByTestId("chart-point-count")).toHaveTextContent("3 points");
  });

  it("filters positions when the date range changes", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-03-28T12:00:00.000Z"));
    render(<PortfolioDashboard positions={BASE_POSITIONS} />);

    fireEvent.click(screen.getByRole("button", { name: /last 7 days/i }));

    expect(screen.queryByText("Resolved win")).not.toBeInTheDocument();
    expect(screen.getByText("Pending trade")).toBeInTheDocument();
    expect(screen.queryByText("Resolved loss")).not.toBeInTheDocument();

    jest.useRealTimers();
  });
});
