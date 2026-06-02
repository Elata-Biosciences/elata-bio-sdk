import {
	computeFaceRoiRects,
	drawFaceOverlay,
	FACE_ROI_FRACTIONS,
	type LandmarkLike,
} from "../faceRoiOverlay";

// A landmark cloud spanning a face-shaped box in normalized coords.
function makeFaceLandmarks(): LandmarkLike[] {
	const pts: LandmarkLike[] = [];
	for (let x = 0.3; x <= 0.7; x += 0.05) {
		for (let y = 0.2; y <= 0.8; y += 0.05) {
			pts.push({ x, y });
		}
	}
	return pts;
}

describe("computeFaceRoiRects", () => {
	const width = 640;
	const height = 480;

	test("returns empty without landmarks or canvas area", () => {
		expect(computeFaceRoiRects([], width, height)).toEqual({});
		expect(computeFaceRoiRects(makeFaceLandmarks(), 0, height)).toEqual({});
	});

	test("places ROIs sensibly and within the canvas", () => {
		const rects = computeFaceRoiRects(makeFaceLandmarks(), width, height);
		const { forehead, leftCheek, rightCheek } = rects;
		expect(forehead).toBeDefined();
		expect(leftCheek).toBeDefined();
		expect(rightCheek).toBeDefined();
		if (!forehead || !leftCheek || !rightCheek) return;

		// Forehead sits above the cheeks.
		expect(forehead.y).toBeLessThan(leftCheek.y);
		// Left cheek is left of the right cheek.
		expect(leftCheek.x).toBeLessThan(rightCheek.x);

		// Every rect has positive size and stays inside the canvas.
		for (const name of Object.keys(FACE_ROI_FRACTIONS)) {
			const rect = rects[name as keyof typeof rects];
			if (!rect) continue;
			expect(rect.w).toBeGreaterThan(0);
			expect(rect.h).toBeGreaterThan(0);
			expect(rect.x).toBeGreaterThanOrEqual(0);
			expect(rect.y).toBeGreaterThanOrEqual(0);
			expect(rect.x + rect.w).toBeLessThanOrEqual(width);
			expect(rect.y + rect.h).toBeLessThanOrEqual(height);
		}
	});
});

// Minimal recording stand-in for CanvasRenderingContext2D (jsdom has no 2D ctx).
function makeMockCtx() {
	const calls: Record<string, number> = {};
	const bump = (k: string) => {
		calls[k] = (calls[k] ?? 0) + 1;
	};
	const ctx = {
		calls,
		save: () => bump("save"),
		restore: () => bump("restore"),
		beginPath: () => bump("beginPath"),
		moveTo: () => bump("moveTo"),
		lineTo: () => bump("lineTo"),
		stroke: () => bump("stroke"),
		fillRect: () => bump("fillRect"),
		strokeRect: () => bump("strokeRect"),
		fillText: () => bump("fillText"),
		translate: () => bump("translate"),
		scale: () => bump("scale"),
		setLineDash: () => bump("setLineDash"),
		strokeStyle: "",
		fillStyle: "",
		lineWidth: 0,
		font: "",
		textAlign: "",
	};
	return ctx;
}

describe("drawFaceOverlay", () => {
	test("draws a box + label per default ROI and the tessellation when given", () => {
		const ctx = makeMockCtx();
		const tessellation = [
			{ start: 0, end: 1 },
			{ start: 1, end: 2 },
		];
		drawFaceOverlay(
			ctx as unknown as CanvasRenderingContext2D,
			makeFaceLandmarks(),
			640,
			480,
			{ tessellation, weights: { forehead: 0.8, leftCheek: 0.1, rightCheek: 0.1 } },
		);
		// 3 default ROIs -> 3 filled + 3 stroked boxes + 3 labels.
		expect(ctx.calls.fillRect).toBe(3);
		expect(ctx.calls.strokeRect).toBe(3);
		expect(ctx.calls.fillText).toBe(3);
		// Tessellation edges drawn.
		expect(ctx.calls.lineTo).toBe(2);
		expect(ctx.calls.stroke).toBeGreaterThanOrEqual(1);
	});

	test("no-ops without landmarks", () => {
		const ctx = makeMockCtx();
		drawFaceOverlay(ctx as unknown as CanvasRenderingContext2D, [], 640, 480);
		expect(Object.keys(ctx.calls)).toHaveLength(0);
	});
});
