import {
	faceBoxFromLandmarks,
	faceFramingFromBox,
	padFaceBoxToHead,
	type FaceBox,
} from "../faceFraming";

const centered: FaceBox = { x: 0.3, y: 0.3, width: 0.4, height: 0.4 };

describe("faceFramingFromBox", () => {
	test("well-framed face is ok", () => {
		expect(faceFramingFromBox(centered).code).toBe("ok");
	});

	test("null box reads as no_face", () => {
		expect(faceFramingFromBox(null).code).toBe("no_face");
	});

	test("small face → move_closer", () => {
		expect(faceFramingFromBox({ ...centered, width: 0.15 }).code).toBe(
			"move_closer",
		);
	});

	test("large face → move_back", () => {
		expect(
			faceFramingFromBox({ x: 0.05, y: 0.05, width: 0.85, height: 0.85 }).code,
		).toBe("move_back");
	});

	test("distance is corrected before centering", () => {
		// Far off-center but also too small: distance wins.
		expect(
			faceFramingFromBox({ x: 0.0, y: 0.3, width: 0.15, height: 0.15 }).code,
		).toBe("move_closer");
	});

	test("off-center face → center_face", () => {
		expect(faceFramingFromBox({ ...centered, x: 0.0 }).code).toBe("center_face");
	});

	test("vertical position hints", () => {
		expect(
			faceFramingFromBox({ x: 0.3, y: 0.05, width: 0.4, height: 0.4 }).code,
		).toBe("face_too_high");
		expect(
			faceFramingFromBox({ x: 0.3, y: 0.55, width: 0.4, height: 0.4 }).code,
		).toBe("face_too_low");
	});

	test("non-ok codes carry a user-facing message", () => {
		const g = faceFramingFromBox({ ...centered, width: 0.15 });
		expect(g.message.length).toBeGreaterThan(0);
	});
});

describe("faceBoxFromLandmarks", () => {
	test("empty set is null", () => {
		expect(faceBoxFromLandmarks([])).toBeNull();
	});

	test("computes the bounding box", () => {
		const box = faceBoxFromLandmarks([
			{ x: 0.2, y: 0.3 },
			{ x: 0.6, y: 0.7 },
			{ x: 0.4, y: 0.5 },
		]);
		expect(box!.x).toBeCloseTo(0.2);
		expect(box!.y).toBeCloseTo(0.3);
		expect(box!.width).toBeCloseTo(0.4);
		expect(box!.height).toBeCloseTo(0.4);
	});
});

describe("padFaceBoxToHead", () => {
	test("grows the box outward (most above for the skull)", () => {
		const mesh: FaceBox = { x: 0.3, y: 0.3, width: 0.4, height: 0.4 };
		const head = padFaceBoxToHead(mesh);
		expect(head.y).toBeLessThan(mesh.y);
		expect(head.width).toBeGreaterThan(mesh.width);
		expect(head.height).toBeGreaterThan(mesh.height);
		// Top pad dominates the bottom pad.
		expect(mesh.y - head.y).toBeGreaterThan(head.y + head.height - (mesh.y + mesh.height));
	});
});
