import React from "react";
import { render, screen, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import OddsTicker from "../OddsTicker";

// Mock framer-motion to avoid animation issues in tests
jest.mock("framer-motion", () => ({
  motion: {
    span: ({ children, className }: any) => <span className={className}>{children}</span>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe("OddsTicker", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders the initial value", () => {
    render(<OddsTicker value={50} />);
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("flashes green when value increases", () => {
    const { rerender } = render(<OddsTicker value={50} />);
    
    // Increase value
    rerender(<OddsTicker value={60} />);
    
    const element = screen.getByText("60%");
    expect(element.className).toContain("text-green-400");
  });

  it("flashes red when value decreases", () => {
    const { rerender } = render(<OddsTicker value={50} />);
    
    // Decrease value
    rerender(<OddsTicker value={40} />);
    
    const element = screen.getByText("40%");
    expect(element.className).toContain("text-red-400");
  });

  it("clears flash color after 600ms", () => {
    const { rerender } = render(<OddsTicker value={50} />);
    rerender(<OddsTicker value={60} />);
    
    expect(screen.getByText("60%").className).toContain("text-green-400");
    
    // Advance time by 600ms
    act(() => {
      jest.advanceTimersByTime(600);
    });
    
    expect(screen.getByText("60%").className).toContain("text-white");
  });

  it("debounces rapid updates", () => {
    const { rerender } = render(<OddsTicker value={50} />);
    
    // Rapid updates
    rerender(<OddsTicker value={55} />);
    rerender(<OddsTicker value={60} />);
    
    // Should still show 55% or wait for 60% after debounce
    // Based on implementation, 60% should be scheduled if within 500ms
    
    expect(screen.getByText("55%")).toBeInTheDocument();
    
    act(() => {
      jest.advanceTimersByTime(500);
    });
    
    expect(screen.getByText("60%")).toBeInTheDocument();
  });
});
