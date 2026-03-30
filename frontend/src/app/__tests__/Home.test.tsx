import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import Home from '../page';
import { useInfiniteMarkets } from '../../hooks/useInfiniteMarkets';
import { useWalletContext } from '../../context/WalletContext';
import { useMarketTabs } from '../../hooks/useMarketTabs';
import { useMarketSearch } from '../../hooks/useMarketSearch';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Unit tests for Home page infinite scroll functionality.
 * Covers sentinel trigger, loading state, and end state.
 * Closes #606
 */

jest.mock('../../hooks/useInfiniteMarkets');
jest.mock('../../context/WalletContext');
jest.mock('../../hooks/useMarketTabs');
jest.mock('../../hooks/useMarketSearch');
jest.mock('@tanstack/react-query');
jest.mock('../../lib/firebase', () => ({
  app: {},
  db: {},
  messaging: {},
  trackEvent: jest.fn(),
}));
jest.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: jest.fn(),
  }),
}));
// Mocking sub-components to focus on page logic
jest.mock('../../components/MarketCard', () => () => <div data-testid="market-card" />);
jest.mock('../../components/skeletons/MarketCardSkeleton', () => () => <div data-testid="skeleton" />);
jest.mock('../../components/MarketFilters', () => () => <div />);
jest.mock('../../components/NotificationManager', () => () => <div />);
jest.mock('../../components/LiveActivityFeed', () => () => <div />);
jest.mock('../../components/SocialTicker', () => () => <div />);
jest.mock('../../components/NotificationInbox', () => () => <div />);
jest.mock('../../components/mobile/MobileShell', () => ({ children }: any) => <div>{children}</div>);
jest.mock('../../components/mobile/PullToRefresh', () => ({ children }: any) => <div>{children}</div>);
jest.mock('../../components/onboarding/OnboardingWizard', () => () => <div />);
jest.mock('../../components/ThemeToggle', () => () => <div />);
jest.mock('../../components/MarketDiscoveryGrid', () => () => <div />);
jest.mock('../../components/MarketTabs', () => () => <div />);

// Mock IntersectionObserver
let intersectionCallback: any;
global.IntersectionObserver = jest.fn().mockImplementation((cb) => {
  intersectionCallback = cb;
  return {
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  };
});

describe('Home Page Infinite Scroll', () => {
  const mockFetchNextPage = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useWalletContext as jest.Mock).mockReturnValue({
      publicKey: null,
      connecting: false,
      connect: jest.fn(),
      disconnect: jest.fn(),
    });
    (useMarketTabs as jest.Mock).mockReturnValue({
      activeTab: 'active',
      setActiveTab: jest.fn(),
      activeMarkets: [{ id: 1, question: 'Market 1' }],
      resolvedMarkets: [],
      activeBadge: 1,
      resolvedBadge: 0,
    });
    (useMarketSearch as jest.Mock).mockImplementation((m) => m);
    (useQueryClient as jest.Mock).mockReturnValue({
      invalidateQueries: jest.fn(),
    });
  });

  it('triggers fetchNextPage when sentinel enters viewport', () => {
    (useInfiniteMarkets as jest.Mock).mockReturnValue({
      data: { pages: [{ markets: [{ id: 1, question: 'Market 1' }], meta: { hasMore: true, limit: 10, offset: 0 } }] },
      isLoading: false,
      fetchNextPage: mockFetchNextPage,
      hasNextPage: true,
      isFetchingNextPage: false,
    });

    render(<Home />);
    
    // Simulate sentinel coming into view
    act(() => {
      intersectionCallback([{ isIntersecting: true }]);
    });

    expect(mockFetchNextPage).toHaveBeenCalled();
  });

  it('shows loading spinner while fetching next page', () => {
    (useInfiniteMarkets as jest.Mock).mockReturnValue({
      data: { pages: [{ markets: [{ id: 1, question: 'Market 1' }], meta: { hasMore: true } }] },
      isLoading: false,
      fetchNextPage: jest.fn(),
      hasNextPage: true,
      isFetchingNextPage: true,
    });

    render(<Home />);
    expect(screen.getAllByText(/Loading more markets/i)[0]).toBeInTheDocument();
  });

  it('shows "End of markets" message when all pages are loaded', () => {
    (useInfiniteMarkets as jest.Mock).mockReturnValue({
      data: { pages: [{ markets: [{ id: 1, question: 'Market 1' }], meta: { hasMore: false } }] },
      isLoading: false,
      fetchNextPage: jest.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });

    render(<Home />);
    expect(screen.getAllByText(/End of markets/i)[0]).toBeInTheDocument();
  });
});
