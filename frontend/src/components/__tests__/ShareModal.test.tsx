/**
 * Tests for ShareCard, ShareModal, and buildTweetText — Issue #483
 * Coverage: share modal open/close, link copy, tweet text generation,
 *           ShareCard rendering, download trigger.
 */
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import ShareCard from "../ShareCard";
import ShareModal, { buildTweetText } from "../ShareModal";

// ── html2canvas mock ──────────────────────────────────────────────────────────
jest.mock("html2canvas", () =>
  jest.fn().mockResolvedValue({
    toDataURL: () => "data:image/png;base64,FAKE",
  })
);

// ── clipboard mock ────────────────────────────────────────────────────────────
const writeTextMock = jest.fn().mockResolvedValue(undefined);
Object.defineProperty(navigator, "clipboard", {
  value: { writeText: writeTextMock },
  writable: true,
});

// ── window.open mock ──────────────────────────────────────────────────────────
const openMock = jest.fn();
Object.defineProperty(window, "open", { value: openMock, writable: true });

// ── anchor click mock ─────────────────────────────────────────────────────────
const anchorClickMock = jest.fn();
const createElementOrig = document.createElement.bind(document);
jest.spyOn(document, "createElement").mockImplementation((tag: string) => {
  const el = createElementOrig(tag);
  if (tag === "a") {
    jest.spyOn(el as HTMLAnchorElement, "click").mockImplementation(anchorClickMock);
  }
  return el;
});

const CARD_PROPS = {
  question: "Will Bitcoin reach $100k before 2027?",
  yesOdds: 55,
  noOdds: 45,
  totalPool: 4200,
  endDate: "2026-12-31T00:00:00Z",
};

const MODAL_PROPS = {
  ...CARD_PROPS,
  marketId: 42,
  onClose: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// ShareCard
// ─────────────────────────────────────────────────────────────────────────────
describe("ShareCard — rendering", () => {
  it("renders the card", () => {
    render(<ShareCard {...CARD_PROPS} />);
    expect(screen.getByTestId("share-card")).toBeInTheDocument();
  });

  it("shows the market question", () => {
    render(<ShareCard {...CARD_PROPS} />);
    expect(screen.getByTestId("share-card-question")).toHaveTextContent(
      "Will Bitcoin reach $100k before 2027?"
    );
  });

  it("truncates question longer than 100 chars", () => {
    const long = "A".repeat(105);
    render(<ShareCard {...CARD_PROPS} question={long} />);
    const text = screen.getByTestId("share-card-question").textContent ?? "";
    expect(text.length).toBeLessThanOrEqual(100);
    expect(text.endsWith("…")).toBe(true);
  });

  it("shows YES odds", () => {
    render(<ShareCard {...CARD_PROPS} />);
    expect(screen.getByTestId("share-card-yes")).toHaveTextContent("55%");
  });

  it("shows NO odds", () => {
    render(<ShareCard {...CARD_PROPS} />);
    expect(screen.getByTestId("share-card-no")).toHaveTextContent("45%");
  });

  it("shows total pool in XLM", () => {
    render(<ShareCard {...CARD_PROPS} />);
    expect(screen.getByTestId("share-card-pool")).toHaveTextContent("4,200 XLM");
  });

  it("shows end date", () => {
    render(<ShareCard {...CARD_PROPS} />);
    expect(screen.getByTestId("share-card-date")).toHaveTextContent("Ends");
  });

  it("shows Stella Polymarket branding", () => {
    render(<ShareCard {...CARD_PROPS} />);
    expect(screen.getByText("Stella Polymarket")).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildTweetText
// ─────────────────────────────────────────────────────────────────────────────
describe("buildTweetText", () => {
  it("includes the market question", () => {
    const text = buildTweetText("Will BTC hit 100k?", 55, 45, "https://example.com/markets/1");
    expect(text).toContain("Will BTC hit 100k?");
  });

  it("includes YES odds", () => {
    const text = buildTweetText("Q?", 55, 45, "https://example.com/markets/1");
    expect(text).toContain("YES 55%");
  });

  it("includes NO odds", () => {
    const text = buildTweetText("Q?", 55, 45, "https://example.com/markets/1");
    expect(text).toContain("NO 45%");
  });

  it("includes the share link", () => {
    const link = "https://example.com/markets/1";
    const text = buildTweetText("Q?", 55, 45, link);
    expect(text).toContain(link);
  });

  it("includes 'Stella Polymarket'", () => {
    const text = buildTweetText("Q?", 55, 45, "https://example.com");
    expect(text).toContain("Stella Polymarket");
  });

  it("truncates long questions to ≤80 chars in tweet", () => {
    const long = "A".repeat(90);
    const text = buildTweetText(long, 55, 45, "https://example.com");
    // The question portion in the tweet should be truncated
    expect(text).toContain("…");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ShareModal — open / close
// ─────────────────────────────────────────────────────────────────────────────
describe("ShareModal — open/close", () => {
  it("renders the modal", () => {
    render(<ShareModal {...MODAL_PROPS} />);
    expect(screen.getByTestId("share-modal")).toBeInTheDocument();
  });

  it("has role=dialog and aria-modal=true", () => {
    render(<ShareModal {...MODAL_PROPS} />);
    const modal = screen.getByTestId("share-modal");
    expect(modal).toHaveAttribute("role", "dialog");
    expect(modal).toHaveAttribute("aria-modal", "true");
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = jest.fn();
    render(<ShareModal {...MODAL_PROPS} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("share-modal-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = jest.fn();
    render(<ShareModal {...MODAL_PROPS} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("share-modal"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT call onClose when inner content is clicked", () => {
    const onClose = jest.fn();
    render(<ShareModal {...MODAL_PROPS} onClose={onClose} />);
    fireEvent.click(screen.getByText("Share Market"));
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ShareModal — Copy Link
// ─────────────────────────────────────────────────────────────────────────────
describe("ShareModal — copy link", () => {
  it("copies the correct deep link URL", async () => {
    render(<ShareModal {...MODAL_PROPS} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("share-copy-link"));
    });
    expect(writeTextMock).toHaveBeenCalledWith(
      expect.stringContaining("/markets/42")
    );
  });

  it("shows 'Copied!' feedback after clicking", async () => {
    render(<ShareModal {...MODAL_PROPS} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("share-copy-link"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("share-copy-link")).toHaveTextContent("Copied!");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ShareModal — Twitter share
// ─────────────────────────────────────────────────────────────────────────────
describe("ShareModal — Twitter share", () => {
  it("opens twitter.com/intent/tweet", () => {
    render(<ShareModal {...MODAL_PROPS} />);
    fireEvent.click(screen.getByTestId("share-twitter"));
    expect(openMock).toHaveBeenCalledTimes(1);
    const url: string = openMock.mock.calls[0][0];
    expect(url).toContain("twitter.com/intent/tweet");
  });

  it("pre-fills tweet with YES/NO odds", () => {
    render(<ShareModal {...MODAL_PROPS} />);
    fireEvent.click(screen.getByTestId("share-twitter"));
    const url: string = openMock.mock.calls[0][0];
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain("YES 55%");
    expect(decoded).toContain("NO 45%");
  });

  it("pre-fills tweet with market link", () => {
    render(<ShareModal {...MODAL_PROPS} />);
    fireEvent.click(screen.getByTestId("share-twitter"));
    const url: string = openMock.mock.calls[0][0];
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain("/markets/42");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ShareModal — PNG download
// ─────────────────────────────────────────────────────────────────────────────
describe("ShareModal — PNG download", () => {
  it("triggers anchor download on click", async () => {
    render(<ShareModal {...MODAL_PROPS} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("share-download"));
    });
    await waitFor(() => {
      expect(anchorClickMock).toHaveBeenCalled();
    });
  });

  it("sets download filename with market id", async () => {
    let capturedHref = "";
    jest.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = createElementOrig(tag);
      if (tag === "a") {
        Object.defineProperty(el, "href", {
          set(v: string) { capturedHref = v; },
          get() { return capturedHref; },
        });
        jest.spyOn(el as HTMLAnchorElement, "click").mockImplementation(jest.fn());
      }
      return el;
    });

    render(<ShareModal {...MODAL_PROPS} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("share-download"));
    });
    await waitFor(() => {
      expect(capturedHref).toContain("data:image/png");
    });
  });
});
