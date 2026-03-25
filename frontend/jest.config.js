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
        "src/utils/simulateBet.ts",
      ],
      coverageThreshold: {
        global: { lines: 90, functions: 90, branches: 90 },
      },
    },
  ],
};
