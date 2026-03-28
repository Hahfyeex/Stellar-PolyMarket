/**
 * Tests for market/[id]/page.tsx — generateMetadata, notFound, and rendering
 */

jest.mock("next/navigation", () => ({ notFound: jest.fn() }));
jest.mock("../MarketPageClient", () => ({
  __esModule: true,
  default: ({ marketId }: { marketId: string }) => (
    <div data-testid="market-client">{marketId}</div>
  ),
}));

const MOCK_MARKET = {
  id: 1,
  question: "Will Bitcoin reach $100k before 2027?",
  total_pool: "4200",
  outcomes: ["Yes", "No"],
};

beforeEach(() => {
  jest.resetAllMocks();
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:3001";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  global.fetch = jest.fn();
});

async function importPage() {
  jest.resetModules();
  return import("../page");
}

describe("generateMetadata", () => {
  it("returns correct OG tags for a valid market", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => MOCK_MARKET,
    });

    const { generateMetadata } = await importPage();
    const meta = await generateMetadata({ params: { id: "1" } });

    expect(meta.title).toBe("Will Bitcoin reach $100k before 2027? | Stella Polymarket");
    expect((meta.openGraph as { title: string }).title).toBe(MOCK_MARKET.question);
    expect((meta.alternates as { canonical: string }).canonical).toContain("/market/1");
  });

  it("returns fallback title for unknown market", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });

    const { generateMetadata } = await importPage();
    const meta = await generateMetadata({ params: { id: "999" } });

    expect(meta.title).toBe("Market Not Found | Stella Polymarket");
  });
});

describe("MarketPage (default export)", () => {
  it("calls notFound() for an invalid market ID", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });

    const { default: MarketPage } = await importPage();
    // notFound() throws in Next.js; catch it or check it was invoked
    try {
      await MarketPage({ params: { id: "999" } });
    } catch {
      // notFound may throw — that's fine
    }

    const { notFound: mockedNotFound } = await import("next/navigation");
    expect(mockedNotFound).toHaveBeenCalled();
  });

  it("renders MarketPageClient for a valid market", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => MOCK_MARKET,
    });

    const { default: MarketPage } = await importPage();
    const result = await MarketPage({ params: { id: "1" } });

    // result is a JSX element — check it's not null/undefined
    expect(result).not.toBeNull();
  });
});
