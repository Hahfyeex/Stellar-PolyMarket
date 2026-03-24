/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
  projects: [
    {
      displayName: "node",
      preset: "ts-jest",
      testEnvironment: "node",
      testMatch: ["**/hooks/__tests__/**/*.test.ts"],
      collectCoverageFrom: ["src/hooks/useRecentActivity.ts"],
      coverageThreshold: {
        global: { lines: 95, functions: 95, branches: 90 },
      },
    },
    {
      displayName: "jsdom",
      preset: "ts-jest",
      testEnvironment: "jest-environment-jsdom",
      testMatch: ["**/components/__tests__/**/*.test.tsx"],
      setupFilesAfterFramework: [],
      globals: {
        "ts-jest": {
          tsconfig: {
            jsx: "react-jsx",
          },
        },
      },
    },
  ],
};
