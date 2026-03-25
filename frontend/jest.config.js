/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: "node",
      preset: "ts-jest",
      testEnvironment: "node",
      testMatch: [
        "**/hooks/__tests__/**/*.test.ts",
        "**/store/__tests__/**/*.test.ts",
        // i18n configuration tests run in node (no DOM needed)
        "**/lib/__tests__/i18n.test.ts",
        "!**/hooks/__tests__/useMarketSearch.test.ts",
        "!**/hooks/__tests__/useBatchTransaction.test.ts",
        "!**/hooks/__tests__/useMarkets.test.ts",
        "!**/hooks/__tests__/useOnlineStatus.test.ts",
        "!**/hooks/__tests__/useKeyboardShortcuts.test.ts",
        "!**/hooks/__tests__/useOddsStream.test.ts",
      ],
      globals: {
        "ts-jest": { tsconfig: { esModuleInterop: true } },
      },
      collectCoverageFrom: [
        "src/hooks/useRecentActivity.ts",
        "src/hooks/useFormPersistence.ts",
        "src/hooks/useOnboarding.ts",
        "src/hooks/useTheme.ts",
        "src/store/notificationSlice.ts",
        // i18n configuration module — locale detection and loading logic
        "src/lib/i18n.ts",
      ],
      coverageThreshold: {
        global: { lines: 90, functions: 90, branches: 90 },
      },
    },
    {
      displayName: "jsdom",
      preset: "ts-jest",
      testEnvironment: "jest-environment-jsdom",
      testMatch: [
        "**/components/__tests__/**/*.test.tsx",
        "**/app/**/__tests__/**/*.test.tsx",
        "**/context/__tests__/**/*.test.tsx",
        "**/hooks/__tests__/useMarketSearch.test.ts",
        "**/hooks/__tests__/useIPFSMetadata.test.ts",
        "**/hooks/__tests__/useBatchTransaction.test.ts",
        "**/hooks/__tests__/useMarkets.test.ts",
        "**/hooks/__tests__/useOnlineStatus.test.ts",
        "**/hooks/__tests__/useKeyboardShortcuts.test.ts",
        // Live WebSocket odds streaming — requires jsdom for WebSocket mock globals
        "**/hooks/__tests__/useOddsStream.test.ts",
      ],
      globals: {
        "ts-jest": {
          tsconfig: {
            jsx: "react-jsx",
            esModuleInterop: true,
          },
        },
      },
      collectCoverageFrom: [
        "src/hooks/useMarketSearch.ts",
        "src/hooks/useIPFSMetadata.ts",
        "src/components/MetadataUnavailable.tsx",
        ,
        "src/hooks/useBatchTransaction.ts",
        "src/hooks/useMarkets.ts",
        "src/hooks/useMarket.ts",
        "src/hooks/usePlaceBet.ts",
        "src/hooks/useOnlineStatus.ts",
        "src/hooks/useKeyboardShortcuts.ts",
        "src/components/VirtualizedOrderBook.tsx",
        "src/components/LiveActivityFeed.tsx",
        "src/components/OfflineBanner.tsx",
        "src/components/ShareCard.tsx",
        "src/components/ShareModal.tsx",
        "src/components/onboarding/OnboardingWizard.tsx",
        "src/components/onboarding/StepWallet.tsx",
        "src/components/onboarding/StepMarkets.tsx",
        "src/components/onboarding/StepBetting.tsx",
        "src/components/onboarding/StepPayouts.tsx",
        // Live odds WebSocket hook
        "src/hooks/useOddsStream.ts",
      ],
      coverageThreshold: {
        global: { lines: 90, functions: 90, branches: 90 },
      },
    },
    {
      displayName: "simulator-calc",
      preset: "ts-jest",
      testEnvironment: "node",
      testMatch: ["**/utils/__tests__/**/*.test.ts"],
      globals: {
        "ts-jest": { tsconfig: { esModuleInterop: true } },
      },
      collectCoverageFrom: [
        "src/utils/simulatorCalc.ts",
        "src/utils/poolOwnership.ts",
        "src/utils/simulateBet.ts",
        "src/utils/slippageCalc.ts",
      ],
      coverageThreshold: {
        global: { lines: 90, functions: 90, branches: 90 },
      },
    },
    {
      displayName: "simulator-calc",
      preset: "ts-jest",
      testEnvironment: "node",
      testMatch: ["**/utils/__tests__/**/*.test.ts"],
      globals: {
        "ts-jest": { tsconfig: { esModuleInterop: true } },
      },
      collectCoverageFrom: [
        "src/utils/simulatorCalc.ts",
        "src/utils/poolOwnership.ts",
      ],
      coverageThreshold: {
        global: { lines: 90, functions: 90, branches: 90 },
      },
    },
  ],
};
