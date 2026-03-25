"use client";
import React from 'react';
import ErrorLayout from './ErrorLayout';
import { useWallet } from '@/hooks/useWallet';

export default function WalletDisconnected() {
  const { connect } = useWallet();

  return (
    <div className="bg-gray-950/50 backdrop-blur-sm rounded-3xl p-8 border border-blue-500/20">
      <ErrorLayout
        illustration="/illustrations/rocket-maintenance.png"
        title="Wallet Disconnected"
        message="Your connection to the Stellar network has been interrupted. Please reconnect your wallet to continue predicting."
        primaryAction={{
          label: "Reconnect Wallet",
          onClick: connect
        }}
        secondaryAction={{
          label: "Return to Dashboard",
          href: "/"
        }}
      />
    </div>
  );
}
