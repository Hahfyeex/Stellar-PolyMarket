/**
 * Custom 404 page (Next.js 13+ app directory convention).
 * Shown for any route that does not match a page file.
 */
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="flex flex-col items-center text-center max-w-md gap-6">
        {/* SVG illustration */}
        <svg viewBox="0 0 80 80" fill="none" className="w-20 h-20 text-blue-500" aria-hidden="true">
          <circle cx="40" cy="40" r="38" stroke="currentColor" strokeWidth="2" />
          <text
            x="40"
            y="48"
            textAnchor="middle"
            fontSize="28"
            fontWeight="bold"
            fill="currentColor"
          >
            ?
          </text>
        </svg>

        <div className="flex flex-col gap-2">
          <h1 className="text-2xl md:text-3xl font-bold text-white">Page not found</h1>
          <p className="text-gray-400 text-sm md:text-base">
            The page you&apos;re looking for doesn&apos;t exist or has been moved. Head back to the
            markets to keep predicting.
          </p>
        </div>

        <Link
          href="/"
          className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-xl font-semibold transition-colors"
        >
          Back to Markets
        </Link>
      </div>
    </main>
  );
}
