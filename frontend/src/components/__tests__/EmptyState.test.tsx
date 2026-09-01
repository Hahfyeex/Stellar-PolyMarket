import React from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import EmptyState, {
  NoMarketsIllustration,
  NoBetsIllustration,
  NoNotificationsIllustration,
  WalletDisconnectedIllustration,
} from "../EmptyState";

describe("EmptyState Component (Issue #431)", () => {
  it("renders 'no-markets' variant with default illustration, text, and link", () => {
    render(<EmptyState variant="no-markets" />);

    expect(screen.getByRole("region", { name: /no markets found/i })).toBeInTheDocument();
    expect(screen.getByText("No Markets Found")).toBeInTheDocument();
    expect(
      screen.getByText(/no prediction markets match your current filter/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /explore all markets/i })).toHaveAttribute(
      "href",
      "/markets"
    );
    expect(screen.getByRole("img", { name: /no markets illustration/i })).toBeInTheDocument();
  });

  it("renders 'no-bets' variant with default illustration, text, and link", () => {
    render(<EmptyState variant="no-bets" />);

    expect(screen.getByRole("region", { name: /no bets placed yet/i })).toBeInTheDocument();
    expect(screen.getByText("No Bets Placed Yet")).toBeInTheDocument();
    expect(
      screen.getByText(/you haven't participated in any prediction markets yet/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /place your first bet/i })).toHaveAttribute(
      "href",
      "/markets"
    );
    expect(screen.getByRole("img", { name: /no bets illustration/i })).toBeInTheDocument();
  });

  it("renders 'no-notifications' variant with default illustration and text", () => {
    render(<EmptyState variant="no-notifications" />);

    expect(screen.getByRole("region", { name: /no notifications yet/i })).toBeInTheDocument();
    expect(screen.getByText("No Notifications Yet")).toBeInTheDocument();
    expect(screen.getByText(/you're all caught up/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /browse markets/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /no notifications illustration/i })).toBeInTheDocument();
  });

  it("renders 'wallet-disconnected' variant and triggers onCtaClick handler", () => {
    const handleConnect = jest.fn();
    render(<EmptyState variant="wallet-disconnected" onCtaClick={handleConnect} />);

    expect(screen.getByRole("region", { name: /wallet not connected/i })).toBeInTheDocument();
    expect(screen.getByText("Wallet Not Connected")).toBeInTheDocument();
    expect(screen.getByText(/connect your stellar freighter wallet/i)).toBeInTheDocument();

    const connectBtn = screen.getByRole("button", { name: /connect wallet/i });
    expect(connectBtn).toBeInTheDocument();

    fireEvent.click(connectBtn);
    expect(handleConnect).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("img", { name: /wallet disconnected illustration/i })).toBeInTheDocument();
  });

  it("supports custom title, message, ctaLabel, and href overrides", () => {
    render(
      <EmptyState
        variant="no-markets"
        title="Custom Filter Empty"
        message="Try changing the category to Sports or Crypto."
        ctaLabel="Reset Filter"
        href="/markets?reset=true"
      />
    );

    expect(screen.getByText("Custom Filter Empty")).toBeInTheDocument();
    expect(
      screen.getByText("Try changing the category to Sports or Crypto.")
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /reset filter/i });
    expect(link).toHaveAttribute("href", "/markets?reset=true");
  });

  it("supports custom illustration rendering", () => {
    render(
      <EmptyState
        variant="custom"
        title="Custom State"
        message="Custom description"
        customIllustration={<div data-testid="custom-svg">Custom SVG Icon</div>}
      />
    );

    expect(screen.getByTestId("custom-svg")).toBeInTheDocument();
    expect(screen.getByText("Custom State")).toBeInTheDocument();
  });
});
