import {
	computeFaceMeshAlignment,
	FACE_MESH_LANDMARK_LEFT_TRAGUS,
	FACE_MESH_LANDMARK_NOSE_TIP,
	FACE_MESH_LANDMARK_RIGHT_TRAGUS,
} from "../faceMeshAlignment";

function lm(
	index: number,
	x: number,
	y: number,
): NonNullable<Parameters<typeof computeFaceMeshAlignment>[0]>[number] {
	return { x, y };
}

describe("computeFaceMeshAlignment", () => {
	test("returns null without tragion / nose landmarks", () => {
		expect(computeFaceMeshAlignment([], 640, 480)).toBeNull();
		expect(computeFaceMeshAlignment([lm(0, 0.5, 0.5)], 640, 480)).toBeNull();
	});

	test("detects face too small (move closer)", () => {
		const landmarks = [];
		landmarks[FACE_MESH_LANDMARK_LEFT_TRAGUS] = lm(
			FACE_MESH_LANDMARK_LEFT_TRAGUS,
			0.46,
			0.45,
		);
		landmarks[FACE_MESH_LANDMARK_RIGHT_TRAGUS] = lm(
			FACE_MESH_LANDMARK_RIGHT_TRAGUS,
			0.5,
			0.45,
		);
		landmarks[FACE_MESH_LANDMARK_NOSE_TIP] = lm(FACE_MESH_LANDMARK_NOSE_TIP, 0.48, 0.45);
		const r = computeFaceMeshAlignment(landmarks, 100, 100);
		expect(r?.aligned).toBe(false);
		expect(r?.guidance?.code).toBe("face_move_closer");
	});

	test("detects face too large (move back)", () => {
		const landmarks = [];
		landmarks[FACE_MESH_LANDMARK_LEFT_TRAGUS] = lm(
			FACE_MESH_LANDMARK_LEFT_TRAGUS,
			0.05,
			0.45,
		);
		landmarks[FACE_MESH_LANDMARK_RIGHT_TRAGUS] = lm(
			FACE_MESH_LANDMARK_RIGHT_TRAGUS,
			0.85,
			0.45,
		);
		landmarks[FACE_MESH_LANDMARK_NOSE_TIP] = lm(FACE_MESH_LANDMARK_NOSE_TIP, 0.45, 0.45);
		const r = computeFaceMeshAlignment(landmarks, 100, 100);
		expect(r?.aligned).toBe(false);
		expect(r?.guidance?.code).toBe("face_move_back");
	});

	test("detects nose too high (lower head)", () => {
		const landmarks = [];
		landmarks[FACE_MESH_LANDMARK_LEFT_TRAGUS] = lm(
			FACE_MESH_LANDMARK_LEFT_TRAGUS,
			0.35,
			0.45,
		);
		landmarks[FACE_MESH_LANDMARK_RIGHT_TRAGUS] = lm(
			FACE_MESH_LANDMARK_RIGHT_TRAGUS,
			0.55,
			0.45,
		);
		landmarks[FACE_MESH_LANDMARK_NOSE_TIP] = lm(FACE_MESH_LANDMARK_NOSE_TIP, 0.45, 0.15);
		const r = computeFaceMeshAlignment(landmarks, 100, 100);
		expect(r?.aligned).toBe(false);
		expect(r?.guidance?.code).toBe("face_lower_head");
	});

	test("detects nose too low (raise head)", () => {
		const landmarks = [];
		landmarks[FACE_MESH_LANDMARK_LEFT_TRAGUS] = lm(
			FACE_MESH_LANDMARK_LEFT_TRAGUS,
			0.35,
			0.45,
		);
		landmarks[FACE_MESH_LANDMARK_RIGHT_TRAGUS] = lm(
			FACE_MESH_LANDMARK_RIGHT_TRAGUS,
			0.55,
			0.45,
		);
		landmarks[FACE_MESH_LANDMARK_NOSE_TIP] = lm(FACE_MESH_LANDMARK_NOSE_TIP, 0.45, 0.72);
		const r = computeFaceMeshAlignment(landmarks, 100, 100);
		expect(r?.aligned).toBe(false);
		expect(r?.guidance?.code).toBe("face_raise_head");
	});

	test("reports aligned when geometry is in range", () => {
		const landmarks = [];
		landmarks[FACE_MESH_LANDMARK_LEFT_TRAGUS] = lm(
			FACE_MESH_LANDMARK_LEFT_TRAGUS,
			0.35,
			0.45,
		);
		landmarks[FACE_MESH_LANDMARK_RIGHT_TRAGUS] = lm(
			FACE_MESH_LANDMARK_RIGHT_TRAGUS,
			0.55,
			0.45,
		);
		landmarks[FACE_MESH_LANDMARK_NOSE_TIP] = lm(FACE_MESH_LANDMARK_NOSE_TIP, 0.45, 0.42);
		const r = computeFaceMeshAlignment(landmarks, 100, 100);
		expect(r?.aligned).toBe(true);
		expect(r?.guidance).toBeNull();
	});
});
