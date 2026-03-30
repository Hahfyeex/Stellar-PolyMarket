import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType } from "react";

const mockUseParams = jest.fn();
const mockUseWalletContext = jest.fn();
const mockClipboardWriteText = jest.fn();

jest.mock("next/navigation", () => ({
  useParams: () => mockUseParams(),
}));

jest.mock("../../../../context/WalletContext", () => ({
  useWalletContext: (...args: unknown[]) => mockUseWalletContext(...args),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: any) => <img {...props} alt={props.alt} />,
}));

global.fetch = jest.fn();

const PROFILE_ADDRESS = "GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJJBBP7YFHVMQ5CKXRNJ4YXWQ";
const OTHER_ADDRESS = "GCFXKXCUJMG6J7R2NQTBQMLA6MWO22P4T7Q7BRYB6KBM6YTO6QXDZL5N";

const profilePayload = {
  address: PROFILE_ADDRESS,
  display_name: "Hahfyeex",
  accuracy_pct: 78.4,
  markets_count: 42,
  total_volume_xlm: 1234.5,
  net_pnl: 321.75,
  win_count: 24,
  loss_count: 7,
  badges: ["bronze", "silver"],
  recent_activity: [
    {
      bet_id: 1,
      market_question: "Will XLM close above $1.00 this month?",
      outcome_name: "Yes",
      amount: "50",
      created_at: "2026-03-20T10:00:00.000Z",
      result: "won",
    },
    {
      bet_id: 2,
      market_question: "Will BTC hit a new ATH this quarter?",
      outcome_name: "No",
      amount: "20",
      created_at: "2026-03-19T10:00:00.000Z",
      result: "open",
    },
    {
      bet_id: 3,
      market_question: "Will Nigeria cut rates in Q2?",
      outcome_name: "Yes",
      amount: "15",
      created_at: "2026-03-18T10:00:00.000Z",
      result: "lost",
    },
    {
      bet_id: 4,
      market_question: "Will SOL outperform ETH this week?",
      outcome_name: "No",
      amount: "75",
      created_at: "2026-03-17T10:00:00.000Z",
      result: "won",
    },
    {
      bet_id: 5,
      market_question: "Will gold break $3,000 this month?",
      outcome_name: "Yes",
      amount: "40",
      created_at: "2026-03-16T10:00:00.000Z",
      result: "open",
    },
    {
      bet_id: 6,
      market_question: "This sixth activity should not render",
      outcome_name: "No",
      amount: "10",
      created_at: "2026-03-15T10:00:00.000Z",
      result: "lost",
    },
  ],
};

let ProfilePage: ComponentType;

beforeAll(async () => {
  Object.assign(navigator, {
    clipboard: {
      writeText: mockClipboardWriteText,
    },
  });

  const module = await import("../page");
  ProfilePage = module.default;
});

beforeEach(() => {
  jest.clearAllMocks();

  process.env.NEXT_PUBLIC_API_URL = "http://localhost:3001";

  mockUseParams.mockReturnValue({ address: PROFILE_ADDRESS });
  mockUseWalletContext.mockReturnValue({
    publicKey: OTHER_ADDRESS,
    isLoading: false,
    walletError: null,
    connect: jest.fn(),
    disconnect: jest.fn(),
  });

  mockClipboardWriteText.mockResolvedValue(undefined);

  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => profilePayload,
  });
});

describe("ProfileByAddressPage", () => {
  it("renders public profile stats and the last five bets from the API", async () => {
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText("Hahfyeex")).toBeInTheDocument();
    });

    expect(screen.getByText("78.4%")).toBeInTheDocument();
    expect(screen.getByText("1,234.50 XLM")).toBeInTheDocument();
    expect(screen.getByText("+321.75 XLM")).toBeInTheDocument();
    expect(screen.getByText(/24W/i)).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("Will XLM close above $1.00 this month?")).toBeInTheDocument();
    expect(screen.getByText("Will gold break $3,000 this month?")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit display name/i })).not.toBeInTheDocument();
    expect(
      screen.queryByText("This sixth activity should not render")
    ).not.toBeInTheDocument();
  });

  it("renders badge icons from the profile response and only shows edit name for the owner", async () => {
    mockUseWalletContext.mockReturnValue({
      publicKey: PROFILE_ADDRESS,
      isLoading: false,
      walletError: null,
      connect: jest.fn(),
      disconnect: jest.fn(),
    });

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /edit display name/i })).toBeInTheDocument();
    });

    expect(screen.getAllByAltText(/Bronze badge/i).length).toBeGreaterThan(0);
    expect(screen.getAllByAltText(/Silver badge/i).length).toBeGreaterThan(0);
  });

  it("copies the public profile URL when share profile is clicked", async () => {
    const user = userEvent.setup();

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /share profile/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /share profile/i }));

    expect(mockClipboardWriteText).toHaveBeenCalledWith(
      `http://localhost/profile/${PROFILE_ADDRESS}`
    );
  });
});
