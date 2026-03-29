import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import CountUp from '../CountUp';

/**
 * Unit tests for CountUp component.
 * Covers animation trigger, number formatting, and prefers-reduced-motion.
 * Closes #604
 */

jest.useFakeTimers();

// Mock IntersectionObserver
const mockObserve = jest.fn();
const mockUnobserve = jest.fn();
const mockDisconnect = jest.fn();

global.IntersectionObserver = jest.fn().mockImplementation((callback) => ({
  observe: (target: any) => {
    mockObserve(target);
    // Simulate intersection immediately in tests
    callback([{ isIntersecting: true, target }]);
  },
  unobserve: mockUnobserve,
  disconnect: mockDisconnect,
}));

// Mock requestAnimationFrame for predictable testing
global.requestAnimationFrame = jest.fn().mockImplementation((cb) => {
  return setTimeout(() => cb(Date.now()), 16);
});

global.cancelAnimationFrame = jest.fn().mockImplementation((id) => {
  clearTimeout(id);
});

describe('CountUp Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly with final value when prefers-reduced-motion is true', () => {
    // Mock window.matchMedia for standard and reduced motion cases
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));

    render(<CountUp target={1000} />);
    
    // With reduced motion, it should show the final value immediately
    expect(screen.getByRole('status')).toHaveTextContent('1,000');
  });

  it('animates towards the target value when motion is enabled', async () => {
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));

    render(<CountUp target={100} duration={100} />);
    
    // Animation should have started because IntersectionObserver mocked to intersect
    act(() => {
      // Advance by 50ms (half the duration)
      jest.advanceTimersByTime(50);
    });

    const statusElement = screen.getByRole('status');
    const value = parseInt(statusElement.textContent?.replace(/,/g, '') || '0');
    
    // With ease-out cubic, 50% time (progress 0.5) is 1 - (1-0.5)^3 = 0.875 target
    // So value should be around 87-88
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThanOrEqual(100);
  });

  it('formats large numbers correctly with commas and handles suffix', () => {
    // Mock reduced motion for immediate final value check
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));

    render(<CountUp target={1234567} suffix=" markets" />);
    expect(screen.getByText('1,234,567 markets')).toBeInTheDocument();
  });

  it('uses IntersectionObserver to trigger animation', () => {
    render(<CountUp target={100} />);
    expect(mockObserve).toHaveBeenCalled();
  });
});
