module.exports = {
	transform: {
		"^.+\\.tsx?$": ["ts-jest", { diagnostics: false, useESM: false }],
	},
	testEnvironment: "jsdom",
	testMatch: ["**/__tests__/**/*.test.ts"],
	setupFiles: ["<rootDir>/src/__tests__/setup.ts"],
	moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
	collectCoverage: true,
	collectCoverageFrom: ["src/**/*.ts", "!src/**/__tests__/**", "!src/index.ts"],
	coverageDirectory: "coverage",
};
