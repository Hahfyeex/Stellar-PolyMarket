"use client";

import { DisputeStatus } from "./DisputeModal";

interface Props {
  status: DisputeStatus;
  submittedAt: string;
}

const STEPS: { key: DisputeStatus; label: string }[] = [
  { key: "submitted", label: "Submitted" },
  { key: "under_review", label: "Under Review" },
  { key: "resolved", label: "Resolved" },
];

const ORDER: Record<DisputeStatus, number> = {
  submitted: 0,
  under_review: 1,
  resolved: 2,
};

export default function DisputeStatusTracker({ status, submittedAt }: Props) {
  const currentStep = ORDER[status];

  return (
    <div
      data-testid="dispute-status-tracker"
      className="bg-gray-900 border border-orange-800/50 rounded-xl p-5 space-y-4"
    >
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
        <h3 className="text-white font-semibold text-sm">Dispute Submitted</h3>
        <span className="ml-auto text-gray-500 text-xs">
          {new Date(submittedAt).toLocaleDateString([], {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      {/* Step tracker */}
      <div className="flex items-center gap-0">
        {STEPS.map((step, i) => {
          const done = ORDER[step.key] <= currentStep;
          const active = ORDER[step.key] === currentStep;
          const isLast = i === STEPS.length - 1;

          return (
            <div key={step.key} className="flex items-center flex-1 last:flex-none">
              {/* Node */}
              <div className="flex flex-col items-center gap-1">
                <div
                  data-testid={`step-${step.key}`}
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    done
                      ? active
                        ? "bg-orange-500 text-white ring-2 ring-orange-400/40"
                        : "bg-orange-700 text-orange-200"
                      : "bg-gray-700 text-gray-500"
                  }`}
                >
                  {ORDER[step.key] < currentStep ? (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      className="w-3 h-3"
                    >
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                <span
                  className={`text-xs whitespace-nowrap ${
                    active
                      ? "text-orange-300 font-medium"
                      : done
                        ? "text-gray-400"
                        : "text-gray-600"
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector */}
              {!isLast && (
                <div
                  className={`flex-1 h-0.5 mx-1 mb-4 transition-colors ${
                    ORDER[step.key] < currentStep ? "bg-orange-700" : "bg-gray-700"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
