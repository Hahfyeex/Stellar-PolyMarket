/**
 * Tests for MetadataUnavailable component.
 *
 * Verifies that the placeholder renders correctly in all prop combinations
 * and does not break surrounding layouts.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import MetadataUnavailable from "../MetadataUnavailable";

describe("MetadataUnavailable", () => {
  // ── Default render ──────────────────────────────────────────────────────────

  it("renders without crashing when no props are supplied", () => {
    render(<MetadataUnavailable />);
    expect(screen.getByTestId("metadata-unavailable")).toBeInTheDocument();
  });

  it("has role='status' for screen reader announcements", () => {
    render(<MetadataUnavailable />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("has the correct aria-label", () => {
    render(<MetadataUnavailable />);
    expect(
      screen.getByLabelText("Market metadata unavailable")
    ).toBeInTheDocument();
  });

  it("displays the heading text", () => {
    render(<MetadataUnavailable />);
    expect(
      screen.getByText("Market metadata unavailable")
    ).toBeInTheDocument();
  });

  it("displays the default explanatory copy", () => {
    render(<MetadataUnavailable />);
    expect(
      screen.getByText(/Could not retrieve metadata/i)
    ).toBeInTheDocument();
  });

  it("renders the warning icon", () => {
    render(<MetadataUnavailable />);
    // Icon is rendered as text — verify it is in the DOM.
    expect(screen.getByTestId("metadata-unavailable").textContent).toContain("⚠️");
  });

  // ── Optional message prop ───────────────────────────────────────────────────

  it("does not render the custom message element when message is not provided", () => {
    render(<MetadataUnavailable />);
    expect(
      screen.queryByTestId("metadata-unavailable-message")
    ).not.toBeInTheDocument();
  });

  it("renders the custom message when message prop is supplied", () => {
    render(<MetadataUnavailable message="IPFS gateway timed out." />);
    expect(
      screen.getByTestId("metadata-unavailable-message")
    ).toBeInTheDocument();
    expect(
      screen.getByText("IPFS gateway timed out.")
    ).toBeInTheDocument();
  });

  it("renders a long custom message without truncation", () => {
    const longMsg = "A".repeat(200);
    render(<MetadataUnavailable message={longMsg} />);
    expect(screen.getByTestId("metadata-unavailable-message")).toHaveTextContent(longMsg);
  });

  // ── className prop ──────────────────────────────────────────────────────────

  it("applies additional className to the container", () => {
    render(<MetadataUnavailable className="my-custom-class" />);
    const container = screen.getByTestId("metadata-unavailable");
    expect(container.className).toContain("my-custom-class");
  });

  it("retains base classes alongside a custom className", () => {
    render(<MetadataUnavailable className="extra" />);
    const container = screen.getByTestId("metadata-unavailable");
    // Base classes should be present
    expect(container.className).toContain("rounded-lg");
    expect(container.className).toContain("extra");
  });

  it("uses an empty string as the default className without breaking layout", () => {
    render(<MetadataUnavailable />);
    const container = screen.getByTestId("metadata-unavailable");
    // Empty string means no extra class added; base classes remain
    expect(container.className).toContain("text-center");
  });

  // ── Snapshot regression guard ───────────────────────────────────────────────

  it("matches snapshot with no props", () => {
    const { asFragment } = render(<MetadataUnavailable />);
    expect(asFragment()).toMatchSnapshot();
  });

  it("matches snapshot with message and className", () => {
    const { asFragment } = render(
      <MetadataUnavailable message="Timeout after 5s" className="mt-4" />
    );
    expect(asFragment()).toMatchSnapshot();
  });
});
