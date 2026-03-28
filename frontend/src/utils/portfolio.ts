export type PortfolioRange = "7d" | "30d" | "all";

export interface PortfolioPosition {
  id: string;
  marketTitle: string;
  stakeAmount: number;
  currentValue: number;
  outcomeLabel: string;
  status: "won" | "lost" | "pending";
  openedAt: string;
  resolvedAt: string | null;
}

export interface PortfolioSummary {
  totalStaked: number;
  totalWon: number;
  totalLost: number;
  netPnl: number;
}

export interface PortfolioChartPoint {
  label: string;
  cumulativePnl: number;
}

export function filterPositionsByRange(
  positions: PortfolioPosition[],
  range: PortfolioRange,
  now = new Date()
): PortfolioPosition[] {
  if (range === "all") return positions;

  const days = range === "7d" ? 7 : 30;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);

  return positions.filter((position) => {
    const relevantDate = position.resolvedAt ?? position.openedAt;
    return new Date(relevantDate) >= cutoff;
  });
}

export function summarizePortfolio(positions: PortfolioPosition[]): PortfolioSummary {
  return positions.reduce(
    (summary, position) => {
      const pnl = position.currentValue - position.stakeAmount;
      summary.totalStaked += position.stakeAmount;
      summary.netPnl += pnl;

      if (position.status === "won") {
        summary.totalWon += position.currentValue;
      }

      if (position.status === "lost") {
        summary.totalLost += Math.max(position.stakeAmount - position.currentValue, 0);
      }

      return summary;
    },
    { totalStaked: 0, totalWon: 0, totalLost: 0, netPnl: 0 }
  );
}

export function buildCumulativePnlSeries(
  positions: PortfolioPosition[]
): PortfolioChartPoint[] {
  let running = 0;

  return positions
    .filter((position) => position.resolvedAt)
    .sort(
      (left, right) =>
        new Date(left.resolvedAt ?? left.openedAt).getTime() -
        new Date(right.resolvedAt ?? right.openedAt).getTime()
    )
    .map((position) => {
      running += position.currentValue - position.stakeAmount;
      return {
        label: new Date(position.resolvedAt ?? position.openedAt).toLocaleDateString(),
        cumulativePnl: Number(running.toFixed(2)),
      };
    });
}
