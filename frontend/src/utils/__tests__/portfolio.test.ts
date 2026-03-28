import {
  buildCumulativePnlSeries,
  filterPositionsByRange,
  summarizePortfolio,
  type PortfolioPosition,
} from "../portfolio";

const POSITIONS: PortfolioPosition[] = [
  {
    id: "1",
    marketTitle: "Winner",
    stakeAmount: 100,
    currentValue: 160,
    outcomeLabel: "Yes",
    status: "won",
    openedAt: "2026-03-01T12:00:00.000Z",
    resolvedAt: "2026-03-03T12:00:00.000Z",
  },
  {
    id: "2",
    marketTitle: "Loser",
    stakeAmount: 50,
    currentValue: 0,
    outcomeLabel: "No",
    status: "lost",
    openedAt: "2026-03-10T12:00:00.000Z",
    resolvedAt: "2026-03-15T12:00:00.000Z",
  },
  {
    id: "3",
    marketTitle: "Pending",
    stakeAmount: 0,
    currentValue: 0,
    outcomeLabel: "Yes",
    status: "pending",
    openedAt: "2026-03-25T12:00:00.000Z",
    resolvedAt: null,
  },
];

describe("portfolio utils", () => {
  it("summarizes wins, losses, and net pnl", () => {
    expect(summarizePortfolio(POSITIONS)).toEqual({
      totalStaked: 150,
      totalWon: 160,
      totalLost: 50,
      netPnl: 10,
    });
  });

  it("handles zero stake and full loss edge cases", () => {
    expect(
      summarizePortfolio([
        {
          id: "zero",
          marketTitle: "Zero",
          stakeAmount: 0,
          currentValue: 0,
          outcomeLabel: "Yes",
          status: "pending",
          openedAt: "2026-03-01T00:00:00.000Z",
          resolvedAt: null,
        },
        {
          id: "loss",
          marketTitle: "Full loss",
          stakeAmount: 40,
          currentValue: 0,
          outcomeLabel: "No",
          status: "lost",
          openedAt: "2026-03-02T00:00:00.000Z",
          resolvedAt: "2026-03-05T00:00:00.000Z",
        },
      ])
    ).toEqual({
      totalStaked: 40,
      totalWon: 0,
      totalLost: 40,
      netPnl: -40,
    });
  });

  it("builds cumulative pnl using only resolved markets", () => {
    expect(buildCumulativePnlSeries(POSITIONS)).toEqual([
      { label: new Date("2026-03-03T12:00:00.000Z").toLocaleDateString(), cumulativePnl: 60 },
      { label: new Date("2026-03-15T12:00:00.000Z").toLocaleDateString(), cumulativePnl: 10 },
    ]);
  });

  it("filters positions by selected date range", () => {
    const filtered = filterPositionsByRange(
      POSITIONS,
      "7d",
      new Date("2026-03-28T12:00:00.000Z")
    );
    expect(filtered.map((position) => position.id)).toEqual(["3"]);
  });
});
