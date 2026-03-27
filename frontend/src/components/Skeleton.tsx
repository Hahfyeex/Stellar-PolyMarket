"use client";

/**
 * Base Skeleton Component
 *
 * Provides a reusable skeleton loading placeholder with CSS shimmer animation.
 * Used as the foundation for layout-specific skeleton components.
 *
 * The shimmer effect creates a smooth, flowing animation that improves
 * perceived performance and reduces the jarring feeling of layout shifts.
 *
 * Component Usage:
 * - Direct use: <Skeleton className="h-6 w-40 mb-2" />
 * - With custom element: <Skeleton element="div" className="h-10 bg-gray-800" />
 * - Multiple skeletons: <SkeletonGrid count={3} className="h-20" />
 */

interface Props {
  /**
   * CSS classname for sizing and spacing
   * Example: "h-20 w-full mb-4" for a 80px tall, full-width element with bottom margin
   */
  className?: string;

  /**
   * HTML element type (default: "div")
   * Can be "div", "span", "p", etc.
   */
  element?: "div" | "span" | "p" | "li" | "tr" | "td";

  /**
   * Number of skeleton items to render
   * If provided, renders multiple skeletons in sequence
   */
  count?: number;

  /**
   * Space between multiple skeletons
   * Only used when count > 1
   */
  gap?: string;
}

export default function Skeleton({
  className = "h-12 w-full",
  element: Element = "div",
  count,
  gap = "0.5rem",
}: Props) {
  // If count is specified, render multiple skeletons
  if (count && count > 0) {
    return (
      <>
        {Array.from({ length: count }).map((_, i) => (
          <Element
            key={i}
            className={`skeleton ${className}`}
            style={i < count - 1 ? { marginBottom: gap } : undefined}
          />
        ))}
      </>
    );
  }

  return <Element className={`skeleton ${className}`} />;
}

/**
 * Global Shimmer Animation Styles
 *
 * This style block defines the CSS shimmer effect that animates across skeleton elements.
 *
 * How the shimmer works:
 * 1. background-image: Creates a linear gradient from transparent → light gray → transparent
 * 2. background-size: 200% - The gradient is 200% of the element width
 * 3. background-position: Animates horizontally (left to right) over 1.5 seconds
 * 4. The effect repeats infinitely, giving the impression of "loading" data
 *
 * The shimmer is GPU-accelerated using background-position animation,
 * which is more performant than animating width or other properties.
 */

// This should be imported in your global CSS or within a <style> tag in layout.tsx
// Insert the following CSS into your global stylesheet or Tailwind config:

export const SKELETON_STYLES = `
@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: calc(200% + 100px) 0;
  }
}

.skeleton {
  background-color: rgb(31, 41, 55); /* bg-gray-800 */
  background-image: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.1) 20%,
    rgba(255, 255, 255, 0.1) 60%,
    transparent
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 0.5rem;
}
`;
