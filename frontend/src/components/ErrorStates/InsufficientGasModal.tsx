"use client";
import React from 'react';
import ErrorLayout from './ErrorLayout';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function InsufficientGasModal({ isOpen, onClose }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-800 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl">
        <div className="p-8">
          <ErrorLayout
            illustration="/illustrations/rocket-empty-fuel.png"
            title="Insufficient Gas"
            message="You don't have enough XLM to cover the transaction gas fees. The Stellar network requires a small amount of XLM for every operation."
            primaryAction={{
              label: "Deposit XLM",
              onClick: () => { /* Logic to open deposit / buy */ }
            }}
            secondaryAction={{
              label: "Close",
              onClick: onClose
            }}
          />
        </div>
      </div>
    </div>
  );
}
