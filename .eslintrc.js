/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
  plugins: ["@typescript-eslint", "react", "react-hooks"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
  ],
  settings: {
    react: { version: "detect" },
  },
  rules: {
    // TypeScript
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],

    // React
    "react/react-in-jsx-scope": "off", // Not needed in Next.js
    "react/prop-types": "off",         // We use TypeScript for prop types

    // General
    "no-console": ["warn", { allow: ["error", "warn"] }],
    "eqeqeq": ["error", "always"],
    "no-var": "error",
    "prefer-const": "error",
  },
  overrides: [
    {
      // Relax rules for plain JS files (backend/oracle)
      files: ["**/*.js"],
      rules: {
        "@typescript-eslint/no-var-requires": "off",
        "@typescript-eslint/no-explicit-any": "off",
      },
    },
  ],
  ignorePatterns: ["node_modules/", ".next/", "dist/", "target/"],
};
