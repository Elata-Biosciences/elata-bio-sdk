import { fitExposureResponse } from "../exposureFit";

describe("fitExposureResponse", () => {
	test("is null with no previous sample", () => {
		expect(fitExposureResponse(null, { compensation: 1, luma: 0.3 })).toBeNull();
	});

	test("computes Δluma / Δcompensation for a real pair", () => {
		const prev = { compensation: 0, luma: 0.2 };
		const curr = { compensation: 1, luma: 0.5 };
		expect(fitExposureResponse(prev, curr)).toBeCloseTo(0.3, 5);
	});

	test("is null when the compensation barely changed (unsafe to divide by)", () => {
		const prev = { compensation: 0, luma: 0.2 };
		const curr = { compensation: 0.02, luma: 0.3 };
		expect(fitExposureResponse(prev, curr)).toBeNull();
	});

	test("is null on non-finite input", () => {
		const prev = { compensation: 0, luma: 0.2 };
		expect(fitExposureResponse(prev, { compensation: Number.NaN, luma: 0.3 })).toBeNull();
		expect(fitExposureResponse({ compensation: 0, luma: Number.NaN }, prev)).toBeNull();
	});
});
