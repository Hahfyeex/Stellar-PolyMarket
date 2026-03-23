/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  collectCoverageFrom: ["src/hooks/useRecentActivity.ts"],
  coverageThreshold: {
    global: { lines: 95, functions: 95, branches: 90 },
  },
};
