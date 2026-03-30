import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import FloatingBetButton from "../mobile/FloatingBetButton";
import { useOddsStream } from "../../hooks/useOddsStream";
import type { Market } from "../../types/market";

// Mock the hook
jest.mock("../../hooks/useOddsStream");

const mockMarket: Market = {
  id: 1,
  question: "Will it rain tomorrow?",
  outcomes: ["Yes", "No"],
  total_pool: "1000",
  resolved: false,
  winning_outcome: null,
  end_date: new Date(Date.now() + 86400000).toISOString(),
};

describe("FloatingBetButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useOddsStream as jest.Mock).mockReturnValue({
      odds: [65, 35],
      connected: true,
      changedIndices: new Set(),
    });
  });

  it("should not render when activeMarket is null", () => {
    const { container } = render(
      <FloatingBetButton activeMarket={null} drawerOpen={false} onPress={jest.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("should render YES odds from stream", () => {
    render(<FloatingBetButton activeMarket={mockMarket} drawerOpen={false} onPress={jest.fn()} />);
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("65%")).toBeInTheDocument();
  });

  it("should fall back to default odds if stream is empty", () => {
    (useOddsStream as jest.Mock).mockReturnValue({
      odds: [],
      connected: true,
      changedIndices: new Set(),
    });

    render(<FloatingBetButton activeMarket={mockMarket} drawerOpen={false} onPress={jest.fn()} />);
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("should call onPress when clicked", () => {
    const onPress = jest.fn();
    render(<FloatingBetButton activeMarket={mockMarket} drawerOpen={false} onPress={onPress} />);

    const button = screen.getByTestId("floating-bet-button");
    fireEvent.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("should be hidden when drawer is open", () => {
    render(<FloatingBetButton activeMarket={mockMarket} drawerOpen={true} onPress={jest.fn()} />);

    const button = screen.getByTestId("floating-bet-button");
    expect(button.className).toContain("opacity-0");
    expect(button.className).toContain("translate-y-24");
    expect(button.className).toContain("pointer-events-none");
  });

  it("should be disabled if market is resolved", () => {
    const resolvedMarket = { ...mockMarket, resolved: true };
    render(
      <FloatingBetButton activeMarket={resolvedMarket} drawerOpen={false} onPress={jest.fn()} />
    );

    const button = screen.getByTestId("floating-bet-button");
    expect(button).toBeDisabled();
    expect(button.className).toContain("opacity-0");
  });

  it("should be disabled if market is expired", () => {
    const expiredMarket = {
      ...mockMarket,
      end_date: new Date(Date.now() - 1000).toISOString(),
    };
    render(
      <FloatingBetButton activeMarket={expiredMarket} drawerOpen={false} onPress={jest.fn()} />
    );

    const button = screen.getByTestId("floating-bet-button");
    expect(button).toBeDisabled();
  });

  it("should have mobile-only classes", () => {
    render(<FloatingBetButton activeMarket={mockMarket} drawerOpen={false} onPress={jest.fn()} />);

    const button = screen.getByTestId("floating-bet-button");
    expect(button.className).toContain("md:hidden");
  });
});
