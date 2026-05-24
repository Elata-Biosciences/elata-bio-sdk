module.exports = {
	transform: {
		"^.+\\.tsx?$": ["ts-jest", { diagnostics: false }],
	},
	testEnvironment: "jsdom",
	setupFiles: ["<rootDir>/jest.setup.cjs"],
	testMatch: ["**/__tests__/**/*.test.ts"],
	moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
	collectCoverage: true,
	collectCoverageFrom: ["src/**/*.ts"],
	coverageDirectory: "coverage",
};
