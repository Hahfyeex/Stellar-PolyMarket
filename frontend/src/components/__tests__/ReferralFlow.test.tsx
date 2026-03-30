import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import ReferralTracker from "../ReferralTracker";
import ReferralSection from "../ReferralSection";
import {
  REFERRAL_STORAGE_KEY,
  buildReferralLink,
  generateReferralCode,
  getStoredReferralCode,
} from "../../lib/referral";

const mockUseSearchParams = jest.fn();
const toastSuccess = jest.fn();
const toastError = jest.fn();
const clipboardWriteText = jest.fn();

jest.mock("next/navigation", () => ({
  useSearchParams: () => mockUseSearchParams(),
}));

jest.mock("../ToastProvider", () => ({
  useToast: () => ({
    success: toastSuccess,
    error: toastError,
  }),
}));

Object.assign(navigator, {
  clipboard: {
    writeText: clipboardWriteText,
  },
});

describe("referral flow helpers", () => {
  const walletAddress = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    mockUseSearchParams.mockReturnValue({
      get: (key: string) => (key === "ref" ? "abc12345" : null),
    });
    clipboardWriteText.mockResolvedValue(undefined);
  });

  it("derives a deterministic 8-character referral code from the wallet address", () => {
    const referralCode = generateReferralCode(walletAddress);

    expect(referralCode).toHaveLength(8);
    expect(referralCode).toMatch(/^[A-Z0-9]{8}$/);
    expect(generateReferralCode(walletAddress)).toBe(referralCode);
    expect(generateReferralCode(`${walletAddress.slice(0, -1)}X`)).not.toBe(referralCode);
  });

  it("stores a referral code from the ref query param in localStorage", async () => {
    render(<ReferralTracker />);

    await waitFor(() => {
      expect(localStorage.getItem(REFERRAL_STORAGE_KEY)).toBe("ABC12345");
      expect(getStoredReferralCode()).toBe("ABC12345");
    });
  });

  it("renders referral stats and copies the full referral link", async () => {
    render(
      <ReferralSection walletAddress={walletAddress} referredUsers={12} totalBonusEarned={42.5} />
    );

    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("42.50 XLM")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /copy referral link/i }));

    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith(
        buildReferralLink(window.location.origin, walletAddress)
      );
      expect(toastSuccess).toHaveBeenCalledWith("Referral link copied to clipboard.");
    });
  });
});
