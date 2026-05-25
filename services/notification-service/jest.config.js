module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  moduleNameMapper: {
    "^@threaddash/shared-types$": "<rootDir>/../../packages/shared-types/src/index.ts",
  },
  globals: { "ts-jest": { diagnostics: false } },
};
