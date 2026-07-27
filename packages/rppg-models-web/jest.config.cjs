const path = require("node:path");

module.exports = {
	transform: {
		"^.+\\.tsx?$": [
			"ts-jest",
			{ tsconfig: path.resolve(__dirname, "tsconfig.test.json") },
		],
	},
	testEnvironment: "node",
	rootDir: "src",
	testMatch: ["**/__tests__/**/*.test.ts"],
	moduleNameMapper: {
		"^@elata-biosciences/rppg-web$": "<rootDir>/../../rppg-web/src/index.ts",
	},
};
