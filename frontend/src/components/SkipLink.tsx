"use client";
/**
 * SkipLink Component
 * 
 * Provides keyboard-accessible skip-to-content link for screen reader users.
 * Appears at the very top of the page and is hidden visually but available to assistive technologies.
 * 
 * WCAG 2.1 AA Requirement: 2.4.1 Bypass Blocks (Level A)
 * Users must be able to bypass repetitive content like navigation.
 * 
 * Usage: Place at the top of the root layout before main content.
 */

export default function SkipLink() {
  const handleSkip = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
      mainContent.focus();
      mainContent.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <a
      href="#main-content"
      onClick={handleSkip}
      className="sr-only focus:not-sr-only focus:fixed focus:top-0 focus:left-0 focus:z-50 focus:bg-blue-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-b-lg"
      aria-label="Skip to main content"
    >
      Skip to main content
    </a>
  );
}
