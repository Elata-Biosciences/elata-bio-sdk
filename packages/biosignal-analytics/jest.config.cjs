module.exports = {
	transform: {
		"^.+\\.tsx?$": ["ts-jest", { diagnostics: false }],
	},
	testEnvironment: "jsdom",
	setupFiles: ["<rootDir>/jest.setup.cjs"],
	testMatch: ["**/__tests__/**/*.test.ts"],
	moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
	moduleNameMapper: {
		// Most specific first: the wasm glue is mocked in jsdom runs.
		"^\\.\\./wasm/biosignal_features_wasm(\\.js)?$":
			"<rootDir>/src/__mocks__/biosignal_features_wasm.cjs",
		// Sources use NodeNext-style ".js" specifiers, which resolve to ".ts"
		// under the Bundler resolution tsc uses; jest needs it spelled out.
		"^(\\.{1,2}/.*)\\.js$": "$1",
	},
	collectCoverage: true,
	collectCoverageFrom: ["src/**/*.ts"],
	coverageDirectory: "coverage",
};
