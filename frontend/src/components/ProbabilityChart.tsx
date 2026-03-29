"use client";
/**
 * ProbabilityChart
 *
 * Large area chart showing probability (price) vs. time for each outcome.
 * Uses Recharts AreaChart with touch-friendly swipe interaction on mobile.
 *
 * Information Hierarchy rationale (Issue #77):
 *   The chart is the primary element because price movement is the single
 *   most actionable signal for a bettor. A user deciding to stake 1,000 XLM
 *   needs to see trend direction and volatility at a glance — before reading
 *   the description or rules. The current price (probability) is the "score"
 *   of the market; everything else is context.
 */
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useEffect, useState, useRef } from "react";
import { useChartTheme } from "../ChartThemeProvider";

interface PricePoint {
  time: string;
  [outcome: string]: string | number;
}

interface Props {
  marketId: number;
  outcomes: string[];
  /** Optional pre-loaded data (for SSR / testing) */
  initialData?: PricePoint[];
}

/** Generate mock probability history until real API endpoint exists */
function generateMockHistory(outcomes: string[], points = 48): PricePoint[] {
  const now = Date.now();
  const interval = 30 * 60 * 1000; // 30-min buckets
  const probs: number[] = outcomes.map(() => Math.random() * 0.6 + 0.2);

  return Array.from({ length: points }, (_, i) => {
    // Normalise so they sum to 1
    const total = probs.reduce((s, p) => s + p, 0);
    const point: PricePoint = {
      time: new Date(now - (points - i) * interval).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
    outcomes.forEach((o, idx) => {
      point[o] = parseFloat(((probs[idx] / total) * 100).toFixed(1));
      // Random walk for next tick
      probs[idx] = Math.max(0.05, Math.min(0.95, probs[idx] + (Math.random() - 0.5) * 0.08));
    });
    return point;
  });
}

/** Custom tooltip */
function ChartTooltip({ active, payload, label }: any) {
  const colors = useChartTheme();
  if (!active || !payload?.length) return null;
  return (
    <div style={{ backgroundColor: colors.tooltipBg, borderColor: colors.tooltipBorder }} className="border rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="font-semibold">
          {p.name}: {p.value}%
        </p>
      ))}
    </div>
  );
}

type TimeRange = "1H" | "6H" | "24H" | "7D" | "ALL";

export default function ProbabilityChart({ marketId, outcomes, initialData }: Props) {
  const [data, setData] = useState<PricePoint[]>(initialData ?? []);
  const [range, setRange] = useState<TimeRange>("24H");
  const colors = useChartTheme();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // TODO: replace with real API call: GET /api/markets/:id/price-history?range=24H
    const pointsMap: Record<TimeRange, number> = { "1H": 12, "6H": 24, "24H": 48, "7D": 84, ALL: 120 };
    setData(generateMockHistory(outcomes, pointsMap[range]));
  }, [marketId, outcomes, range]);

  const ranges: TimeRange[] = ["1H", "6H", "24H", "7D", "ALL"];

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-white font-semibold text-base">Probability Over Time</h2>
        <div className="flex gap-1">
          {ranges.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                range === r
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Chart — touch-swipe enabled via overflow-x-auto on mobile */}
      <div
        ref={containerRef}
        className="w-full overflow-x-auto touch-pan-x"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div style={{ minWidth: 320 }}>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <defs>
{outcomes.map((o, i) => (
                  <linearGradient key={o} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={colors.slices[i % colors.slices.length]} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={colors.slices[i % colors.slices.length]} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
<CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
              <XAxis
                dataKey="time"
                tick={{ fill: colors.axis, fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: colors.axis, fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip content={<ChartTooltip />} />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(v) => <span className="text-gray-300 text-xs">{v}</span>}
              />
              {outcomes.map((o, i) => (
                <Area
                  key={o}
                  type="monotone"
                  dataKey={o}
                  stroke={colors.slices[i % colors.slices.length]}
                  strokeWidth={2}
                  fill={`url(#grad-${i})`}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
