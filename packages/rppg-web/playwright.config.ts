import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	timeout: 30_000,
	use: {
		headless: true,
		viewport: { width: 1280, height: 800 },
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
