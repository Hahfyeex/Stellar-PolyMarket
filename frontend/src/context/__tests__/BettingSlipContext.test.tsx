/**
 * Tests for BettingSlipContext
 * Covers: addBet, removeBet, clearBets, open/close, queue limit, deduplication
 */
import React from "react";
import { render, screen, act, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { BettingSlipProvider, useBettingSlip, MAX_BETS } from "../BettingSlipContext";

// Helper: renders a component that exposes context actions via data-testid buttons
function TestConsumer() {
  const { isOpen, bets, open, close, addBet, removeBet, clearBets } = useBettingSlip();

  return (
    <div>
      <span data-testid="is-open">{String(isOpen)}</span>
      <span data-testid="bet-count">{bets.length}</span>
      <span data-testid="bet-ids">{bets.map((b) => b.id).join(",")}</span>
      <button data-testid="open" onClick={open} />
      <button data-testid="close" onClick={close} />
      <button
        data-testid="add-bet-1"
        onClick={() =>
          addBet({ marketId: 1, marketTitle: "M1", outcomeIndex: 0, outcomeName: "Yes", amount: 10 })
        }
      />
      <button
        data-testid="add-bet-2"
        onClick={() =>
          addBet({ marketId: 2, marketTitle: "M2", outcomeIndex: 1, outcomeName: "No", amount: 20 })
        }
      />
      <button data-testid="remove-1-0" onClick={() => removeBet("1-0")} />
      <button data-testid="clear" onClick={clearBets} />
    </div>
  );
}

function renderWithProvider() {
  return render(
    <BettingSlipProvider>
      <TestConsumer />
    </BettingSlipProvider>
  );
}

describe("BettingSlipContext", () => {
  it("starts closed with empty bets", () => {
    renderWithProvider();
    expect(screen.getByTestId("is-open").textContent).toBe("false");
    expect(screen.getByTestId("bet-count").textContent).toBe("0");
  });

  it("open() sets isOpen to true", () => {
    renderWithProvider();
    fireEvent.click(screen.getByTestId("open"));
    expect(screen.getByTestId("is-open").textContent).toBe("true");
  });

  it("close() sets isOpen to false", () => {
    renderWithProvider();
    fireEvent.click(screen.getByTestId("open"));
    fireEvent.click(screen.getByTestId("close"));
    expect(screen.getByTestId("is-open").textContent).toBe("false");
  });

  it("addBet() adds a bet and auto-opens the slip", () => {
    renderWithProvider();
    fireEvent.click(screen.getByTestId("add-bet-1"));
    expect(screen.getByTestId("bet-count").textContent).toBe("1");
    expect(screen.getByTestId("is-open").textContent).toBe("true");
  });

  it("addBet() assigns correct composite id (marketId-outcomeIndex)", () => {
    renderWithProvider();
    fireEvent.click(screen.getByTestId("add-bet-1"));
    expect(screen.getByTestId("bet-ids").textContent).toBe("1-0");
  });

  it("addBet() deduplicates same market+outcome (replaces existing)", () => {
    renderWithProvider();
    fireEvent.click(screen.getByTestId("add-bet-1"));
    fireEvent.click(screen.getByTestId("add-bet-1"));
    expect(screen.getByTestId("bet-count").textContent).toBe("1");
  });

  it("addBet() allows different market+outcome combinations", () => {
    renderWithProvider();
    fireEvent.click(screen.getByTestId("add-bet-1"));
    fireEvent.click(screen.getByTestId("add-bet-2"));
    expect(screen.getByTestId("bet-count").textContent).toBe("2");
  });

  it("removeBet() removes the correct bet by id", () => {
    renderWithProvider();
    fireEvent.click(screen.getByTestId("add-bet-1"));
    fireEvent.click(screen.getByTestId("add-bet-2"));
    fireEvent.click(screen.getByTestId("remove-1-0"));
    expect(screen.getByTestId("bet-count").textContent).toBe("1");
    expect(screen.getByTestId("bet-ids").textContent).toBe("2-1");
  });

  it("clearBets() empties the queue", () => {
    renderWithProvider();
    fireEvent.click(screen.getByTestId("add-bet-1"));
    fireEvent.click(screen.getByTestId("add-bet-2"));
    fireEvent.click(screen.getByTestId("clear"));
    expect(screen.getByTestId("bet-count").textContent).toBe("0");
  });

  it("throws if useBettingSlip is used outside provider", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow(
      "useBettingSlip must be used inside BettingSlipProvider"
    );
    spy.mockRestore();
  });
});

// Queue limit tests using a component that fills the queue
describe("BettingSlipContext — queue limit", () => {
  function QueueFiller() {
    const { bets, addBet } = useBettingSlip();
    const [queueFull, setQueueFull] = React.useState(false);

    function addMany(n: number) {
      for (let i = 0; i < n; i++) {
        addBet(
          { marketId: i, marketTitle: `M${i}`, outcomeIndex: 0, outcomeName: "Yes", amount: 10 },
          () => setQueueFull(true)
        );
      }
    }

    return (
      <div>
        <span data-testid="count">{bets.length}</span>
        <span data-testid="queue-full">{String(queueFull)}</span>
        <button data-testid="fill-5" onClick={() => addMany(5)} />
        <button data-testid="fill-6" onClick={() => addMany(6)} />
      </div>
    );
  }

  it(`allows up to MAX_BETS (${MAX_BETS}) bets`, () => {
    render(<BettingSlipProvider><QueueFiller /></BettingSlipProvider>);
    fireEvent.click(screen.getByTestId("fill-5"));
    expect(screen.getByTestId("count").textContent).toBe(String(MAX_BETS));
  });

  it("calls onQueueFull callback when 6th bet is attempted", () => {
    render(<BettingSlipProvider><QueueFiller /></BettingSlipProvider>);
    fireEvent.click(screen.getByTestId("fill-6"));
    expect(screen.getByTestId("count").textContent).toBe(String(MAX_BETS));
    expect(screen.getByTestId("queue-full").textContent).toBe("true");
  });
});
