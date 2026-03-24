"use client";
import React from 'react';
import ErrorLayout from './ErrorLayout';

export default function TransactionFailed() {
  return (
    <div className="bg-gray-950/50 backdrop-blur-sm rounded-3xl p-8 border border-red-500/20">
      <ErrorLayout
        illustration="/illustrations/rocket-maintenance.png"
        title="Transaction Failed"
        message="The Ledger rejected this transaction. This could be due to slippage, network congestion, or an expired deadline."
        primaryAction={{
          label: "Try Again",
          onClick: () => window.location.reload()
        }}
        secondaryAction={{
          label: "Return to Dashboard",
          href: "/"
        }}
      />
    </div>
  );
}
