/**
 * ContractErrorBoundary
 *
 * React class component error boundary that wraps any component
 * making Soroban contract calls.
 *
 * On error:
 *   1. Maps the error code to a user-friendly message via CONTRACT_ERROR_MAP
 *   2. Dispatches setContractError() to Redux (visible in DevTools)
 *   3. Logs to Sentry via logContractError()
 *   4. Renders a fallback UI with the mapped message + Retry button
 *
 * Retry:
 *   Calls this.setState({ hasError: false }) which triggers a re-render
 *   of the children, re-attempting the failed operation.
 *
 * Usage:
 *   <ContractErrorBoundary context="MarketCard" store={store}>
 *     <MarketCard ... />
 *   </ContractErrorBoundary>
 *
 *   Or use the convenience HOC:
 *   export default withContractErrorBoundary(MarketCard, "MarketCard");
 */
import React from "react";
import { Store } from "@reduxjs/toolkit";
import { mapContractError } from "../constants/contractErrors";
import { setContractError } from "../store/contractErrorSlice";
import { logContractError } from "../lib/monitoring";

interface Props {
  children: React.ReactNode;
  /** Label used in Sentry + Redux for identifying the throwing component */
  context?: string;
  /** Redux store — injected so the boundary works outside Provider too */
  store?: Store;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ContractErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const { context = "unknown", store } = this.props;

    // 1. Dispatch to Redux store so error is visible in DevTools
    if (store) {
      store.dispatch(
        setContractError({ message: error.message, context })
      );
    }

    // 2. Log to Sentry with component context
    logContractError(error, {
      component: context,
      extra: { componentStack: info.componentStack ?? undefined },
    });
  }

  handleRetry = (): void => {
    // Reset error state — React will re-render children, re-attempting the call
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    const { hasError, error } = this.state;

    if (!hasError || !error) return this.props.children;

    const { title, message, retryable = true } = mapContractError(error);

    return (
      <div
        role="alert"
        data-testid="contract-error-boundary"
        className="bg-gray-900 border border-red-800 rounded-2xl p-6 flex flex-col items-center gap-4 text-center"
      >
        {/* Icon */}
        <div className="w-12 h-12 rounded-full bg-red-900/40 border border-red-700 flex items-center justify-center">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="w-6 h-6 text-red-400"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>

        {/* Title */}
        <h3 className="text-white font-bold text-lg">{title}</h3>

        {/* Message */}
        <p className="text-gray-400 text-sm max-w-sm">{message}</p>

        {/* Raw error code — collapsed, for developers */}
        <details className="text-xs text-gray-600 w-full text-left">
          <summary className="cursor-pointer hover:text-gray-400 transition-colors">
            Technical details
          </summary>
          <pre className="mt-2 bg-gray-800 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all text-gray-500">
            {error.message}
          </pre>
        </details>

        {/* Retry */}
        {retryable && (
          <button
            onClick={this.handleRetry}
            data-testid="retry-button"
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-white text-sm font-semibold transition-colors"
          >
            Try Again
          </button>
        )}
      </div>
    );
  }
}

/**
 * Higher-order component convenience wrapper.
 * Wraps a component with ContractErrorBoundary automatically.
 *
 * Usage:
 *   export default withContractErrorBoundary(MyContractComponent, "MyContractComponent");
 */
export function withContractErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  context: string,
  store?: Store
): React.FC<P> {
  const Wrapped: React.FC<P> = (props) => (
    <ContractErrorBoundary context={context} store={store}>
      <Component {...props} />
    </ContractErrorBoundary>
  );
  Wrapped.displayName = `WithContractErrorBoundary(${context})`;
  return Wrapped;
}
