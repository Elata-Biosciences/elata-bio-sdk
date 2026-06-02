import { AffectTracker } from "../affectTracker";
import type { FaceBlendshapeCategory } from "../affect";

const bs = (m: Record<string, number>): FaceBlendshapeCategory[] =>
	Object.entries(m).map(([categoryName, score]) => ({ categoryName, score }));

describe("AffectTracker", () => {
	test("builds a resting baseline from physiology samples", () => {
		const t = new AffectTracker({ baselineSamples: 5 });
		expect(t.getBaseline()).toBeNull();
		for (let i = 0; i < 5; i++) t.observePhysiology(60, 50);
		expect(t.getBaseline()).toEqual({ bpm: 60, rmssd: 50 });
		// Further samples don't move a frozen baseline.
		t.observePhysiology(120, 10);
		expect(t.getBaseline()).toEqual({ bpm: 60, rmssd: 50 });
	});

	test("valence comes from the face; arousal rises with HR over baseline", () => {
		const t = new AffectTracker({ baselineSamples: 1 });
		t.observePhysiology(60, 50); // baseline {60,50}
		t.observeFace(bs({ mouthSmileLeft: 0.8, mouthSmileRight: 0.8 }), 1000);
		const calm = t.compute({ bpm: 60, rmssd: 50, nowMs: 1000 });
		expect(calm.valence).toBeGreaterThan(0.4);
		expect(calm.arousal).toBeLessThan(0.3);

		const activated = t.compute({ bpm: 95, rmssd: 20, nowMs: 1000 });
		expect(activated.arousal).toBeGreaterThan(calm.arousal);
		expect(activated.arousalSource).toBe("fused");
	});

	test("ignores stale face affect when fusing", () => {
		const t = new AffectTracker({ baselineSamples: 1, faceStaleMs: 1000 });
		t.observePhysiology(60, 50);
		t.observeFace(bs({ mouthFrownLeft: 0.7, mouthFrownRight: 0.7 }), 0);
		// 2s later the face read is stale → valence falls back to 0.
		const a = t.compute({ bpm: 60, rmssd: 50, nowMs: 2000 });
		expect(a.valence).toBe(0);
	});

	test("reset clears baseline and face state", () => {
		const t = new AffectTracker({ baselineSamples: 1 });
		t.observePhysiology(60, 50);
		t.observeFace(bs({ mouthSmileLeft: 0.9 }), 1000);
		t.reset();
		expect(t.getBaseline()).toBeNull();
		const a = t.compute({ bpm: 60, rmssd: 50, nowMs: 1000 });
		expect(a.valence).toBe(0);
		expect(a.arousalSource).toBe("none"); // no baseline ⇒ no physiology arousal
	});
});
