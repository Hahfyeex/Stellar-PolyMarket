/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: "node",
      preset: "ts-jest",
      testEnvironment: "node",
      testMatch: [
        "**/hooks/__tests__/**/*.test.ts",
        "!**/hooks/__tests__/useMarketSearch.test.ts",
      ],
      globals: {
        "ts-jest": { tsconfig: { esModuleInterop: true } },
      },
      collectCoverageFrom: [
        "src/hooks/useRecentActivity.ts",
        "src/hooks/useFormPersistence.ts",
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
        "**/context/__tests__/**/*.test.tsx",
        "**/hooks/__tests__/useMarketSearch.test.ts",
      ],
      globals: {
        "ts-jest": {
          tsconfig: {
            jsx: "react-jsx",
            esModuleInterop: true,
          },
        },
      },
      collectCoverageFrom: ["src/hooks/useMarketSearch.ts"],
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
        "src/utils/trustline.ts",
        "src/utils/marketDiscovery.ts",
        "src/utils/slippageCalc.ts",
      ],
      coverageThreshold: {
        global: { lines: 90, functions: 90, branches: 90 },
      },
    },
  ],
};
