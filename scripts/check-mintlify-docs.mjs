#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const docsRoot = path.join(repoRoot, "external/docs-site");
const errors = [];

function exists(relPath) {
	return fs.existsSync(path.join(repoRoot, relPath));
}

function readText(relPath) {
	return fs.readFileSync(path.join(repoRoot, relPath), "utf8");
}

function walkDocs(dirAbs, visit) {
	for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true })) {
		const absPath = path.join(dirAbs, entry.name);
		if (entry.isDirectory()) {
			walkDocs(absPath, visit);
			continue;
		}
		visit(absPath);
	}
}

function toPosix(relPath) {
	return relPath.replaceAll(path.sep, "/");
}

function pageRouteFromRelPath(relPath) {
	const withoutExt = relPath.replace(/\.(md|mdx)$/u, "");
	return withoutExt === "index" ? "/" : `/${withoutExt}`;
}

function stripAnchorAndQuery(target) {
	return target.split("#", 1)[0].split("?", 1)[0];
}

function flattenNavigationPages(groups, pages = []) {
	for (const group of groups ?? []) {
		for (const page of group.pages ?? []) {
			if (typeof page === "string") {
				pages.push(page);
				continue;
			}

			if (page && typeof page === "object") {
				if (typeof page.page === "string") {
					pages.push(page.page);
				}
				if (Array.isArray(page.pages)) {
					flattenNavigationPages([{ pages: page.pages }], pages);
				}
			}
		}
	}

	return pages;
}

function resolveRelativeDocTarget(sourceRelPath, target) {
	const sourceDir = path.posix.dirname(sourceRelPath);
	const resolved = path.posix.normalize(path.posix.join(sourceDir, target));
	if (resolved.startsWith("../")) {
		return null;
	}
	return resolved;
}

function assert(condition, message) {
	if (!condition) {
		errors.push(message);
	}
}

assert(exists("external/docs-site/docs.json"), "external/docs-site/docs.json must exist");

if (errors.length === 0) {
	const docsConfig = JSON.parse(readText("external/docs-site/docs.json"));
	const pageFiles = [];

	walkDocs(docsRoot, (absPath) => {
		const relPath = toPosix(path.relative(docsRoot, absPath));
		if (relPath === "README.md") return;
		if (relPath.endsWith(".md")) {
			errors.push(
				`${relPath} must use .mdx in external/docs-site (README.md is the only allowed .md file)`,
			);
			return;
		}
		if (!relPath.endsWith(".mdx")) return;
		pageFiles.push(relPath);
	});

	const routeToFile = new Map(
		pageFiles.map((relPath) => [pageRouteFromRelPath(relPath), relPath]),
	);
	const navigatedPages = flattenNavigationPages(docsConfig.navigation?.groups ?? []);
	const seenNavigationPages = new Set();
	const legacyTemplateNames = new Map([
		["rppg-web-demo", "rppg-demo"],
		["eeg-web-demo", "eeg-demo"],
		["eeg-web-ble-demo", "eeg-demo or the eeg-ble alias"],
	]);

	for (const relPath of pageFiles) {
		const text = fs.readFileSync(path.join(docsRoot, relPath), "utf8");
		assert(
			text.startsWith("---\n"),
			`${relPath} must start with YAML frontmatter`,
		);
		assert(/^title:\s+.+$/mu.test(text), `${relPath} must declare title in frontmatter`);
		assert(
			/^description:\s+.+$/mu.test(text),
			`${relPath} must declare description in frontmatter`,
		);

		for (const match of text.matchAll(/\]\(([^)\s]+)\)/gu)) {
			const target = match[1].trim();
			if (
				target.startsWith("http://") ||
				target.startsWith("https://") ||
				target.startsWith("mailto:") ||
				target.startsWith("#")
			) {
				continue;
			}

			if (target.startsWith("/")) {
				const route = stripAnchorAndQuery(target);
				assert(
					routeToFile.has(route),
					`${relPath} links to missing docs route: ${target}`,
				);
				continue;
			}

			const relativeTarget = stripAnchorAndQuery(target);
			const resolvedRelativePath = resolveRelativeDocTarget(relPath, relativeTarget);
			if (resolvedRelativePath) {
				assert(
					pageFiles.includes(resolvedRelativePath),
					`${relPath} links to missing relative docs page: ${target}`,
				);
			}
		}

		for (const [legacyName, replacement] of legacyTemplateNames) {
			assert(
				!text.includes(legacyName),
				`${relPath} still uses legacy template name "${legacyName}" (prefer ${replacement})`,
			);
		}
	}

	for (const page of navigatedPages) {
		assert(!seenNavigationPages.has(page), `docs.json navigation duplicates page: ${page}`);
		seenNavigationPages.add(page);

		const route = page === "index" ? "/" : `/${page}`;
		assert(
			routeToFile.has(route),
			`docs.json navigation references missing page: ${page}`,
		);
	}

	for (const relPath of pageFiles) {
		const route = pageRouteFromRelPath(relPath);
		const pageId = route === "/" ? "index" : route.slice(1);
		assert(
			seenNavigationPages.has(pageId),
			`${relPath} exists in external/docs-site but is not referenced in docs.json navigation`,
		);
	}

	for (const assetPath of [
		docsConfig.logo?.light,
		docsConfig.logo?.dark,
		docsConfig.favicon,
	]) {
		if (!assetPath || !assetPath.startsWith("/")) continue;
		assert(
			exists(path.posix.join("external/docs-site", assetPath.slice(1))),
			`docs.json references missing asset: ${assetPath}`,
		);
	}
}

if (errors.length > 0) {
	console.error("External docs validation failed:");
	for (const error of errors) {
		console.error(`- ${error}`);
	}
	process.exit(1);
}

console.log("External docs validation passed.");
