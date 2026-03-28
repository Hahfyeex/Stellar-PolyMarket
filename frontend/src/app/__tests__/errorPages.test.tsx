/**
 * Tests for src/app/error.tsx and src/app/not-found.tsx
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import GlobalError from "../error";
import NotFound from "../not-found";

// ── Mock Sentry ───────────────────────────────────────────────────────────────

jest.mock("@sentry/nextjs", () => ({ captureException: jest.fn() }));

// Pull the mock reference after jest.mock is hoisted
import * as Sentry from "@sentry/nextjs";
const captureException = Sentry.captureException as jest.Mock;

// ── Mock next/link ────────────────────────────────────────────────────────────

jest.mock("next/link", () => {
  function MockLink({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }
  return MockLink;
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TEST_ERROR = Object.assign(new Error("raw internal message"), { digest: "abc123" });

// ── GlobalError ───────────────────────────────────────────────────────────────

describe("GlobalError (error.tsx)", () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => consoleErrorSpy.mockRestore());

  it("renders a human-readable heading", () => {
    render(<GlobalError error={TEST_ERROR} reset={jest.fn()} />);
    expect(screen.getByRole("heading")).toHaveTextContent("Something went wrong");
  });

  it("renders a Try Again button", () => {
    render(<GlobalError error={TEST_ERROR} reset={jest.fn()} />);
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("renders a Back to Markets link pointing to /", () => {
    render(<GlobalError error={TEST_ERROR} reset={jest.fn()} />);
    expect(screen.getByRole("link", { name: /back to markets/i })).toHaveAttribute("href", "/");
  });

  it("does NOT expose raw error.message in the UI", () => {
    render(<GlobalError error={TEST_ERROR} reset={jest.fn()} />);
    expect(screen.queryByText(/raw internal message/i)).not.toBeInTheDocument();
  });

  it("does NOT expose stack traces in the UI", () => {
    render(<GlobalError error={TEST_ERROR} reset={jest.fn()} />);
    expect(screen.queryByText(/at Object/i)).not.toBeInTheDocument();
  });

  it("calls reset() when Try Again is clicked", () => {
    const reset = jest.fn();
    render(<GlobalError error={TEST_ERROR} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("calls Sentry.captureException in production", () => {
    const origEnv = process.env.NODE_ENV;
    Object.defineProperty(process.env, "NODE_ENV", { value: "production", configurable: true });
    render(<GlobalError error={TEST_ERROR} reset={jest.fn()} />);
    expect(captureException).toHaveBeenCalledWith(TEST_ERROR);
    Object.defineProperty(process.env, "NODE_ENV", { value: origEnv, configurable: true });
  });

  it("calls console.error in development (not Sentry)", () => {
    const origEnv = process.env.NODE_ENV;
    Object.defineProperty(process.env, "NODE_ENV", { value: "development", configurable: true });
    render(<GlobalError error={TEST_ERROR} reset={jest.fn()} />);
    expect(consoleErrorSpy).toHaveBeenCalledWith("[GlobalError]", TEST_ERROR);
    expect(captureException).not.toHaveBeenCalled();
    Object.defineProperty(process.env, "NODE_ENV", { value: origEnv, configurable: true });
  });
});

// ── NotFound ──────────────────────────────────────────────────────────────────

describe("NotFound (not-found.tsx)", () => {
  it("renders a Page not found heading", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading")).toHaveTextContent("Page not found");
  });

  it("renders a Back to Markets link pointing to /", () => {
    render(<NotFound />);
    const link = screen.getByRole("link", { name: /back to markets/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/");
  });

  it("renders a descriptive message", () => {
    render(<NotFound />);
    expect(screen.getByText(/doesn't exist or has been moved/i)).toBeInTheDocument();
  });
});
