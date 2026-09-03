import { HRV_TRUST_QUALITY_MIN, trustedHrvSample } from "../hrvSampleTrust";

describe("trustedHrvSample", () => {
	test("withholds the HRV value below the trust floor, at the exact boundary", () => {
		expect(trustedHrvSample(55, HRV_TRUST_QUALITY_MIN - 0.01)).toBeNull();
		expect(trustedHrvSample(55, HRV_TRUST_QUALITY_MIN)).toBe(55);
	});

	test("is stricter than the BPM gathering floor (0.24) — that is the whole point", () => {
		// A sample that passes BPM gathering can still be withheld for HRV.
		expect(HRV_TRUST_QUALITY_MIN).toBeGreaterThan(0.24);
		expect(trustedHrvSample(70, 0.24)).toBeNull();
		expect(trustedHrvSample(70, 0.3)).toBeNull();
	});

	test("never invents a value: null in is null out, at any quality", () => {
		expect(trustedHrvSample(null, 1)).toBeNull();
		expect(trustedHrvSample(null, 0)).toBeNull();
	});

	test("passes the reading through unchanged once trusted — never rescales or clamps here", () => {
		// Range clamping already happens once, upstream. Doing it again here
		// would be a second source of truth for the same rule.
		expect(trustedHrvSample(123.456, 0.9)).toBe(123.456);
	});
});
