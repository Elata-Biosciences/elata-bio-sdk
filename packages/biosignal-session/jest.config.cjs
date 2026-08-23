module.exports = {
	transform: {
		"^.+\\.tsx?$": [
			"ts-jest",
			{ diagnostics: false, tsconfig: "tsconfig.json" },
		],
	},
	testEnvironment: "jsdom",
	setupFiles: ["<rootDir>/jest.setup.cjs"],
	testMatch: ["**/__tests__/**/*.test.ts"],
	moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
};
