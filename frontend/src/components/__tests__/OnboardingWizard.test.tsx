import { render, screen, fireEvent } from "@testing-library/react";
import OnboardingWizard from "../OnboardingWizard";
import { useWallet } from "../../hooks/useWallet";

// Mock the hooks and components
jest.mock("../../hooks/useWallet");
jest.mock("../MarketCard", () => {
  return function MockMarketCard() {
    return <div data-testid="market-card">Mock Market Card</div>;
  };
});

describe("OnboardingWizard", () => {
  const mockOnComplete = jest.fn();
  const mockConnect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useWallet as jest.Mock).mockReturnValue({
      publicKey: null,
      connect: mockConnect,
      connecting: false,
    });
    // Mock localStorage
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: jest.fn(),
        setItem: jest.fn(),
      },
      writable: true,
    });
  });

  it("renders the first step initially", () => {
    render(<OnboardingWizard onComplete={mockOnComplete} />);
    expect(screen.getByText("Connect Your Wallet")).toBeInTheDocument();
    expect(screen.getByText("Connect Freighter")).toBeInTheDocument();
  });

  it("navigates through all steps", () => {
    render(<OnboardingWizard onComplete={mockOnComplete} />);
    
    // Step 1 -> 2
    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText("How Markets Work")).toBeInTheDocument();

    // Step 2 -> 3
    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText("Place Your Bet")).toBeInTheDocument();
    expect(screen.getByTestId("market-card")).toBeInTheDocument();

    // Step 3 -> 4
    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText("Calculate Your Payout")).toBeInTheDocument();

    // Step 4 -> Complete
    fireEvent.click(screen.getByText("Get Started"));
    expect(mockOnComplete).toHaveBeenCalled();
    expect(window.localStorage.setItem).toHaveBeenCalledWith("onboardingComplete", "true");
  });

  it("can navigate backwards", () => {
    render(<OnboardingWizard onComplete={mockOnComplete} />);
    
    // Step 1 -> 2
    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText("How Markets Work")).toBeInTheDocument();

    // Step 2 -> 1
    fireEvent.click(screen.getByText("Back"));
    expect(screen.getByText("Connect Your Wallet")).toBeInTheDocument();
  });

  it("calls onComplete and sets localStorage when skipped", () => {
    render(<OnboardingWizard onComplete={mockOnComplete} />);
    
    fireEvent.click(screen.getByText("Skip to Dashboard"));
    expect(mockOnComplete).toHaveBeenCalled();
    expect(window.localStorage.setItem).toHaveBeenCalledWith("onboardingComplete", "true");
  });

  it("allows connecting wallet in step 1", () => {
    render(<OnboardingWizard onComplete={mockOnComplete} />);
    
    fireEvent.click(screen.getByText("Connect Freighter"));
    expect(mockConnect).toHaveBeenCalled();
  });

  it("shows connected wallet status", () => {
    (useWallet as jest.Mock).mockReturnValue({
      publicKey: "GBX...123",
      connect: mockConnect,
      connecting: false,
    });

    render(<OnboardingWizard onComplete={mockOnComplete} />);
    expect(screen.getByText("Wallet Connected!")).toBeInTheDocument();
    expect(screen.getByText(/GBX/)).toBeInTheDocument();
  });
});
