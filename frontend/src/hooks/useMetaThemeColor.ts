/**
 * useMetaThemeColor
 *
 * Updates the meta theme-color to match the current app theme.
 * This allows the browser chrome (status bar on Android, etc.) to match the app theme.
 */
import { useEffect } from "react";

export function useMetaThemeColor(theme: "light" | "dark") {
  useEffect(() => {
    if (typeof document === "undefined") return;

    // Define theme colors
    const themeColors = {
      light: "#ffffff",
      dark: "#030712", // Stella dark bg color (gray-950)
    };

    const color = themeColors[theme];

    // Update existing meta theme-color tag
    let metaTag = document.querySelector('meta[name="theme-color"]');
    if (!metaTag) {
      metaTag = document.createElement("meta");
      metaTag.setAttribute("name", "theme-color");
      document.head.appendChild(metaTag);
    }

    metaTag.setAttribute("content", color);
  }, [theme]);
}

export default useMetaThemeColor;
