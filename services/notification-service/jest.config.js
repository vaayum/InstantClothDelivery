module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
moduleNameMapper: {
    "^@threaddash/shared-types$": "<rootDir>/../../packages/shared-types/src/index.ts",
  },
  globals: { "ts-jest": { diagnostics: false } },
};
