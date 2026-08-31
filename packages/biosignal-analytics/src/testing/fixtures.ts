/**
 * Golden-fixture access for parity tests. Fixtures are repo-committed (not
 * shipped in the tarball), so callers supply the file reader (e.g. node:fs
 * `readFileSync`) and the fixtures directory — this module stays free of
 * node builtins and safe to bundle.
 */

export interface GoldenFixtureCase {
	name: string;
	input: Record<string, unknown>;
	expected: Record<string, unknown>;
}

export interface GoldenFixture {
	schema: string;
	algorithm: string;
	oracle?: Record<string, unknown>;
	tolerances: Record<string, number>;
	cases: GoldenFixtureCase[];
}

export interface GoldenFixtureManifest {
	schema: string;
	files: string[];
	tolerances: Record<string, Record<string, number>>;
	seeds: Record<string, number>;
	[key: string]: unknown;
}

/** Reader signature compatible with `(p) => fs.readFileSync(p, "utf8")`. */
export type FixtureReader = (path: string) => string;

function joinPath(dir: string, relative: string): string {
	return dir.endsWith("/") ? `${dir}${relative}` : `${dir}/${relative}`;
}

export function loadGoldenFixture(
	read: FixtureReader,
	fixturesDir: string,
	relative: string,
): GoldenFixture {
	return JSON.parse(read(joinPath(fixturesDir, relative))) as GoldenFixture;
}

export function loadGoldenManifest(
	read: FixtureReader,
	fixturesDir: string,
): GoldenFixtureManifest {
	return JSON.parse(
		read(joinPath(fixturesDir, "manifest.json")),
	) as GoldenFixtureManifest;
}

/** `|actual - expected| <= atol + rtol*|expected|` helper for parity tests. */
export function expectClose(
	actual: number,
	expected: number,
	tolerance: { rtol?: number; atol?: number },
	context: string,
): void {
	const bound =
		(tolerance.atol ?? 0) + (tolerance.rtol ?? 0) * Math.abs(expected);
	if (!(Math.abs(actual - expected) <= bound)) {
		throw new Error(
			`${context}: actual ${actual} vs expected ${expected} (rtol ${tolerance.rtol ?? 0}, atol ${
				tolerance.atol ?? 0
			})`,
		);
	}
}
