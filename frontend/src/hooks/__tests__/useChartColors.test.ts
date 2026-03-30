import { renderHook, act } from '@testing-library/react';
import { useChartColors, type ChartColors } from '../useChartColors';

// Mock document for theme detection
const mockDocument = {
  documentElement: {
    dataset: { theme: 'dark' }
  }
} as unknown as Document;

Object.defineProperty(global, 'document', {
  value: mockDocument,
  writable: true
});

// Reference palettes for assertions
const DARK_PALETTE: ChartColors = {
  yes: '#22c55e', no: '#f97316', grid: '#1f2937', axis: '#6b7280',
  tooltipBg: '#111827', tooltipBorder: '#374151', cursor: '#4b5563',
  profit: '#4ade80', risk: '#f87171',
  slices: ['#3b82f6','#22c55e','#a855f7','#f59e0b','#ef4444','#06b6d4','#ec4899','#84cc16','#6366f1','#f97316'],
  others: '#4b5563', earnings: 'rgb(34, 197, 94)'
};

const LIGHT_PALETTE: ChartColors = {
  yes: '#059669', no: '#dc2626', grid: '#e5e7eb', axis: '#6b7280',
  tooltipBg: '#f9fafb', tooltipBorder: '#d1d5db', cursor: '#d1d5db',
  profit: '#16a34a', risk: '#b91c1c',
  slices: ['#2563eb','#059669','#8b5cf6','#d97706','#ef4444','#0ea5e9','#ec4899','#65a30d','#6366f1','#f97316'],
  others: '#9ca3af', earnings: 'rgb(34, 197, 94)'
};

describe('useChartColors', () => {
  beforeEach(() => {
    // Reset to dark default
    mockDocument.documentElement.dataset.theme = 'dark';
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('returns dark palette by default', () => {
    const { result } = renderHook(() => useChartColors());
    expect(result.current).toEqual(DARK_PALETTE);
  });

  it('returns light palette when theme is light', () => {
    mockDocument.documentElement.dataset.theme = 'light';
    const { result } = renderHook(() => useChartColors());
    expect(result.current).toEqual(LIGHT_PALETTE);
  });

  it('switches to light palette when data-theme changes to light', async () => {
    const { result } = renderHook(() => useChartColors());
    
    // Trigger theme change
    mockDocument.documentElement.dataset.theme = 'light';
    mockDocument.dispatchEvent(new Event('attributeschange')); // Simulate observer
    
    await act(async () => {
      jest.advanceTimersByTime(0);
    });
    
    expect(result.current).toEqual(LIGHT_PALETTE);
  });

  it('switches back to dark when theme changes back', async () => {
    const { result } = renderHook(() => useChartColors());
    
    // Light → Dark
    mockDocument.documentElement.dataset.theme = 'light';
    await act(async () => jest.advanceTimersByTime(0));
    
    mockDocument.documentElement.dataset.theme = 'dark';
    await act(async () => jest.advanceTimersByTime(0));
    
    expect(result.current).toEqual(DARK_PALETTE);
  });

  it('falls back to dark when invalid theme', () => {
    mockDocument.documentElement.dataset.theme = 'invalid' as any;
    const { result } = renderHook(() => useChartColors());
    expect(result.current).toEqual(DARK_PALETTE);
  });

  it('handles no dataset.theme gracefully', () => {
    delete mockDocument.documentElement.dataset.theme;
    const { result } = renderHook(() => useChartColors());
    expect(result.current).toEqual(DARK_PALETTE);
  });

  it.each([
    { theme: 'dark', expected: DARK_PALETTE.yes },
    { theme: 'light', expected: LIGHT_PALETTE.yes }
  ])('returns correct $theme yes color', ({ theme, expected }) => {
    mockDocument.documentElement.dataset.theme = theme;
    const { result } = renderHook(() => useChartColors());
    expect(result.current.yes).toBe(expected);
  });
});

