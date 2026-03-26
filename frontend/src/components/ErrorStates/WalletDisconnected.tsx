"use client";
import React from 'react';
import { useTranslation } from 'react-i18next';
import ErrorLayout from './ErrorLayout';
import { useWallet } from '@/hooks/useWallet';

export default function WalletDisconnected() {
  const { connect } = useWallet();
  const { t } = useTranslation();

  return (
    <div className="bg-gray-950/50 backdrop-blur-sm rounded-3xl p-8 border border-blue-500/20">
      <ErrorLayout
        illustration="/illustrations/rocket-maintenance.png"
        title={t("errors.walletDisconnected.title")}
        message={t("errors.walletDisconnected.message")}
        primaryAction={{
          label: t("errors.walletDisconnected.reconnect"),
          onClick: connect
        }}
        secondaryAction={{
          label: t("errors.walletDisconnected.returnToDashboard"),
          href: "/"
        }}
      />
    </div>
  );
}
