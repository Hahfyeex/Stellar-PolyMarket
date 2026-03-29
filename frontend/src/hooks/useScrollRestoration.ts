/**
 * useScrollRestoration
 *
 * Saves and restores scroll position when navigating between pages.
 * Uses sessionStorage to persist scroll position for the current route.
 * Restored automatically when the page is revisited during the same session.
 */
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

const SCROLL_STORAGE_PREFIX = "stella_scroll_";

export function useScrollRestoration(elementRef: React.RefObject<HTMLDivElement>) {
  const pathname = usePathname();

  useEffect(() => {
    if (!elementRef.current) return;

    const storageKey = `${SCROLL_STORAGE_PREFIX}${pathname}`;

    // Restore scroll position when page loads
    const savedScroll = typeof window !== "undefined" ? sessionStorage.getItem(storageKey) : null;
    if (savedScroll) {
      const scrollTop = parseInt(savedScroll, 10);
      elementRef.current.scrollTop = scrollTop;
    }

    // Save scroll position when navigating away
    const handleScroll = () => {
      if (elementRef.current) {
        sessionStorage.setItem(storageKey, elementRef.current.scrollTop.toString());
      }
    };

    const element = elementRef.current;
    element.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      element.removeEventListener("scroll", handleScroll);
    };
  }, [pathname, elementRef]);
}

export default useScrollRestoration;
