/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: "node",
      preset: "ts-jest",
      testEnvironment: "node",
      testMatch: [
        "**/hooks/__tests__/**/*.test.ts",
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
        // i18n locale detection and persistence utilities
        "src/utils/i18nUtils.ts",
      ],
      coverageThreshold: {
        global: { lines: 90, functions: 90, branches: 90 },
      },
    },
  ],
};
