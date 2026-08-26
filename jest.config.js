const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  forceExit: true,
  transform: {
    ...tsJestTransformCfg,
    "^.+\\.mjs$": ["ts-jest", {}],
  },
  transformIgnorePatterns: [
    "node_modules/(?!(@angular|rxjs|tslib)/)",
  ],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "mjs", "json"],
  testMatch: [
    "<rootDir>/src/tests/**/*.test.ts",
    "<rootDir>/src/tests/**/*.spec.ts",
  ],
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
  coveragePathIgnorePatterns: ["/node_modules/", "/dist/"],
  coverageReporters: ["json", "lcov", "text", "clover"],
  coverageDirectory: "coverage",
  collectCoverageFrom: ["src/**/*.ts"],
};
