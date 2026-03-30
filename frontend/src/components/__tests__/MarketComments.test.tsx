import { render, screen, fireEvent } from "@testing-library/react";
import MarketComments from "../MarketComments";
import { useWalletContext } from "../../context/WalletContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import "@testing-library/jest-dom";

jest.mock("../../context/WalletContext");
jest.mock("@tanstack/react-query");
jest.mock("date-fns", () => ({
  formatDistanceToNow: () => "just now",
}));

const mockComments = [
  {
    id: 1,
    market_id: 123,
    wallet_address: "GABC...XYZ123",
    text: "This is a test comment",
    thumbs_up_count: 5,
    created_at: new Date().toISOString(),
  },
];

describe("MarketComments Component", () => {
  beforeEach(() => {
    (useWalletContext as jest.Mock).mockReturnValue({
      publicKey: "GSOURCE_WALLET_ADDRESS",
      connect: jest.fn(),
    });

    (useQuery as jest.Mock).mockReturnValue({
      data: mockComments,
      isLoading: false,
      error: null,
    });

    (useMutation as jest.Mock).mockReturnValue({
      mutate: jest.fn(),
      mutateAsync: jest.fn(),
    });
  });

  it("renders comments correctly", () => {
    render(<MarketComments marketId={123} />);
    expect(screen.getByText("Discussion")).toBeInTheDocument();
    expect(screen.getByText("This is a test comment")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument(); // Thumbs up count
  });

  it("shows character counter and limits input", () => {
    render(<MarketComments marketId={123} />);
    const textarea = screen.getByPlaceholderText("Share your reasoning...");
    
    fireEvent.change(textarea, { target: { value: "Hello world" } });
    expect(screen.getByText("11/500")).toBeInTheDocument();
  });

  it("disables post button when text is empty", () => {
    render(<MarketComments marketId={123} />);
    const button = screen.getByText("Post Comment");
    expect(button).toBeDisabled();
  });

  it("shows connect wallet prompt when not connected", () => {
    (useWalletContext as jest.Mock).mockReturnValue({
      publicKey: null,
      connect: jest.fn(),
    });

    render(<MarketComments marketId={123} />);
    expect(screen.getByText("Connect your wallet to join the discussion")).toBeInTheDocument();
    expect(screen.getByText("Connect Wallet")).toBeInTheDocument();
  });
});
