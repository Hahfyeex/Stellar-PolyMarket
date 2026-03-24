module.exports = {
  testEnvironment: "node",
  testMatch: ["**/*.test.rules.js"],
  setupFilesAfterEnv: ["./firestore.test.setup.js"],
  collectCoverageFrom: ["firestore.rules"],
  coverageThreshold: {
    global: {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95,
    },
  },
};
