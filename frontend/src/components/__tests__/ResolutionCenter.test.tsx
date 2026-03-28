import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import ResolutionCenter from "../ResolutionCenter";
import type { Market } from "../../types/market";

const baseMarket: Market = {
  id: 1,
  question: "Will Bitcoin reach $100k before 2027?",
  end_date: "2026-03-20T00:00:00Z",
  outcomes: ["Yes", "No"],
  resolved: false,
  winning_outcome: null,
  total_pool: "4200",
  proposed_outcome: 0,
  resolution_sources: [{ label: "Associated Press", url: "https://apnews.com/" }],
};

describe("ResolutionCenter", () => {
  it("renders the lifecycle stepper labels", () => {
    render(<ResolutionCenter market={{ ...baseMarket, resolution_state: "proposed" }} />);

    expect(screen.getByText("Market Closed")).toBeInTheDocument();
    expect(screen.getByText("Outcome Proposed")).toBeInTheDocument();
    expect(screen.getByText("24h Challenge Window")).toBeInTheDocument();
    expect(screen.getByText("Final Settlement")).toBeInTheDocument();
  });

  it("renders the dispute warning banner and council timer", () => {
    render(
      <ResolutionCenter
        market={{
          ...baseMarket,
          resolution_state: "disputed",
          council_vote_ends_at: "2099-03-25T18:00:00Z",
        }}
      />
    );

    expect(screen.getByText("Dispute Active")).toBeInTheDocument();
    expect(screen.getByText("Council Vote")).toBeInTheDocument();
    expect(screen.getByText(/Funds remain locked/i)).toBeInTheDocument();
  });

  it("renders official source links as buttons", () => {
    render(<ResolutionCenter market={{ ...baseMarket, resolution_state: "settled", resolved: true }} />);

    const link = screen.getByRole("link", { name: "Associated Press" });
    expect(link).toHaveAttribute("href", "https://apnews.com/");
  });
});
