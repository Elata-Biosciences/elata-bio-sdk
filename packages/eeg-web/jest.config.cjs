module.exports = {
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { diagnostics: false }]
  },
  testEnvironment: 'jsdom',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^\\.\\./wasm/eeg_wasm(\\.js)?$': '<rootDir>/src/__mocks__/eeg_wasm.cjs'
  },
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: 'coverage'
};
