"use client";
import React from 'react';
import { useTranslation } from 'react-i18next';
import ErrorLayout from './ErrorLayout';
import { trackEvent } from '../../lib/firebase';

export default function TransactionFailed() {
  const { t } = useTranslation();

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
        title={t("errors.transactionFailed.title")}
        message={t("errors.transactionFailed.message")}
        primaryAction={{
          label: t("errors.transactionFailed.tryAgain"),
          onClick: () => {
            trackEvent('slippage_changed', {
              failure_type: 'transaction_failed',
              user_action: 'try_again_clicked',
            });
            window.location.reload();
          }
        }}
        secondaryAction={{
          label: t("errors.transactionFailed.returnToDashboard"),
          href: "/"
        }}
      />
    </div>
  );
}
