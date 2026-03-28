import React from "react";
import { render, screen, act } from "@testing-library/react";
import OfflineBanner from "../OfflineBanner";

const fireNetworkEvent = (type: "online" | "offline") => {
  act(() => {
    window.dispatchEvent(new Event(type));
  });
};

describe("OfflineBanner", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => true,
    });
  });

  it("renders nothing when online", () => {
    render(<OfflineBanner />);
    expect(screen.queryByTestId("offline-banner")).not.toBeInTheDocument();
  });

  it("renders banner when offline", () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => false,
    });
    render(<OfflineBanner />);
    expect(screen.getByTestId("offline-banner")).toBeInTheDocument();
  });

  it("shows offline message text", () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => false,
    });
    render(<OfflineBanner />);
    expect(screen.getByText(/you're offline/i)).toBeInTheDocument();
    expect(screen.getByText(/cached data/i)).toBeInTheDocument();
  });

  it("appears when offline event fires", () => {
    render(<OfflineBanner />);
    expect(screen.queryByTestId("offline-banner")).not.toBeInTheDocument();
    fireNetworkEvent("offline");
    expect(screen.getByTestId("offline-banner")).toBeInTheDocument();
  });

  it("disappears when online event fires after going offline", () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => false,
    });
    render(<OfflineBanner />);
    expect(screen.getByTestId("offline-banner")).toBeInTheDocument();
    fireNetworkEvent("online");
    expect(screen.queryByTestId("offline-banner")).not.toBeInTheDocument();
  });

  it("has role=status and aria-live=polite for accessibility", () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => false,
    });
    render(<OfflineBanner />);
    const banner = screen.getByTestId("offline-banner");
    expect(banner).toHaveAttribute("role", "status");
    expect(banner).toHaveAttribute("aria-live", "polite");
  });

  it("toggles correctly through multiple transitions", () => {
    render(<OfflineBanner />);
    fireNetworkEvent("offline");
    expect(screen.getByTestId("offline-banner")).toBeInTheDocument();
    fireNetworkEvent("online");
    expect(screen.queryByTestId("offline-banner")).not.toBeInTheDocument();
    fireNetworkEvent("offline");
    expect(screen.getByTestId("offline-banner")).toBeInTheDocument();
  });
});
