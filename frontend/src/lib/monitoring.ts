/**
 * monitoring.ts
 *
 * Thin wrapper around Sentry for contract error logging.
 * Abstracts the Sentry API so the ErrorBoundary doesn't
 * import Sentry directly — easier to swap or mock in tests.
 *
 * In production: errors go to Sentry with full context.
 * In test/dev without DSN: logs to console only.
 */
import * as Sentry from "@sentry/nextjs";

export interface ErrorContext {
  /** Component or hook that threw */
  component?: string;
  /** Wallet address of the user (for Sentry user context) */
  walletAddress?: string;
  /** Any extra key/value pairs to attach to the Sentry event */
  extra?: Record<string, unknown>;
}

/**
 * Log a contract error to Sentry with structured context.
 * Safe to call in componentDidCatch — never throws.
 */
export function logContractError(error: Error, context: ErrorContext = {}): void {
  try {
    Sentry.withScope((scope) => {
      // Tag for easy filtering in Sentry dashboard
      scope.setTag("error_type", "contract_error");

      if (context.component) {
        scope.setTag("component", context.component);
      }

      if (context.walletAddress) {
        scope.setUser({ id: context.walletAddress });
      }

      if (context.extra) {
        scope.setExtras(context.extra);
      }

      Sentry.captureException(error);
    });
  } catch {
    // Sentry not initialised (e.g. missing DSN in dev) — fall back to console
    console.error("[ContractError]", error.message, context);
  }
}
