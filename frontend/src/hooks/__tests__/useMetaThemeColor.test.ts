/**
 * Tests for useMetaThemeColor hook
 */
import { renderHook } from "@testing-library/react";
import { useMetaThemeColor } from "../useMetaThemeColor";

describe("useMetaThemeColor", () => {
  let metaTag: HTMLMetaElement | null;

  beforeEach(() => {
    // Remove any existing theme-color meta tag
    metaTag = document.querySelector('meta[name="theme-color"]');
    if (metaTag) {
      metaTag.remove();
    }
  });

  afterEach(() => {
    // Cleanup
    metaTag = document.querySelector('meta[name="theme-color"]');
    if (metaTag) {
      metaTag.remove();
    }
  });

  it("creates meta theme-color tag if it doesn't exist", () => {
    renderHook(() => useMetaThemeColor("dark"));

    metaTag = document.querySelector('meta[name="theme-color"]');
    expect(metaTag).toBeInTheDocument();
  });

  it("sets correct color for dark theme", () => {
    renderHook(() => useMetaThemeColor("dark"));

    metaTag = document.querySelector('meta[name="theme-color"]');
    expect(metaTag).toHaveAttribute("content", "#030712");
  });

  it("sets correct color for light theme", () => {
    renderHook(() => useMetaThemeColor("light"));

    metaTag = document.querySelector('meta[name="theme-color"]');
    expect(metaTag).toHaveAttribute("content", "#ffffff");
  });

  it("updates meta tag color when theme changes", () => {
    const { rerender } = renderHook(
      ({ theme }) => useMetaThemeColor(theme),
      { initialProps: { theme: "dark" as const } }
    );

    metaTag = document.querySelector('meta[name="theme-color"]');
    expect(metaTag).toHaveAttribute("content", "#030712");

    rerender({ theme: "light" as const });

    metaTag = document.querySelector('meta[name="theme-color"]');
    expect(metaTag).toHaveAttribute("content", "#ffffff");
  });

  it("updates existing meta tag instead of creating a new one", () => {
    // Create an initial meta tag
    const existingTag = document.createElement("meta");
    existingTag.setAttribute("name", "theme-color");
    existingTag.setAttribute("content", "#000000");
    document.head.appendChild(existingTag);

    renderHook(() => useMetaThemeColor("dark"));

    const allMetaTags = document.querySelectorAll('meta[name="theme-color"]');
    expect(allMetaTags.length).toBe(1);
    expect(allMetaTags[0]).toHaveAttribute("content", "#030712");
  });
});
