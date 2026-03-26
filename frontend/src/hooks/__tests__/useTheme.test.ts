/**
 * @jest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react';
import { useTheme } from '../useTheme';

describe('useTheme Hook', () => {
  beforeEach(() => {
    // Reset local storage
    localStorage.clear();

    // Reset document element attributes
    document.documentElement.removeAttribute('data-theme');

    // Mock matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(), // deprecated
        removeListener: jest.fn(), // deprecated
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with light theme if system prefers light and no local storage', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('should initialize with dark theme if system prefers dark and no local storage', () => {
    // Mock system preference
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: query === '(prefers-color-scheme: dark)',
    }));

    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('should prefer local storage over system preference (light stored)', () => {
    localStorage.setItem('stella_theme', 'light');
    window.matchMedia = jest.fn().mockImplementation(() => ({
      matches: true, // System prefers dark
    }));

    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('should prefer local storage over system preference (dark stored)', () => {
    localStorage.setItem('stella_theme', 'dark');
    window.matchMedia = jest.fn().mockImplementation(() => ({
      matches: false, // System prefers light
    }));

    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('should toggle theme from light to dark', () => {
    const { result } = renderHook(() => useTheme());
    // Initial is light
    
    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe('dark');
    expect(localStorage.getItem('stella_theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('should toggle theme from dark to light', () => {
    localStorage.setItem('stella_theme', 'dark');
    const { result } = renderHook(() => useTheme());
    // Initial is dark

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe('light');
    expect(localStorage.getItem('stella_theme')).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
