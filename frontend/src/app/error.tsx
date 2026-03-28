"use client";
/**
 * Global error boundary (Next.js 13+ app directory convention).
 * Catches unhandled errors in any page or layout below the root.
 *
 * - Never exposes raw error.message or stack traces to the user.
 * - Logs to Sentry in production, console.error in development.
 */
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      Sentry.captureException(error);
    } else {
      console.error("[GlobalError]", error);
    }
  }, [error]);

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="flex flex-col items-center text-center max-w-md gap-6">
        {/* SVG illustration */}
        <svg viewBox="0 0 80 80" fill="none" className="w-20 h-20 text-blue-500" aria-hidden="true">
          <circle cx="40" cy="40" r="38" stroke="currentColor" strokeWidth="2" />
          <path d="M40 24v20M40 52v4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>

        <div className="flex flex-col gap-2">
          <h1 className="text-2xl md:text-3xl font-bold text-white">Something went wrong</h1>
          <p className="text-gray-400 text-sm md:text-base">
            An unexpected error occurred. Our team has been notified. Please try again or return to
            the markets.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <button
            onClick={reset}
            className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-xl font-semibold transition-colors"
          >
            Try Again
          </button>
          <a
            href="/"
            className="border border-gray-700 hover:border-gray-500 text-gray-300 px-8 py-3 rounded-xl font-semibold transition-colors text-center"
          >
            Back to Markets
          </a>
        </div>
      </div>
    </main>
  );
}
