/**
 * MarketDetailPage Component Tests
 * Tests for UI rendering, tab switching, betting functionality, and input validation
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock next/navigation
jest.mock("next/navigation", () => ({
  useParams: () => ({ id: "1" }),
  useRouter: () => ({ push: jest.fn() }),
}));

// Mock environment variable
const originalEnv = process.env;
process.env = {
  ...originalEnv,
  NEXT_PUBLIC_API_URL: "http://localhost:3001",
};

// Mock fetch
global.fetch = jest.fn();

// Mock useWallet hook
jest.mock("../../../../hooks/useWallet", () => ({
  useWallet: () => ({
    publicKey: null,
    connecting: false,
    error: null,
    connect: jest.fn(),
    disconnect: jest.fn(),
  }),
}));

// Mock MobileShell component — render nothing to avoid duplicate DOM nodes
// (the desktop layout already renders full content; MobileShell would duplicate it)
jest.mock("../../../../components/mobile/MobileShell", () => ({
  __esModule: true,
  default: () => null,
}));

// Demo data matching the component
const DEMO_MARKET = {
  id: 1,
  question: "Will Bitcoin reach $100k before 2027?",
  end_date: "2027-12-31T00:00:00Z",
  outcomes: ["Yes", "No"],
  resolved: false,
  winning_outcome: null,
  total_pool: "4200",
  status: "open",
  contract_address: "GXXXX...XXXX",
  created_at: "2024-01-15T00:00:00Z",
};

const DEMO_BETS = [
  { id: 1, wallet_address: "GABC1234ABCD", outcome_index: 0, amount: "100", created_at: new Date(Date.now() - 60000).toISOString() },
  { id: 2, wallet_address: "GDEF5678EFGH", outcome_index: 1, amount: "50", created_at: new Date(Date.now() - 120000).toISOString() },
  { id: 3, wallet_address: "GIJK9012IJKL", outcome_index: 0, amount: "200", created_at: new Date(Date.now() - 180000).toISOString() },
];

const RESOLVED_MARKET = {
  ...DEMO_MARKET,
  resolved: true,
  winning_outcome: 0,
};

const EXPIRED_MARKET = {
  ...DEMO_MARKET,
  end_date: "2020-01-01T00:00:00Z",
};

// Helper to create wrapper with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// Dynamic import of component to avoid hoisting issues
let MarketDetailPage: React.ComponentType<{ marketId: string }>;

beforeAll(async () => {
  // Import dynamically to ensure mocks are set up first
  const module = await import("../MarketDetailPage");
  MarketDetailPage = module.default;
});

describe("MarketDetailPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/api/markets/")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ market: DEMO_MARKET, bets: DEMO_BETS }),
        });
      }
      if (url.includes("/api/reserves")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ markets: [{ market_id: 1, xlm_balance: "4500" }] }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  describe("Loading State", () => {
    it("should show loading skeleton while fetching market data", async () => {
      (fetch as jest.Mock).mockImplementation(() => 
        new Promise(() => {}) // Never resolves to keep loading
      );

      render(<MarketDetailPage marketId="1" />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.queryByText(/Will Bitcoin reach/i)).not.toBeInTheDocument();
      });
    });
  });

  describe("Error State", () => {
    it("should display error message when API fails", async () => {
      (fetch as jest.Mock).mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          json: () => Promise.resolve({ error: "Market not found" }),
        })
      );

      render(<MarketDetailPage marketId="999" />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/Failed to load market/i)).toBeInTheDocument();
      });
    });
  });

  describe("Market Content Rendering", () => {
    beforeEach(async () => {
      render(<MarketDetailPage marketId="1" />, { wrapper: createWrapper() });
      await waitFor(() => {
        expect(screen.getAllByText(/Will Bitcoin reach/i).length).toBeGreaterThan(0);
      });
    });

    it("should render market question", () => {
      expect(screen.getAllByText("Will Bitcoin reach $100k before 2027?").length).toBeGreaterThan(0);
    });

    it("should render market status badge", () => {
      expect(screen.getByText("Live")).toBeInTheDocument();
    });

    it("should render pool size", () => {
      expect(screen.getByText(/4200.*XLM/i)).toBeInTheDocument();
    });

    it("should render odds display", () => {
      expect(screen.getByText(/%/)).toBeInTheDocument();
    });

    it("should render back link", () => {
      expect(screen.getByText("← Back")).toBeInTheDocument();
    });
  });

  describe("Outcome Data Handling", () => {
    async function renderWithMarket(marketOverride: any) {
      (fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes("/api/markets/")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ market: marketOverride, bets: DEMO_BETS }),
          });
        }
        if (url.includes("/api/reserves")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ markets: [{ market_id: 1, xlm_balance: "4500" }] }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      render(<MarketDetailPage marketId="1" />, { wrapper: createWrapper() });
      await waitFor(() => {
        expect(screen.getByText(/Will Bitcoin reach/i)).toBeInTheDocument();
      });
    }

    it("shows fallback when outcomes is null", async () => {
      await renderWithMarket({ ...DEMO_MARKET, outcomes: null as any });
      expect(screen.getByText("Outcome data unavailable")).toBeInTheDocument();
    });

    it("shows fallback when outcomes is undefined", async () => {
      const market = { ...DEMO_MARKET } as any;
      delete market.outcomes;
      await renderWithMarket(market);
      expect(screen.getByText("Outcome data unavailable")).toBeInTheDocument();
    });

    it("shows fallback when outcomes is empty", async () => {
      await renderWithMarket({ ...DEMO_MARKET, outcomes: [] });
      expect(screen.getByText("Outcome data unavailable")).toBeInTheDocument();
    });

    it("does not show fallback when outcomes is valid", async () => {
      await renderWithMarket({ ...DEMO_MARKET, outcomes: ["Up", "Down"] });
      expect(screen.queryByText("Outcome data unavailable")).not.toBeInTheDocument();
    });
  });

  describe("Tab Navigation", () => {
    beforeEach(async () => {
      render(<MarketDetailPage marketId="1" />, { wrapper: createWrapper() });
      await waitFor(() => {
        expect(screen.getAllByText(/Will Bitcoin reach/i).length).toBeGreaterThan(0);
      });
    });

    it("should have About tab active by default", () => {
      const aboutTab = screen.getByRole("button", { name: /About/i });
      expect(aboutTab).toHaveClass("border-blue-500");
    });

    it("should switch to Positions tab", async () => {
      const positionsTab = screen.getByRole("button", { name: /Positions/i });
      await userEvent.click(positionsTab);

      expect(positionsTab).toHaveClass("border-blue-500");
      expect(screen.getByText(/Trader/i)).toBeInTheDocument();
    });

    it("should switch to Activity tab", async () => {
      const activityTab = screen.getByRole("button", { name: /Activity/i });
      await userEvent.click(activityTab);

      expect(activityTab).toHaveClass("border-blue-500");
      expect(screen.getByText(/GABC…ABCD/i)).toBeInTheDocument();
    });

    it("should maintain tab state when switching", async () => {
      const positionsTab = screen.getByRole("button", { name: /Positions/i });
      const activityTab = screen.getByRole("button", { name: /Activity/i });

      await userEvent.click(positionsTab);
      expect(positionsTab).toHaveClass("border-blue-500");

      await userEvent.click(activityTab);
      expect(activityTab).toHaveClass("border-blue-500");
      expect(positionsTab).not.toHaveClass("border-blue-500");
    });
  });

  describe("Betting Panel - UI Elements", () => {
    beforeEach(async () => {
      render(<MarketDetailPage marketId="1" />, { wrapper: createWrapper() });
      await waitFor(() => {
        expect(screen.getAllByText(/Will Bitcoin reach/i).length).toBeGreaterThan(0);
      });
    });

    it("should render YES and NO buttons", () => {
      expect(screen.getByText("YES")).toBeInTheDocument();
      expect(screen.getByText("NO")).toBeInTheDocument();
    });

    it("should render amount input", () => {
      const input = screen.getByPlaceholderText("0.00");
      expect(input).toBeInTheDocument();
    });

    it("should render Connect Wallet button", () => {
      expect(screen.getByText("Connect Wallet to Bet")).toBeInTheDocument();
    });
  });

  describe("Betting Panel - Outcome Selection", () => {
    beforeEach(async () => {
      render(<MarketDetailPage marketId="1" />, { wrapper: createWrapper() });
      await waitFor(() => {
        expect(screen.getAllByText(/Will Bitcoin reach/i).length).toBeGreaterThan(0);
      });
    });

    it("should highlight YES when selected", async () => {
      const yesButton = screen.getByText("YES").closest("button");
      await userEvent.click(yesButton!);

      expect(yesButton).toHaveClass("ring-2");
    });

    it("should highlight NO when selected", async () => {
      const noButton = screen.getByText("NO").closest("button");
      await userEvent.click(noButton!);

      expect(noButton).toHaveClass("ring-2");
    });

    it("should allow switching between outcomes", async () => {
      const yesButton = screen.getByText("YES").closest("button");
      const noButton = screen.getByText("NO").closest("button");

      await userEvent.click(yesButton!);
      expect(yesButton).toHaveClass("ring-2");

      await userEvent.click(noButton!);
      expect(noButton).toHaveClass("ring-2");
      expect(yesButton).not.toHaveClass("ring-2");
    });
  });

  describe("Betting Panel - Amount Input Validation", () => {
    beforeEach(async () => {
      render(<MarketDetailPage marketId="1" />, { wrapper: createWrapper() });
      await waitFor(() => {
        expect(screen.getAllByText(/Will Bitcoin reach/i).length).toBeGreaterThan(0);
      });
    });

    it("should accept valid numeric input", async () => {
      const input = screen.getByPlaceholderText("0.00");
      await userEvent.type(input, "100.50");

      expect(input).toHaveValue(100.5);
    });

    it("should show potential payout when amount and outcome selected", async () => {
      const yesButton = screen.getByText("YES").closest("button");
      await userEvent.click(yesButton!);

      const input = screen.getByPlaceholderText("0.00");
      await userEvent.type(input, "100");

      await waitFor(() => {
        expect(screen.getByText(/Potential payout:/i)).toBeInTheDocument();
      });
    });
  });

  describe("About Tab Content", () => {
    beforeEach(async () => {
      render(<MarketDetailPage marketId="1" />, { wrapper: createWrapper() });
      await waitFor(() => {
        expect(screen.getAllByText(/Will Bitcoin reach/i).length).toBeGreaterThan(0);
      });
    });

    it("should show question in About tab", () => {
      expect(screen.getByText("Question")).toBeInTheDocument();
      expect(screen.getAllByText("Will Bitcoin reach $100k before 2027?").length).toBeGreaterThan(0);
    });

    it("should show market details", () => {
      expect(screen.getByText("Market Details")).toBeInTheDocument();
      expect(screen.getByText("Pool Size")).toBeInTheDocument();
      expect(screen.getByText("Total Staked")).toBeInTheDocument();
    });

    it("should show end date", () => {
      expect(screen.getByText("Ends")).toBeInTheDocument();
    });

    it("should show status", () => {
      expect(screen.getByText("Status")).toBeInTheDocument();
    });
  });

  describe("Positions Tab Content", () => {
    beforeEach(async () => {
      render(<MarketDetailPage marketId="1" />, { wrapper: createWrapper() });
      await waitFor(() => {
        expect(screen.getAllByText(/Will Bitcoin reach/i).length).toBeGreaterThan(0);
      });
    });

    it("should show positions table headers", async () => {
      const positionsTab = screen.getByRole("button", { name: /Positions/i });
      await userEvent.click(positionsTab);

      expect(screen.getByText("Trader")).toBeInTheDocument();
      expect(screen.getByText("Position")).toBeInTheDocument();
      expect(screen.getByText("Amount")).toBeInTheDocument();
      expect(screen.getByText("Bets")).toBeInTheDocument();
    });

    it("should display position data", async () => {
      const positionsTab = screen.getByRole("button", { name: /Positions/i });
      await userEvent.click(positionsTab);

      expect(screen.getByText(/GABC…ABCD/i)).toBeInTheDocument();
      expect(screen.getByText(/GDEF…EFGH/i)).toBeInTheDocument();
    });

    it("should show position values", async () => {
      const positionsTab = screen.getByRole("button", { name: /Positions/i });
      await userEvent.click(positionsTab);

      expect(screen.getByText(/100.*XLM/i)).toBeInTheDocument();
      expect(screen.getByText(/50.*XLM/i)).toBeInTheDocument();
    });
  });

  describe("Activity Tab Content", () => {
    beforeEach(async () => {
      render(<MarketDetailPage marketId="1" />, { wrapper: createWrapper() });
      await waitFor(() => {
        expect(screen.getAllByText(/Will Bitcoin reach/i).length).toBeGreaterThan(0);
      });
    });

    it("should show activity items", async () => {
      const activityTab = screen.getByRole("button", { name: /Activity/i });
      await userEvent.click(activityTab);

      expect(screen.getByText(/GABC…ABCD/i)).toBeInTheDocument();
      expect(screen.getByText(/100.*XLM/i)).toBeInTheDocument();
    });

    it("should show bet counts", async () => {
      const activityTab = screen.getByRole("button", { name: /Activity/i });
      await userEvent.click(activityTab);

      expect(screen.getByText(/ago/i)).toBeInTheDocument();
    });
  });

  describe("Resolved Market Display", () => {
    beforeEach(async () => {
      (fetch as jest.Mock).mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ market: RESOLVED_MARKET, bets: DEMO_BETS }),
        })
      );
    });

    it("should show Resolved badge", async () => {
      render(<MarketDetailPage marketId="1" />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getAllByText("Resolved").length).toBeGreaterThan(0);
      });
    });
  });

  describe("Expired Market Display", () => {
    beforeEach(async () => {
      (fetch as jest.Mock).mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ market: EXPIRED_MARKET, bets: DEMO_BETS }),
        })
      );
    });

    it("should show Ended badge", async () => {
      render(<MarketDetailPage marketId="1" />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getAllByText("Ended").length).toBeGreaterThan(0);
      });
    });
  });

  describe("Responsive Design Classes", () => {
    beforeEach(async () => {
      render(<MarketDetailPage marketId="1" />, { wrapper: createWrapper() });
      await waitFor(() => {
        expect(screen.getAllByText(/Will Bitcoin reach/i).length).toBeGreaterThan(0);
      });
    });

    it("should apply mobile-first text sizes", () => {
      const questions = screen.getAllByText("Will Bitcoin reach $100k before 2027?");
      expect(questions.some((el) => el.classList.contains("text-2xl"))).toBe(true);
    });
  });

  describe("Bet Button States", () => {
    beforeEach(async () => {
      render(<MarketDetailPage marketId="1" />, { wrapper: createWrapper() });
      await waitFor(() => {
        expect(screen.getAllByText(/Will Bitcoin reach/i).length).toBeGreaterThan(0);
      });
    });

    it("should show potential payout for zero amount", async () => {
      const yesButton = screen.getByText("YES").closest("button");
      await userEvent.click(yesButton!);

      // Without amount, potential payout should not show
      expect(screen.queryByText(/Potential payout:/i)).not.toBeInTheDocument();
    });
  });
});

describe("Odds Calculation", () => {
  // Pure function tests for odds calculation
  
  function calculateOdds(bets: Array<{ outcome_index: number; amount: string }>, outcomeIndex: number): number {
    const totalPool = bets.reduce((sum, bet) => sum + parseFloat(bet.amount), 0);
    if (totalPool === 0) return 0.5;
    
    const outcomeStake = bets
      .filter((bet) => bet.outcome_index === outcomeIndex)
      .reduce((sum, bet) => sum + parseFloat(bet.amount), 0);
    
    return outcomeStake / totalPool;
  }

  it("should calculate 50% odds when bets are equal", () => {
    const bets = [
      { outcome_index: 0, amount: "100" },
      { outcome_index: 1, amount: "100" },
    ];
    
    expect(calculateOdds(bets, 0)).toBe(0.5);
    expect(calculateOdds(bets, 1)).toBe(0.5);
  });

  it("should calculate 75%/25% odds for unequal bets", () => {
    const bets = [
      { outcome_index: 0, amount: "300" },
      { outcome_index: 1, amount: "100" },
    ];
    
    expect(calculateOdds(bets, 0)).toBe(0.75);
    expect(calculateOdds(bets, 1)).toBe(0.25);
  });

  it("should return 50% for empty bets", () => {
    expect(calculateOdds([], 0)).toBe(0.5);
  });

  it("should handle single bet", () => {
    const bets = [{ outcome_index: 0, amount: "100" }];
    
    expect(calculateOdds(bets, 0)).toBe(1);
    expect(calculateOdds(bets, 1)).toBe(0);
  });
});

describe("Position Aggregation", () => {
  function calculatePositions(bets: Array<{ wallet_address: string; outcome_index: number; amount: string }>) {
    const positionMap = new Map<string, { wallet_address: string; outcome_index: number; total_amount: number; bet_count: number }>();
    
    bets.forEach((bet) => {
      const key = `${bet.wallet_address}-${bet.outcome_index}`;
      const existing = positionMap.get(key);
      if (existing) {
        existing.total_amount += parseFloat(bet.amount);
        existing.bet_count += 1;
      } else {
        positionMap.set(key, {
          wallet_address: bet.wallet_address,
          outcome_index: bet.outcome_index,
          total_amount: parseFloat(bet.amount),
          bet_count: 1,
        });
      }
    });
    
    return Array.from(positionMap.values()).sort((a, b) => b.total_amount - a.total_amount);
  }

  it("should aggregate same wallet and outcome bets", () => {
    const bets = [
      { wallet_address: "WALLET1", outcome_index: 0, amount: "100" },
      { wallet_address: "WALLET1", outcome_index: 0, amount: "50" },
    ];
    
    const positions = calculatePositions(bets);
    
    expect(positions.length).toBe(1);
    expect(positions[0].total_amount).toBe(150);
    expect(positions[0].bet_count).toBe(2);
  });

  it("should separate different outcomes", () => {
    const bets = [
      { wallet_address: "WALLET1", outcome_index: 0, amount: "100" },
      { wallet_address: "WALLET1", outcome_index: 1, amount: "50" },
    ];
    
    const positions = calculatePositions(bets);
    
    expect(positions.length).toBe(2);
  });

  it("should sort by total amount descending", () => {
    const bets = [
      { wallet_address: "WALLET1", outcome_index: 0, amount: "10" },
      { wallet_address: "WALLET2", outcome_index: 0, amount: "500" },
      { wallet_address: "WALLET3", outcome_index: 0, amount: "100" },
    ];
    
    const positions = calculatePositions(bets);
    
    expect(positions[0].wallet_address).toBe("WALLET2");
    expect(positions[1].wallet_address).toBe("WALLET3");
    expect(positions[2].wallet_address).toBe("WALLET1");
  });
});
