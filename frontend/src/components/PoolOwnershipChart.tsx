"use client";
/**
 * PoolOwnershipChart
 *
 * Renders a Recharts PieChart showing each bettor's fractional share of the pool.
 * Updates live via WebSocket when new bets arrive.
 *
 * Props:
 *   marketId — the market to visualise
 */
// Named imports — webpack tree-shakes unused recharts components via the
// package's sideEffects:false declaration, keeping the bundle lean.
} from "recharts";
import { usePoolOwnership } from "../hooks/usePoolOwnership";
import { useChartTheme } from "./ChartThemeProvider";
import { OwnershipSlice } from "../utils/poolOwnership";

interface Props {
  marketId: number;
}

/** Stella Polymarket design token palette for pie slices */
function sliceColor(index: number, label: string, colors: any): string {
  if (label === "Others") return colors.others;
  return colors.slices[index % colors.slices.length];
}

/** Custom tooltip shown on hover (desktop) and tap (mobile) */
function CustomTooltip({ active, payload }: any) {
  const colors = useChartTheme();
  if (!active || !payload?.length) return null;
  const slice: OwnershipSlice = payload[0].payload;
  return (
    <div
      data-testid="chart-tooltip"
      style={{ backgroundColor: colors.tooltipBg, borderColor: colors.tooltipBorder }}
      className="rounded-lg px-3 py-2 text-xs shadow-lg"
    >
      <p className="text-white font-semibold">{slice.label}</p>
      {slice.wallet && (
        <p className="text-gray-400 font-mono text-[10px] mt-0.5">{slice.wallet}</p>
      )}
      <p className="text-blue-400 mt-1">
        {slice.amount.toFixed(2)} XLM
      </p>
      <p className="text-gray-300">{slice.percentage.toFixed(2)}% of pool</p>
    </div>
  );
}

export default function PoolOwnershipChart({ marketId }: Props) {
  const { slices, totalPool, loading, error } = usePoolOwnership(marketId);

  if (loading) {
    return (
      <div data-testid="pool-chart-loading" className="flex items-center justify-center h-48 text-gray-500 text-sm">
        Loading pool data...
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="pool-chart-error" className="flex items-center justify-center h-48 text-red-400 text-sm">
        {error}
      </div>
    );
  }

  if (!slices.length) {
    return (
      <div data-testid="pool-chart-empty" className="flex items-center justify-center h-48 text-gray-500 text-sm">
        No bets placed yet.
      </div>
    );
  }

  return (
    <div data-testid="pool-ownership-chart" className="space-y-2">
      <div className="flex items-center justify-between text-xs text-gray-400 px-1">
        <span>Pool ownership</span>
        <span className="text-white font-medium">{totalPool.toFixed(2)} XLM total</span>
      </div>

      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="percentage"
              nameKey="label"
              cx="50%"
              cy="50%"
              outerRadius="80%"
              innerRadius="45%"
              paddingAngle={2}
              strokeWidth={0}
            >
              {slices.map((slice, i) => {
                const colors = useChartTheme();
                return (
                  <Cell
                    key={slice.label}
                    fill={sliceColor(i, slice.label, colors)}
                    aria-label={`${slice.label}: ${slice.percentage.toFixed(1)}%`}
                  />
                );
              })}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              iconType="circle"
              iconSize={8}
              formatter={(value) => (
                <span className="text-gray-300 text-xs">{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
