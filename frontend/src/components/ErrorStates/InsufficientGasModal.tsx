"use client";
import React from 'react';
import { useTranslation } from 'react-i18next';
import ErrorLayout from './ErrorLayout';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function InsufficientGasModal({ isOpen, onClose }: Props) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-800 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl">
        <div className="p-8">
          <ErrorLayout
            illustration="/illustrations/rocket-empty-fuel.png"
            title={t("errors.insufficientGas.title")}
            message={t("errors.insufficientGas.message")}
            primaryAction={{
              label: t("errors.insufficientGas.depositXlm"),
              onClick: () => { /* Logic to open deposit / buy */ }
            }}
            secondaryAction={{
              label: t("errors.insufficientGas.close"),
              onClick: onClose
            }}
          />
        </div>
      </div>
    </div>
  );
}
