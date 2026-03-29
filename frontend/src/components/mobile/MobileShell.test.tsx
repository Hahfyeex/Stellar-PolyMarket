"use client";

import { render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { useSelector } from 'react-redux';
import { Provider } from 'react-redux';
import MobileShell, { useCurrentTab } from './MobileShell';
import BottomNavBar from './BottomNavBar';

// Mock Next.js hooks
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}));

// Mock Redux
const mockUseSelector = useSelector as jest.Mock;
const mockStore = {
  notifications: { items: [] }
};

// Mock BottomNavBar to avoid i18n complexity
jest.mock('./BottomNavBar', () => ({
  default: ({ activeTab, unreadCount }: { activeTab: string; unreadCount: number }) => (
    <nav data-testid="mock-bottom-nav">
      <span data-testid="active-tab">{activeTab}</span>
      <span data-testid="badge-count">{unreadCount}</span>
    </nav>
  ),
}));

describe('MobileShell', () => {
  beforeEach(() => {
    (usePathname as jest.Mock).mockReturnValue('/');
    mockUseSelector.mockReturnValue(0);
  });

  it('computes correct activeTab from pathname', () => {
    const testCases: [pathname: string, expectedTab: string][] = [
      ['/', 'home'],
      ['/markets/123', 'home'],
      ['/leaderboard', 'leaderboard'],
      ['/profile', 'profile'],
      ['/portfolio', 'portfolio'],
      ['/unknown', 'home'],
    ];

    testCases.forEach(([path, tab]) => {
      (usePathname as jest.Mock).mockReturnValue(path);
      render(<MobileShell>{/* content */}</MobileShell>);
      expect(screen.getByTestId('active-tab')).toHaveTextContent(tab);
    });
  });

  it('shows unreadCount badge from Redux', () => {
    mockUseSelector.mockReturnValue(5);
    render(<MobileShell>{/* content */}</MobileShell>);
    expect(screen.getByTestId('badge-count')).toHaveTextContent('5');
  });

  it('uses unreadCount prop if provided, falls back to Redux', () => {
    render(<MobileShell unreadCount={3}>{/* content */}</MobileShell>);
    expect(screen.getByTestId('badge-count')).toHaveTextContent('3');
  });

  it('applies correct padding classes', () => {
    const { container } = render(<MobileShell>{/* content */}</MobileShell>);
    expect(container.firstChild).toHaveClass('safe-top');
    const contentDiv = container.querySelector('div.pb-\\[88px\\]');
    expect(contentDiv).toBeInTheDocument();
  });

  it('renders optional children and props correctly', () => {
    const mockOnBet = jest.fn();
    render(
      <MobileShell activeMarket={{}} walletAddress="GABC123" onBetPlaced={mockOnBet}>
        Test content
      </MobileShell>
    );
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });
});

describe('useCurrentTab', () => {
  it.each([
    ['/', 'home'],
    ['/leaderboard', 'leaderboard'],
    ['/profile/settings', 'profile'],
    ['/portfolio/bets', 'portfolio'],
  ])('returns %s for pathname %s', (pathname, expected) => {
    (usePathname as jest.Mock).mockReturnValue(pathname as any);
    const result = useCurrentTab(pathname);
    expect(result).toBe(expected);
  });
});

