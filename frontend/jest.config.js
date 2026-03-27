/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: "node",
      preset: "ts-jest",
      testEnvironment: "node",
      testMatch: [
        "**/hooks/__tests__/**/*.test.ts",
        // These hooks require jsdom (renderHook) and run in the jsdom project instead
        "**/store/__tests__/**/*.test.ts",
        "!**/hooks/__tests__/useMarketSearch.test.ts",
        "!**/hooks/__tests__/useOddsStream.test.ts",
      ],
      globals: {
        "ts-jest": { tsconfig: { esModuleInterop: true } },
      },
      collectCoverageFrom: ["src/hooks/useRecentActivity.ts", "src/hooks/useFormPersistence.ts"],
      collectCoverageFrom: [
        "src/hooks/useRecentActivity.ts",
        "src/hooks/useFormPersistence.ts",
        "src/hooks/useOnboarding.ts",
        "src/store/notificationSlice.ts",
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
        // useOddsStream uses renderHook (React hooks + socket lifecycle) — needs jsdom
        "**/hooks/__tests__/useOddsStream.test.ts",
        "**/hooks/__tests__/useBatchTransaction.test.ts",
      ],
      // i18n mock is injected before every component test so that components
      // using useTranslation() work without a real i18next instance.
      setupFilesAfterEnv: ["<rootDir>/jest-i18n-setup.ts"],
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
        "src/hooks/useOddsStream.ts",
        ,
        "src/hooks/useBatchTransaction.ts",
        "src/components/VirtualizedOrderBook.tsx",
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
        // i18n locale detection and persistence utilities
        "src/utils/i18nUtils.ts",
      ],
      coverageThreshold: {
        global: { lines: 90, functions: 90, branches: 90 },
      },
    },
  ],
};
