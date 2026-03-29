import React, { createContext, useContext, ReactNode, useMemo } from "react";
import { useChartColors, type ChartColors } from "../hooks/useChartColors";

/**
 * ChartThemeContext — Provides theme-aware colors to all descendant charts.
 * Wrap root layout or page: <ChartThemeProvider><MarketDetailPage /></ChartThemeProvider>
 *
 * Issue #429: Centralizes color management, auto-re-renders charts on theme toggle.
 */
interface ChartThemeContextType {
  colors: ChartColors;
}

const ChartThemeContext = createContext<ChartThemeContextType | undefined>(undefined);

interface Props {
  children: ReactNode;
}

export function ChartThemeProvider({ children }: Props) {
  const rawColors = useChartColors();

  // Memoize to prevent unnecessary re-renders
  const value = useMemo(
    () => ({
      colors: rawColors,
    }),
    [rawColors]
  );

  return <ChartThemeContext.Provider value={value}>{children}</ChartThemeContext.Provider>;
}

/**
 * useChartTheme — Consuming hook for charts. Throws if used outside provider.
 */
export function useChartTheme(): ChartColors {
  const context = useContext(ChartThemeContext);
  if (context === undefined) {
    throw new Error("useChartTheme must be used within ChartThemeProvider");
  }
  return context.colors;
}
