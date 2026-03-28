/**
 * Tests for /markets/[id]/page.tsx
 * Covers: valid ID rendering, invalid ID 404, and metadata generation
 */
import "@testing-library/jest-dom";
import React from "react";
import { render } from "@testing-library/react";
import { generateMetadata } from "../page";

const MOCK_MARKET = {
  id: 42,
  question: "Will Bitcoin reach $100k before 2027?",
  total_pool: "4200",
  outcomes: ["Yes", "No"],
  end_date: "2026-12-31T00:00:00Z",
};

// Mock next/navigation
jest.mock("next/navigation", () => ({ notFound: jest.fn() }));

// Mock MarketDetailPage to avoid full client component tree
jest.mock("../../../market/[id]/MarketDetailPage", () => ({
  __esModule: true,
  default: ({ marketId }: { marketId: string }) => (
    <div data-testid="market-detail">{marketId}</div>
  ),
}));

// Mock @tanstack/react-query
jest.mock("@tanstack/react-query", () => ({
  QueryClient: jest.fn(() => ({})),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));

global.fetch = jest.fn();

describe("generateMetadata", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns correct OG tags for a valid market", async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ market: MOCK_MARKET }),
    });

    const metadata = await generateMetadata({ params: { id: "42" } });

    expect(metadata.title).toBe(MOCK_MARKET.question);
    expect((metadata.openGraph as { title: string }).title).toBe(MOCK_MARKET.question);
    expect((metadata.openGraph as { url: string }).url).toContain("/markets/42");
    expect((metadata.openGraph as { images: { url: string }[] }).images[0].url).toContain("id=42");
    expect((metadata.alternates as { canonical: string }).canonical).toContain("/markets/42");
    expect(metadata.description).toContain("Pool: 4,200 XLM");
  });

  it("returns 'Market Not Found' title for an invalid market ID", async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({ ok: false, json: async () => ({}) });

    const metadata = await generateMetadata({ params: { id: "999" } });

    expect(metadata.title).toBe("Market Not Found");
    expect(metadata.openGraph).toBeUndefined();
  });

  it("returns 'Market Not Found' title when fetch throws", async () => {
    (fetch as jest.Mock).mockRejectedValueOnce(new Error("Network error"));

    const metadata = await generateMetadata({ params: { id: "1" } });

    expect(metadata.title).toBe("Market Not Found");
  });
});

describe("MarketsDetailPage (default export)", () => {
  const { notFound } = jest.requireMock("next/navigation");

  beforeEach(() => jest.clearAllMocks());

  it("calls notFound() for an invalid market ID", async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({ ok: false, json: async () => ({}) });

    const { default: Page } = await import("../page");
    await Page({ params: { id: "999" } });

    expect(notFound).toHaveBeenCalled();
  });

  it("renders MarketDetailPage for a valid market ID", async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ market: MOCK_MARKET }),
    });

    const { default: Page } = await import("../page");
    const jsx = await Page({ params: { id: "42" } });
    const { getByTestId } = render(jsx as React.ReactElement);

    expect(getByTestId("market-detail").textContent).toBe("42");
  });
});
