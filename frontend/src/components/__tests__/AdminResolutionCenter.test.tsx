import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminResolutionCenter } from "../ResolutionCenter";

// Mock hooks
jest.mock("../../hooks/useWallet", () => ({
  useWallet: () => ({ publicKey: "GBADMIN..." }),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

global.fetch = jest.fn();

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const MOCK_MARKET = {
  id: 5,
  question: "Will Arsenal win the league?",
  outcomes: ["Yes", "No"],
  resolved: false,
  winning_outcome: null,
  total_pool: "5000",
  proposed_outcome: 0,
  status: "PROPOSED",
  end_date: "2099-06-01T12:00:00Z",
};

beforeEach(() => {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => [MOCK_MARKET],
  });
});
afterEach(() => jest.clearAllMocks());

describe("AdminResolutionCenter — Edit End Date", () => {
  test("Edit End Date button is visible for each market row", async () => {
    render(<AdminResolutionCenter />, { wrapper });

    await waitFor(() => screen.getByText("Will Arsenal win the league?"));

    expect(screen.getByTestId("edit-end-date-btn-5")).toBeInTheDocument();
  });

  test("clicking Edit End Date opens inline date picker pre-filled", async () => {
    render(<AdminResolutionCenter />, { wrapper });

    await waitFor(() => screen.getByTestId("edit-end-date-btn-5"));
    fireEvent.click(screen.getByTestId("edit-end-date-btn-5"));

    const input = screen.getByTestId("end-date-input-5") as HTMLInputElement;
    expect(input).toBeInTheDocument();
    // Pre-filled with current end_date
    expect(input.value).toBe("2099-06-01T12:00");
  });

  test("shows validation error when new date is less than 1 hour in the future", async () => {
    render(<AdminResolutionCenter />, { wrapper });

    await waitFor(() => screen.getByTestId("edit-end-date-btn-5"));
    fireEvent.click(screen.getByTestId("edit-end-date-btn-5"));

    const input = screen.getByTestId("end-date-input-5");
    // Set a date in the past
    fireEvent.change(input, { target: { value: "2020-01-01T00:00" } });
    fireEvent.click(screen.getByTestId("end-date-save-5"));

    expect(screen.getByTestId("end-date-error-5")).toHaveTextContent(
      /at least 1 hour in the future/i
    );
    // PATCH should NOT have been called
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/markets/5"),
      expect.objectContaining({ method: "PATCH" })
    );
  });

  test("successful update calls PATCH and shows success toast", async () => {
    // First call: fetch proposed markets; second call: PATCH
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => [MOCK_MARKET] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ market: { ...MOCK_MARKET, end_date: "2099-12-01T12:00:00Z" } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => [MOCK_MARKET] }); // refetch

    render(<AdminResolutionCenter />, { wrapper });

    await waitFor(() => screen.getByTestId("edit-end-date-btn-5"));
    fireEvent.click(screen.getByTestId("edit-end-date-btn-5"));

    const input = screen.getByTestId("end-date-input-5");
    // Set a valid future date (far future)
    fireEvent.change(input, { target: { value: "2099-12-01T12:00" } });
    fireEvent.click(screen.getByTestId("end-date-save-5"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/markets/5"),
        expect.objectContaining({ method: "PATCH" })
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/end date updated/i)).toBeInTheDocument();
    });
  });
});
