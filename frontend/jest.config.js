/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: "node",
      preset: "ts-jest",
      testEnvironment: "node",
      testMatch: ["**/hooks/__tests__/**/*.test.ts"],
      globals: {
        "ts-jest": { tsconfig: { esModuleInterop: true } },
      },
      collectCoverageFrom: ["src/hooks/useRecentActivity.ts"],
      coverageThreshold: {
        global: { lines: 95, functions: 95, branches: 90 },
      },
    },
    {
      displayName: "jsdom",
      preset: "ts-jest",
      testEnvironment: "jest-environment-jsdom",
      testMatch: [
        "**/components/__tests__/**/*.test.tsx",
        "**/app/**/__tests__/**/*.test.tsx"
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
  ],
};
