"use client";

import { useEffect, useState, useCallback } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  TooltipProps,
} from "recharts";
import Skeleton from "./Skeleton";
import { useChartTheme } from "./ChartThemeProvider";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TimeRange = "1H" | "6H" | "1D" | "All";

export interface OddsPoint {
  timestamp: string;
  yes: number;
  no: number;
}

interface Props {
  marketId: number;
  /** Optional pre-loaded data (SSR / testing) */
  initialData?: OddsPoint[];
  /** Override fetch function (testing) */
  fetcher?: (marketId: number, range: TimeRange) => Promise<OddsPoint[]>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const RANGES: TimeRange[] = ["1H", "6H", "1D", "All"];

// ── Mock data generator (used until real API exists) ──────────────────────────

function generateMockData(range: TimeRange): OddsPoint[] {
  const pointsMap: Record<TimeRange, number> = { "1H": 12, "6H": 24, "1D": 48, All: 96 };
  const intervalMs: Record<TimeRange, number> = {
    "1H": 5 * 60 * 1000,
    "6H": 15 * 60 * 1000,
    "1D": 30 * 60 * 1000,
    All: 60 * 60 * 1000,
  };
  const points = pointsMap[range];
  const interval = intervalMs[range];
  const now = Date.now();

  let yes = 50 + (Math.random() - 0.5) * 20;

  return Array.from({ length: points }, (_, i) => {
    yes = Math.max(5, Math.min(95, yes + (Math.random() - 0.5) * 6));
    const no = parseFloat((100 - yes).toFixed(1));
    const ts = new Date(now - (points - i) * interval);

    const label =
      range === "All" || range === "1D"
        ? ts.toLocaleDateString([], { month: "short", day: "numeric" })
        : ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    return { timestamp: label, yes: parseFloat(yes.toFixed(1)), no };
  });
}

// ── Default fetcher (real API) ────────────────────────────────────────────────

async function defaultFetcher(marketId: number, range: TimeRange): Promise<OddsPoint[]> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/markets/${marketId}/stats?range=${range}`
  );
  if (!res.ok) throw new Error("Failed to fetch odds history");
  return res.json();
}

// ── Crosshair Tooltip ─────────────────────────────────────────────────────────

function CrosshairTooltip({ active, payload, label }: TooltipProps<number, string>) {
  const colors = useChartTheme();
  if (!active || !payload?.length) return null;
  const yes = payload.find((p) => p.dataKey === "yes");
  const no = payload.find((p) => p.dataKey === "no");
  return (
    <div
      data-testid="odds-tooltip"
      style={{
        backgroundColor: colors.tooltipBg,
        borderColor: colors.tooltipBorder,
        color: "white",
      }}
      className="rounded-lg px-3 py-2 text-xs shadow-xl space-y-1"
    >
      <p className="text-gray-400">{label}</p>
      {yes && (
        <p style={{ color: colors.yes }} className="font-semibold">
          YES: {yes.value}%
        </p>
      )}
      {no && (
        <p style={{ color: colors.no }} className="font-semibold">
          NO: {no.value}%
        </p>
      )}
    </div>
  );
}

// ── OddsChart ─────────────────────────────────────────────────────────────────

export default function OddsChart({ marketId, initialData, fetcher = defaultFetcher }: Props) {
  const [range, setRange] = useState<TimeRange>("1D");
  const [data, setData] = useState<OddsPoint[]>(initialData ?? []);
  const [loading, setLoading] = useState(!initialData);
  const colors = useChartTheme();

  const loadData = useCallback(
    async (r: TimeRange) => {
      setLoading(true);
      try {
        const result = await fetcher(marketId, r);
        setData(result);
      } catch {
        // Fallback to mock data so the chart is always renderable
        setData(generateMockData(r));
      } finally {
        setLoading(false);
      }
    },
    [marketId, fetcher]
  );

  useEffect(() => {
    if (!initialData) loadData(range);
  }, [range, loadData, initialData]);

  function handleRangeChange(r: TimeRange) {
    setRange(r);
    loadData(r);
  }

  return (
    <div
      data-testid="odds-chart"
      className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-3"
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-white font-semibold text-base">Odds History</h2>

        {/* Time range toggle */}
        <div className="flex gap-1" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button
              key={r}
              data-testid={`range-btn-${r}`}
              onClick={() => handleRangeChange(r)}
              aria-pressed={range === r}
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

      {/* Legend */}
      <div className="flex gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: colors.yes }}
          />
          <span className="text-gray-300">YES</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: colors.no }}
          />
          <span className="text-gray-300">NO</span>
        </span>
      </div>

      {/* Chart or skeleton */}
      {loading ? (
        <Skeleton data-testid="odds-chart-skeleton" className="h-64 w-full rounded-lg" />
      ) : (
        <div
          className="w-full overflow-x-auto touch-pan-x"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div style={{ minWidth: 300 }}>
            <ResponsiveContainer width="100%" height={256}>
              <AreaChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradYes" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={YES_COLOR} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={YES_COLOR} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradNo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={NO_COLOR} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={NO_COLOR} stopOpacity={0} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />

                <XAxis
                  dataKey="timestamp"
                  tick={{ fill: "#6b7280", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: "#6b7280", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}%`}
                />

                <Tooltip
                  content={<CrosshairTooltip />}
                  cursor={{ stroke: "#4b5563", strokeWidth: 1, strokeDasharray: "4 2" }}
                />

                <Area
                  type="monotone"
                  dataKey="yes"
                  stroke={YES_COLOR}
                  strokeWidth={2}
                  fill="url(#gradYes)"
                  dot={false}
                  activeDot={{ r: 4, fill: YES_COLOR }}
                />
                <Area
                  type="monotone"
                  dataKey="no"
                  stroke={NO_COLOR}
                  strokeWidth={2}
                  fill="url(#gradNo)"
                  dot={false}
                  activeDot={{ r: 4, fill: NO_COLOR }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
