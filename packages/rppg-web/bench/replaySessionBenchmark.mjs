// Compare the local SDK's rPPG Bayes pipeline against TradeLock's recorded
// outputs on real recorded debug sessions (TradeLock `ReplayDebugSession` JSON).
//
//   node ./bench/replaySessionBenchmark.mjs <file-or-dir> [more files/dirs...]
//   pnpm --dir packages/rppg-web run bench:replay -- ~/Downloads
//
// Imports from ./dist so it measures the *local* build of @elata-biosciences/
// rppg-web (run `pnpm --dir packages/rppg-web build` first), not the published
// npm package — i.e. it reflects in-development SDK changes.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkgVersion = require("../package.json").version;
const { summarizeReplaySession, aggregateComparisons, maeOf } = await import(
	"../dist/index.js"
);

const inputs = process.argv.slice(2);
if (inputs.length === 0) {
	console.error(
		"usage: node ./bench/replaySessionBenchmark.mjs <file-or-dir> [...]\n" +
			"       (e.g. ~/Downloads for tradelock-debug-session-*.json)",
	);
	process.exit(1);
}

/** Expand dirs into the debug-session JSON files they contain. */
function collectFiles(paths) {
	const files = [];
	for (const p of paths) {
		const abs = resolve(p);
		const st = statSync(abs);
		if (st.isDirectory()) {
			for (const name of readdirSync(abs)) {
				if (
					name.startsWith("tradelock-debug-session-") &&
					name.endsWith(".json")
				) {
					files.push(join(abs, name));
				}
			}
		} else {
			files.push(abs);
		}
	}
	return files.sort();
}

function fmt(value, digits = 2) {
	return value == null ? "    —" : value.toFixed(digits).padStart(5);
}

const files = collectFiles(inputs);
if (files.length === 0) {
	console.error("No tradelock-debug-session-*.json files found.");
	process.exit(1);
}

console.log(`rppg-web replay benchmark  (SDK ${pkgVersion}, local dist)`);
console.log(`corpus: ${files.length} session(s)\n`);

const header =
	"session                                 sync  clean |  cleanAgree  agreeAll |  refSDK refTL(b) refTL(f)";
console.log(header);
console.log("-".repeat(header.length));

const summaries = [];
for (const file of files) {
	let session;
	try {
		session = JSON.parse(readFileSync(file, "utf8"));
	} catch (err) {
		console.error(`  skip ${basename(file)}: ${err.message}`);
		continue;
	}
	if (!Array.isArray(session.syncSamples)) {
		console.error(`  skip ${basename(file)}: no syncSamples`);
		continue;
	}
	const s = summarizeReplaySession(session);
	summaries.push(s);
	const name = basename(file).replace(/\.json$/, "").slice(0, 38).padEnd(38);
	console.log(
		`${name} ${String(s.syncSampleCount).padStart(5)} ${String(s.cleanPointCount).padStart(5)} | ` +
			`${fmt(maeOf(s.cleanAgreementFinal))}      ${fmt(maeOf(s.agreementBayes))} | ` +
			`${fmt(maeOf(s.referenceReplayBayes))}  ${fmt(maeOf(s.referenceRecordedBayes))}   ${fmt(maeOf(s.referenceRecordedFinal))}`,
	);
}

const corpus = aggregateComparisons(summaries);
console.log("-".repeat(header.length));
console.log(
	`${"OVERALL".padEnd(38)} ${String(corpus.totalSyncSamples).padStart(5)} ${String(corpus.totalCleanPoints).padStart(5)} | ` +
		`${fmt(maeOf(corpus.cleanAgreementFinal))}      ${fmt(maeOf(corpus.agreementBayes))} | ` +
		`${fmt(maeOf(corpus.referenceReplayBayes))}  ${fmt(maeOf(corpus.referenceRecordedBayes))}   ${fmt(maeOf(corpus.referenceRecordedFinal))}`,
);
console.log(
	`\n${corpus.sessionsWithReference}/${corpus.sessionCount} session(s) had reference pairings (reference columns are bpm MAE vs Muse).`,
);
console.log(
	`clean = samples TradeLock trusted (not suppressed) and did not manually lock — ${corpus.totalCleanPoints}/${corpus.totalSyncSamples} total.`,
);
console.log(
	"cleanAgree = mean |SDK replay − TradeLock final| bpm over those (the fair head-to-head).",
);
console.log(
	"agreeAll = same but over ALL samples (incl. suppressed/locked — contaminated, kept for reference).",
);
console.log(
	"refSDK / refTL(b) / refTL(f) = MAE vs reference for SDK replay / TradeLock recorded Bayes / recorded final.",
);
