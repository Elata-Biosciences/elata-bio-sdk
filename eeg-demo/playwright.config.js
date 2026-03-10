const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
	testDir: "./e2e",
	timeout: 30_000,
	expect: {
		timeout: 10_000,
	},
	use: {
		baseURL: "http://127.0.0.1:4173",
		trace: "on-first-retry",
	},
	webServer: {
		command: "node e2e/server.js",
		port: 4173,
		timeout: 15_000,
		reuseExistingServer: !process.env.CI,
	},
});
