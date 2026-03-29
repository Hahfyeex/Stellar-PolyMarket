/**
 * Tests for useScrollRestoration hook
 */
import { renderHook } from "@testing-library/react";
import { useScrollRestoration } from "../useScrollRestoration";
import { usePathname } from "next/navigation";

// Mock next/navigation
jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
  useRouter: jest.fn(),
}));

describe("useScrollRestoration", () => {
  let mockElementRef: React.RefObject<HTMLDivElement>;
  let mockElement: Partial<HTMLDivElement>;

  beforeEach(() => {
    // Clear sessionStorage
    sessionStorage.clear();

    // Create mock element
    mockElement = {
      scrollTop: 0,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };

    mockElementRef = {
      current: mockElement as HTMLDivElement,
    };

    (usePathname as jest.Mock).mockReturnValue("/test-page");
  });

  it("restores scroll position on mount", () => {
    sessionStorage.setItem("stella_scroll_/test-page", "100");

    renderHook(() => useScrollRestoration(mockElementRef));

    expect(mockElement.scrollTop).toBe(100);
  });

  it("saves scroll position on scroll event", () => {
    renderHook(() => useScrollRestoration(mockElementRef));

    // Simulate scroll event
    mockElement.scrollTop = 50;
    const scrollHandler = (mockElement.addEventListener as jest.Mock).mock.calls.find(
      (call) => call[0] === "scroll"
    )?.[1];

    if (scrollHandler) {
      scrollHandler();
    }

    expect(sessionStorage.getItem("stella_scroll_/test-page")).toBe("50");
  });

  it("removes scroll listener on unmount", () => {
    const { unmount } = renderHook(() => useScrollRestoration(mockElementRef));

    unmount();

    expect(mockElement.removeEventListener).toHaveBeenCalledWith(
      "scroll",
      expect.any(Function)
    );
  });

  it("uses path-specific storage keys", () => {
    (usePathname as jest.Mock).mockReturnValue("/market/123");

    renderHook(() => useScrollRestoration(mockElementRef));

    mockElement.scrollTop = 75;
    const scrollHandler = (mockElement.addEventListener as jest.Mock).mock.calls.find(
      (call) => call[0] === "scroll"
    )?.[1];

    if (scrollHandler) {
      scrollHandler();
    }

    expect(sessionStorage.getItem("stella_scroll_/market/123")).toBe("75");
  });
});
