import { landmarkMotion } from "../motionIndex";

const still = (n: number) => Array.from({ length: n }, (_, i) => ({ x: i / n, y: 0.5, z: 0 }));

describe("landmarkMotion", () => {
	test("is 0 when nothing moved", () => {
		const frame = still(468);
		expect(landmarkMotion(frame, frame)).toBe(0);
	});

	test("is 0 when either frame is missing (no face, not maximum motion)", () => {
		const frame = still(468);
		expect(landmarkMotion(null, frame)).toBe(0);
		expect(landmarkMotion(frame, null)).toBe(0);
		expect(landmarkMotion(null, null)).toBe(0);
	});

	test("is 0 when landmark counts disagree (a dropped/re-acquired face, not motion)", () => {
		expect(landmarkMotion(still(468), still(1))).toBe(0);
	});

	test("rises with real displacement and saturates at 1", () => {
		const prev = still(10);
		const smallShift = prev.map((p) => ({ ...p, x: p.x + 0.002 }));
		const bigShift = prev.map((p) => ({ ...p, x: p.x + 0.5 }));
		const small = landmarkMotion(prev, smallShift);
		const big = landmarkMotion(prev, bigShift);
		expect(small).toBeGreaterThan(0);
		expect(small).toBeLessThan(1);
		expect(big).toBe(1);
		expect(big).toBeGreaterThan(small);
	});

	test("ignores z (noisier than x/y and not a signal of visible motion)", () => {
		const prev = still(10);
		const zOnly = prev.map((p) => ({ ...p, z: p.z + 5 }));
		expect(landmarkMotion(prev, zOnly)).toBe(0);
	});
});
