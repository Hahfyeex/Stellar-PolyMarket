/**
 * ThemeScript
 *
 * Injects a blocking <script> into <head> that sets data-theme on <html>
 * BEFORE the first paint — eliminating flash of wrong theme (FOUC).
 *
 * Priority order:
 *   1. localStorage "stella_theme" (user's explicit preference)
 *   2. prefers-color-scheme media query (OS preference)
 *   3. "dark" (fallback)
 *
 * This must be a Server Component rendered inside <head> so it runs
 * synchronously before any CSS or React hydration.
 */
export default function ThemeScript() {
  const script = `
(function() {
  try {
    var stored = localStorage.getItem('stella_theme');
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.setAttribute('data-theme', stored);
    } else {
      var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    }
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`.trim();

  // dangerouslySetInnerHTML is intentional — this is a known, static script
  // eslint-disable-next-line react/no-danger
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
