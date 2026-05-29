module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests/integration"],
  testTimeout: 15000, // floci can be slow on first request
  moduleNameMapper: {
    "^@threaddash/auth$": "<rootDir>/../../packages/auth/src/index.ts",
  },
  globals: {
    "ts-jest": {
      diagnostics: false,
    },
  },
};
