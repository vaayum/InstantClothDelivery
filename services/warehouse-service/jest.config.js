module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  moduleNameMapper: {
    "^@threaddash/auth$": "<rootDir>/../../packages/auth/src/index.ts",
  },
  globals: {
    "ts-jest": {
      diagnostics: false,
    },
  },
};
