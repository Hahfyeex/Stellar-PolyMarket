import { useState, useEffect, useCallback } from 'react';

export interface ChartColors {
  yes: string;
  no: string;
  grid: string;
  axis: string;
  tooltipBg: string;
  tooltipBorder: string;
  cursor: string;
  profit: string;
  risk: string;
  slices: string[];
  others: string;
  earnings: string;
}

const DARK_PALETTE: ChartColors = {
  yes: '#22c55e',
  no: '#f97316',
  grid: '#1f2937',
  axis: '#6b7280',
  tooltipBg: '#111827',
  tooltipBorder: '#374151',
  cursor: '#4b5563',
  profit: '#4ade80',
  risk: '#f87171',
  slices: [
    '#3b82f6', '#22c55e', '#a855f7', '#f59e0b', '#ef4444',
    '#06b6d4', '#ec4899', '#84cc16', '#6366f1', '#f97316'
  ],
  others: '#4b5563',
  earnings: 'rgb(34, 197, 94)'
};

const LIGHT_PALETTE: ChartColors = {
  yes: '#059669',
  no: '#dc2626',
  grid: '#e5e7eb',
  axis: '#6b7280',
  tooltipBg: '#f9fafb',
  tooltipBorder: '#d1d5db',
  cursor: '#d1d5db',
  profit: '#16a34a',
  risk: '#b91c1c',
  slices: [
    '#2563eb', '#059669', '#8b5cf6', '#d97706', '#ef4444',
    '#0ea5e9', '#ec4899', '#65a30d', '#6366f1', '#f97316'
  ],
  others: '#9ca3af',
  earnings: 'rgb(34, 197, 94)'
};

/**
 * useChartColors — Reactively returns theme-aware chart color palette.
 * Detects current theme from document.documentElement.dataset.theme.
 * Auto-updates via MutationObserver when theme toggles.
 * 
 * Issue #429: Dark/Light mode chart color adaptation
 */
export function useChartColors(): ChartColors {
  const [colors, setColors] = useState<ChartColors>(DARK_PALETTE);

  const getTheme = useCallback((): 'dark' | 'light' => {
    return (document.documentElement.dataset.theme as 'dark' | 'light') || 'dark';
  }, []);

  const updateColors = useCallback(() => {
    const theme = getTheme();
    setColors(theme === 'light' ? LIGHT_PALETTE : DARK_PALETTE);
  }, [getTheme]);

  useEffect(() => {
    updateColors();

    // MutationObserver for instant theme change detection
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
          updateColors();
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });

    return () => {
      observer.disconnect();
    };
  }, [updateColors]);

  return colors;
}

