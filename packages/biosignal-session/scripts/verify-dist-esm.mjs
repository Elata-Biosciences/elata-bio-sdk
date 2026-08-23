const entrypoints = ["index.js", "arrow.js", "host.js", "adapters.js"];
for (const name of entrypoints) {
	await import(new URL(`../dist/${name}`, import.meta.url));
}
