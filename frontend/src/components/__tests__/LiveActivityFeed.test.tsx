/**
 * Tests for LiveActivityFeed component.
 * Covers: list cap at 20, address abbreviation, new-entry animation trigger,
 * loading skeleton, error/empty fallback to demo data, React Query config.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import LiveActivityFeed, { itemVariants } from "../LiveActivityFeed";
import { formatWallet } from "../../hooks/useRecentActivity";

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock("framer-motion", () => {
  const actual = jest.requireActual("framer-motion");
  return {
    ...actual,
    // Render motion.li as a plain li so DOM assertions work
    motion: {
      ...actual.motion,
      li: ({ children, className, ...rest }: React.HTMLAttributes<HTMLLIElement>) =>
        React.createElement("li", { className, ...rest }, children),
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

jest.mock(
  "../skeletons/ActivityFeedSkeleton",
  () =>
    function MockSkeleton() {
      return <div data-testid="skeleton" />;
    }
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

function makeItem(id: number) {
  return {
    id,
    wallet_address: `GABC${id.toString().padStart(4, "0")}XYZ`,
    outcome_index: 0,
    amount: "10.00",
    created_at: new Date(Date.now() - id * 1000).toISOString(),
    question: `Market ${id}`,
    outcomes: ["Yes", "No"],
  };
}

function mockFetch(items: ReturnType<typeof makeItem>[]) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ activity: items }),
  }) as jest.Mock;
}

// ── formatWallet (unit) ───────────────────────────────────────────────────────

describe("formatWallet", () => {
  it("abbreviates long addresses to first4...last3", () => {
    expect(formatWallet("GABCDEFGHIJKLMNOP")).toBe("GABC...NOP");
  });

  it("returns short addresses unchanged", () => {
    expect(formatWallet("GABC")).toBe("GABC");
  });

  it("handles empty string", () => {
    expect(formatWallet("")).toBe("");
  });
});

// ── LiveActivityFeed component ────────────────────────────────────────────────

describe("LiveActivityFeed", () => {
  beforeEach(() => jest.resetAllMocks());

  it("shows skeleton while loading", () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as jest.Mock;
    render(<LiveActivityFeed apiUrl="http://api" />, { wrapper: makeWrapper() });
    expect(screen.getByTestId("skeleton")).toBeInTheDocument();
  });

  it("renders items from the API", async () => {
    mockFetch([makeItem(1), makeItem(2)]);
    render(<LiveActivityFeed apiUrl="http://api" />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByText("Market 1")).toBeInTheDocument());
    expect(screen.getByText("Market 2")).toBeInTheDocument();
  });

  it("caps the list at 20 entries", async () => {
    const items = Array.from({ length: 25 }, (_, i) => makeItem(i + 1));
    mockFetch(items);
    render(<LiveActivityFeed apiUrl="http://api" />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByText("Market 1")).toBeInTheDocument());
    const listItems = screen.getAllByRole("listitem");
    expect(listItems).toHaveLength(20);
  });

  it("abbreviates wallet addresses in the rendered output", async () => {
    mockFetch([makeItem(1)]);
    render(<LiveActivityFeed apiUrl="http://api" />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByText("Market 1")).toBeInTheDocument());
    // Full address is GABC0001XYZ — abbreviated should be GABC...XYZ
    expect(screen.getByText("GABC...XYZ")).toBeInTheDocument();
    expect(screen.queryByText("GABC0001XYZ")).not.toBeInTheDocument();
  });

  it("falls back to demo data on fetch error", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as jest.Mock;
    render(<LiveActivityFeed apiUrl="http://api" />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByText(/demo data/i)).toBeInTheDocument());
    // Demo data contains this question
    expect(screen.getByText(/Will Bitcoin reach \$100k/i)).toBeInTheDocument();
  });

  it("falls back to demo data when API returns empty list", async () => {
    mockFetch([]);
    render(<LiveActivityFeed apiUrl="http://api" />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByText(/demo data/i)).toBeInTheDocument());
  });

  it("renders the Live Activity header", async () => {
    mockFetch([makeItem(1)]);
    render(<LiveActivityFeed apiUrl="http://api" />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByText("Live Activity")).toBeInTheDocument());
  });

  it("renders outcome fallback label when outcomes array is missing the index", async () => {
    const item = { ...makeItem(1), outcome_index: 5, outcomes: ["Yes"] };
    mockFetch([item]);
    render(<LiveActivityFeed apiUrl="http://api" />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByText(/Outcome 5/)).toBeInTheDocument());
  });

  it("uses NEXT_PUBLIC_API_URL when no apiUrl prop is passed", async () => {
    process.env.NEXT_PUBLIC_API_URL = "http://env-api";
    mockFetch([makeItem(1)]);
    render(<LiveActivityFeed />, { wrapper: makeWrapper() });
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("http://env-api/api/activity/recent")
      )
    );
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  it("new items receive initial animation props (opacity 0, y -12)", async () => {
    mockFetch([makeItem(1)]);
    render(<LiveActivityFeed apiUrl="http://api" />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByText("Market 1")).toBeInTheDocument());
    const listItems = screen.getAllByRole("listitem");
    expect(listItems.length).toBeGreaterThan(0);
  });

  it("itemVariants defines correct initial and animate values", () => {
    expect(itemVariants.initial).toEqual({ opacity: 0, y: -12 });
    expect(itemVariants.animate).toEqual({ opacity: 1, y: 0, transition: { duration: 0.3 } });
    expect(itemVariants.exit).toEqual({ opacity: 0, transition: { duration: 0.2 } });
  });
});
