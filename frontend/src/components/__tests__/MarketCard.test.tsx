/**
 * Tests for MarketCard volatility pulse animation
 * Feature: high-volatility-pulse (#122)
 */
import React from "react";
import { render, screen, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import MarketCard from "../MarketCard";
import { VOLATILITY_THRESHOLD } from "../../lib/constants";

const SAMPLE_MARKET = {
  id: 1,
  question: "Will Bitcoin reach $100k?",
  end_date: "2026-12-31T00:00:00Z",
  outcomes: ["Yes", "No"],
  resolved: false,
  winning_outcome: null,
  total_pool: "4200",
};

describe("MarketCard — Volatility Pulse Animation", () => {
  it("does not apply pulse class on initial render", () => {
    render(
      <MarketCard market={SAMPLE_MARKET} walletAddress={null} odds={50} />
    );
    const card = screen.getByTestId("market-card");
    expect(card).not.toHaveClass("pulse-green");
    expect(card).not.toHaveClass("pulse-red");
  });

  it("applies pulse-green when odds increase above threshold", () => {
    const { rerender } = render(
      <MarketCard market={SAMPLE_MARKET} walletAddress={null} odds={50} />
    );

    // Increase odds by more than VOLATILITY_THRESHOLD (5%)
    const newOdds = 50 * (1 + (VOLATILITY_THRESHOLD + 1) / 100);
    rerender(
      <MarketCard market={SAMPLE_MARKET} walletAddress={null} odds={newOdds} />
    );

    const card = screen.getByTestId("market-card");
    expect(card).toHaveClass("pulse-green");
  });

  it("applies pulse-red when odds decrease above threshold", () => {
    const { rerender } = render(
      <MarketCard market={SAMPLE_MARKET} walletAddress={null} odds={50} />
    );

    // Decrease odds by more than VOLATILITY_THRESHOLD (5%)
    const newOdds = 50 * (1 - (VOLATILITY_THRESHOLD + 1) / 100);
    rerender(
      <MarketCard market={SAMPLE_MARKET} walletAddress={null} odds={newOdds} />
    );

    const card = screen.getByTestId("market-card");
    expect(card).toHaveClass("pulse-red");
  });

  it("does not apply pulse class when change is below threshold", () => {
    const { rerender } = render(
      <MarketCard market={SAMPLE_MARKET} walletAddress={null} odds={50} />
    );

    // Change by less than VOLATILITY_THRESHOLD
    const newOdds = 50 * (1 + (VOLATILITY_THRESHOLD - 1) / 100);
    rerender(
      <MarketCard market={SAMPLE_MARKET} walletAddress={null} odds={newOdds} />
    );

    const card = screen.getByTestId("market-card");
    expect(card).not.toHaveClass("pulse-green");
    expect(card).not.toHaveClass("pulse-red");
  });

  it("removes pulse class after animation ends", () => {
    const { rerender } = render(
      <MarketCard market={SAMPLE_MARKET} walletAddress={null} odds={50} />
    );

    // Trigger pulse
    rerender(
      <MarketCard market={SAMPLE_MARKET} walletAddress={null} odds={60} />
    );

    const card = screen.getByTestId("market-card");
    expect(card).toHaveClass("pulse-green");

    // Simulate animation end
    act(() => {
      card.dispatchEvent(new Event("animationend", { bubbles: true }));
    });

    expect(card).not.toHaveClass("pulse-green");
  });

  it("works correctly when multiple cards exist simultaneously", () => {
    const market2 = { ...SAMPLE_MARKET, id: 2, question: "Will ETH reach $10k?" };

    const { rerender } = render(
      <>
        <MarketCard market={SAMPLE_MARKET} walletAddress={null} odds={50} />
        <MarketCard market={market2} walletAddress={null} odds={30} />
      </>
    );

    rerender(
      <>
        <MarketCard market={SAMPLE_MARKET} walletAddress={null} odds={60} />
        <MarketCard market={market2} walletAddress={null} odds={25} />
      </>
    );

    const cards = screen.getAllByTestId("market-card");
    expect(cards[0]).toHaveClass("pulse-green");
    expect(cards[1]).toHaveClass("pulse-red");
  });
});

describe("VOLATILITY_THRESHOLD constant", () => {
  it("is exported and equals 5", () => {
    expect(VOLATILITY_THRESHOLD).toBe(5);
  });
});
