import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = new URL("../dist", import.meta.url);

async function walk(dir) {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const target = new URL(entry.name, `${dir.href}/`);
		if (entry.isDirectory()) await walk(target);
		else if (entry.name.endsWith(".js")) {
			const source = await readFile(target, "utf8");
			const fixed = source.replace(
				/(from\s+|import\s*)["'](\.\.?\/[^"']+?)["']/g,
				(match, prefix, specifier) =>
					path.posix.extname(specifier) ? match : `${prefix}"${specifier}.js"`,
			);
			if (fixed !== source) await writeFile(target, fixed);
		}
	}
}

await walk(root);
