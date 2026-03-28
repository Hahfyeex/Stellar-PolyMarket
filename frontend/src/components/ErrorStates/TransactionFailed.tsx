"use client";
import React from 'react';
import ErrorLayout from './ErrorLayout';
import { trackEvent } from '../../lib/firebase';

export default function TransactionFailed() {
  React.useEffect(() => {
    // Track when users see transaction failure screen
    trackEvent('slippage_changed', {
      failure_type: 'transaction_failed',
      failure_reason: 'slippage_or_network_congestion',
      user_action: 'viewed_error_screen',
    });
  }, []);

  return (
    <div className="bg-gray-950/50 backdrop-blur-sm rounded-3xl p-8 border border-red-500/20">
      <ErrorLayout
        illustration="/illustrations/rocket-maintenance.png"
        title="Transaction Failed"
        message="The Ledger rejected this transaction. This could be due to slippage, network congestion, or an expired deadline."
        primaryAction={{
          label: "Try Again",
          onClick: () => {
            trackEvent('slippage_changed', {
              failure_type: 'transaction_failed',
              user_action: 'try_again_clicked',
            });
            window.location.reload();
          }
        }}
        secondaryAction={{
          label: "Return to Dashboard",
          href: "/"
        }}
      />
    </div>
  );
}
