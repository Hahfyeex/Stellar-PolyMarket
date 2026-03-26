"use client";
import React from 'react';
import { useTranslation } from 'react-i18next';
import ErrorLayout from './ErrorLayout';

export default function MarketPaused() {
  const { t } = useTranslation();

  return (
    <div className="bg-gray-950/50 backdrop-blur-sm rounded-3xl p-8 border border-yellow-500/20">
      <ErrorLayout
        illustration="/illustrations/rocket-maintenance.png"
        title={t("errors.marketPaused.title")}
        message={t("errors.marketPaused.message")}
        primaryAction={{
          label: t("errors.marketPaused.returnToDashboard"),
          href: "/"
        }}
        secondaryAction={{
          label: t("errors.marketPaused.checkNetworkStatus"),
          onClick: () => window.open('https://stellar.org/status', '_blank')
        }}
      />
    </div>
  );
}
