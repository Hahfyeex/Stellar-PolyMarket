import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import CreateMarketForm from "../CreateMarketForm";

const mockConnect = jest.fn();
const mockInvokeCreateMarketOnChain = jest.fn();

jest.mock("../../context/WalletContext", () => ({
  useWalletContext: () => ({
    publicKey: "GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJJBBP7YFHVMQ5CKXRNJ4YXWQ",
    connect: mockConnect,
    connecting: false,
  }),
}));

jest.mock("../../lib/createMarket", () => ({
  invokeCreateMarketOnChain: (...args: any[]) => mockInvokeCreateMarketOnChain(...args),
}));

jest.mock("../../lib/stellar", () => ({
  validateStellarAddress: (value: string) =>
    value === "GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJJBBP7YFHVMQ5CKXRNJ4YXWQ",
}));

describe("CreateMarketForm", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = fetchMock as any;
  });

  it("shows inline validation errors on blur", async () => {
    render(<CreateMarketForm />);

    fireEvent.blur(screen.getByLabelText(/question/i));
    fireEvent.blur(screen.getByLabelText(/token address/i));

    expect(await screen.findByText(/at least 10 characters/i)).toBeInTheDocument();
    expect(screen.getByText(/valid stellar token address/i)).toBeInTheDocument();
  });

  it("stops at step 1 when the api save fails", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Database write failed" }),
    });

    render(<CreateMarketForm />);

    fireEvent.change(screen.getByLabelText(/question/i), {
      target: { value: "Will BTC trade above $120k before Q4 2026?" },
    });
    fireEvent.change(screen.getByLabelText(/end date and time/i), {
      target: { value: "2026-04-02T12:00" },
    });
    fireEvent.change(screen.getByLabelText(/token address/i), {
      target: { value: "GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJJBBP7YFHVMQ5CKXRNJ4YXWQ" },
    });
    const outcomeInputs = screen.getAllByPlaceholderText(/Outcome/i);
    fireEvent.change(outcomeInputs[0], { target: { value: "Yes" } });
    fireEvent.change(outcomeInputs[1], { target: { value: "No" } });

    fireEvent.click(screen.getByRole("button", { name: /create market/i }));

    expect(await screen.findByText(/Database write failed/i)).toBeInTheDocument();
    expect(mockInvokeCreateMarketOnChain).not.toHaveBeenCalled();
  });

  it("completes the two-step flow and redirects with the new market id", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ market: { id: 42 } }),
    });
    const onCreated = jest.fn();
    mockInvokeCreateMarketOnChain.mockResolvedValue(undefined);

    render(<CreateMarketForm onCreated={onCreated} />);

    fireEvent.change(screen.getByLabelText(/question/i), {
      target: { value: "Will Soroban mainnet volume exceed 10M XLM this month?" },
    });
    fireEvent.change(screen.getByLabelText(/end date and time/i), {
      target: { value: "2026-04-02T12:00" },
    });
    fireEvent.change(screen.getByLabelText(/token address/i), {
      target: { value: "GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJJBBP7YFHVMQ5CKXRNJ4YXWQ" },
    });
    const outcomeInputs = screen.getAllByPlaceholderText(/Outcome/i);
    fireEvent.change(outcomeInputs[0], { target: { value: "Yes" } });
    fireEvent.change(outcomeInputs[1], { target: { value: "No" } });

    fireEvent.click(screen.getByRole("button", { name: /create market/i }));

    await waitFor(() =>
      expect(screen.getByTestId("progress-step-save")).toHaveTextContent(/Metadata saved/i)
    );
    await waitFor(() =>
      expect(screen.getByTestId("progress-step-sign")).toHaveTextContent(/On-chain invocation submitted/i)
    );
    expect(mockInvokeCreateMarketOnChain).toHaveBeenCalledWith(
      expect.objectContaining({ marketId: 42 })
    );
    expect(onCreated).toHaveBeenCalledWith(42);
  });
});
