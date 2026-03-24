"use client";
import React from 'react';
import ErrorLayout from './ErrorLayout';

export default function MarketPaused() {
  return (
    <div className="bg-gray-950/50 backdrop-blur-sm rounded-3xl p-8 border border-yellow-500/20">
      <ErrorLayout
        illustration="/illustrations/rocket-maintenance.png"
        title="Market Paused"
        message="This Market's circuit breaker has been triggered. Trading is temporarily suspended while our engineers recalibrate the sensors."
        primaryAction={{
          label: "Return to Dashboard",
          href: "/"
        }}
        secondaryAction={{
          label: "Check Network Status",
          onClick: () => window.open('https://stellar.org/status', '_blank')
        }}
      />
    </div>
  );
}
