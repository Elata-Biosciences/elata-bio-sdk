const path = require("path");

module.exports = {
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: path.resolve(__dirname, "tsconfig.test.json") }]
  },
  testEnvironment: "jsdom",
  rootDir: "src",
  testMatch: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.js"],
  moduleNameMapper: {
    "^@elata-biosciences/eeg-web$": "<rootDir>/__tests__/mocks/eeg-web.ts"
  }
};
