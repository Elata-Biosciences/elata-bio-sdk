import {
	affectStress,
	blendshapeValenceArousal,
	classifyAffectLabel,
	fuseAffect,
	physiologyArousal,
	type FaceBlendshapeCategory,
} from "../affect";

const bs = (m: Record<string, number>): FaceBlendshapeCategory[] =>
	Object.entries(m).map(([categoryName, score]) => ({ categoryName, score }));

describe("blendshapeValenceArousal", () => {
	test("a smile reads positive valence", () => {
		const va = blendshapeValenceArousal(bs({ mouthSmileLeft: 0.8, mouthSmileRight: 0.8 }));
		expect(va).not.toBeNull();
		expect((va as { valence: number }).valence).toBeGreaterThan(0.3);
	});

	test("a frown + brow-down reads negative valence", () => {
		const va = blendshapeValenceArousal(bs({ mouthFrownLeft: 0.7, mouthFrownRight: 0.7, browDownLeft: 0.6, browDownRight: 0.6 }));
		expect((va as { valence: number }).valence).toBeLessThan(-0.3);
	});

	test("wide eyes + open jaw raise arousal", () => {
		const va = blendshapeValenceArousal(bs({ eyeWideLeft: 0.9, eyeWideRight: 0.9, jawOpen: 0.8 }));
		expect((va as { arousal: number }).arousal).toBeGreaterThan(0.5);
	});

	test("returns null without categories", () => {
		expect(blendshapeValenceArousal([])).toBeNull();
	});
});

describe("physiologyArousal", () => {
	test("rises with HR elevation and HRV suppression", () => {
		const base = { bpm: 65, rmssd: 50 };
		expect(physiologyArousal(65, 50, base)).toBeCloseTo(0, 5); // at baseline
		const elevated = physiologyArousal(95, 25, base) ?? 0; // +30 bpm, half RMSSD
		expect(elevated).toBeGreaterThan(0.5);
	});

	test("null without a baseline", () => {
		expect(physiologyArousal(90, 30, null)).toBeNull();
	});
});

describe("fuseAffect", () => {
	test("arousal is physiology-dominant; valence comes from the face", () => {
		const a = fuseAffect(0.6, 0.2, 0.9, 1, 1); // face says low arousal, physio says high
		expect(a.valence).toBeCloseTo(0.6, 5);
		expect(a.arousalSource).toBe("fused");
		expect(a.arousal).toBeGreaterThan(0.6); // pulled up by physiology
	});

	test("falls back to face-only arousal when physiology is absent", () => {
		const a = fuseAffect(0.3, 0.7, null, 0, 1);
		expect(a.arousalSource).toBe("face");
	});

	test("reports none when neither source is available", () => {
		expect(fuseAffect(null, null, null, 0, 0).arousalSource).toBe("none");
	});
});

describe("classifyAffectLabel", () => {
	test("maps circumplex quadrants", () => {
		expect(classifyAffectLabel(0.6, 0.8)).toBe("Excited");
		expect(classifyAffectLabel(-0.6, 0.8)).toBe("Stressed");
		expect(classifyAffectLabel(0, 0.8)).toBe("Alert");
		expect(classifyAffectLabel(0.6, 0.1)).toBe("Relaxed");
		expect(classifyAffectLabel(-0.6, 0.1)).toBe("Fatigued");
		expect(classifyAffectLabel(0, 0.1)).toBe("Calm");
		expect(classifyAffectLabel(0, 0.45)).toBe("Neutral");
		expect(classifyAffectLabel(0.6, 0.45)).toBe("Engaged");
		expect(classifyAffectLabel(-0.6, 0.45)).toBe("Tense");
	});
});

describe("affectStress", () => {
	test("peaks in the activated + unpleasant quadrant", () => {
		const high = affectStress({ valence: -1, arousal: 1, arousalSource: "fused" });
		const low = affectStress({ valence: 1, arousal: 0.1, arousalSource: "fused" });
		expect(high).toBeGreaterThan(90);
		expect(low).toBeLessThan(15);
	});
});
