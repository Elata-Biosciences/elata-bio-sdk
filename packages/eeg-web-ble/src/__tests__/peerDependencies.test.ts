// The unit tests mock @elata-biosciences/eeg-web, so nothing else checks that
// the published peer range accepts the eeg-web version this package is built
// against. A range that excludes it makes `npm install` fail with ERESOLVE or
// ETARGET for every consumer.

type Manifest = {
	version: string;
	peerDependencies?: Record<string, string>;
};

// This package has no @types/node; Jest provides require at runtime.
declare const require: (id: string) => unknown;

function readManifest(relPath: string): Manifest {
	return require(relPath) as Manifest;
}

function parseVersion(version: string): [number, number, number] {
	const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
	if (!match) throw new Error(`unsupported version "${version}"`);
	return [Number(match[1]), Number(match[2]), Number(match[3])];
}

// Caret semantics (npm semver): ^0.y.z allows >=0.y.z <0.(y+1).0; ^x.y.z with
// x >= 1 allows >=x.y.z <(x+1).0.0.
function satisfiesCaret(version: string, range: string): boolean {
	if (!range.startsWith("^")) throw new Error(`expected a caret range, got "${range}"`);
	const [min, ver] = [parseVersion(range.slice(1)), parseVersion(version)];
	if (ver[0] !== min[0]) return false;
	if (min[0] === 0 && ver[1] !== min[1]) return false;
	for (let i = 0; i < 3; i += 1) {
		if (ver[i] !== min[i]) return ver[i] > min[i];
	}
	return true;
}

describe("peer dependency on @elata-biosciences/eeg-web", () => {
	const ble = readManifest("../../package.json");
	const eegWeb = readManifest("../../../eeg-web/package.json");
	const range = ble.peerDependencies?.["@elata-biosciences/eeg-web"];

	it("accepts the eeg-web version in this workspace", () => {
		expect(range).toBeDefined();
		expect(satisfiesCaret(eegWeb.version, range as string)).toBe(true);
	});

	it("caret check follows npm semantics", () => {
		expect(satisfiesCaret("0.12.0", "^0.12.0")).toBe(true);
		expect(satisfiesCaret("0.12.3", "^0.12.0")).toBe(true);
		expect(satisfiesCaret("0.13.0", "^0.12.0")).toBe(false);
		expect(satisfiesCaret("0.12.0", "^0.2.1")).toBe(false);
		expect(satisfiesCaret("1.4.0", "^1.2.0")).toBe(true);
		expect(satisfiesCaret("2.0.0", "^1.2.0")).toBe(false);
		expect(satisfiesCaret("0.11.9", "^0.12.0")).toBe(false);
	});
});
