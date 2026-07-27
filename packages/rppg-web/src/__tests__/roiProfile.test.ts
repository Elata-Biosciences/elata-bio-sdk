import { computeFaceRoiRects } from "../faceRoiOverlay";
import {
	ELATA_FACE_YCBCR_V1_PROFILE,
	MCD_PROXY_INPUT_V1_PROFILE,
	TRADELOCK_LIVE_FOREHEAD_V1_PROFILE,
} from "../roiProfile";

describe("ROI geometry profiles", () => {
	const landmarks = Array.from({ length: 21 }, (_, index) => ({
		x: 0.2 + index * 0.03,
		y: 0.1 + index * 0.04,
	}));

	test("keeps the compatibility wrapper identical to the SDK default profile", () => {
		expect(computeFaceRoiRects(landmarks, 640, 480)).toEqual(
			ELATA_FACE_YCBCR_V1_PROFILE.compute(landmarks, 640, 480),
		);
	});

	test("freezes the MCD proxy forehead independently of SDK production geometry", () => {
		const sdk = ELATA_FACE_YCBCR_V1_PROFILE.compute(landmarks, 640, 480);
		const model = MCD_PROXY_INPUT_V1_PROFILE.compute(landmarks, 640, 480);

		expect(sdk.forehead).toEqual({ x: 258, y: 95, w: 124, h: 62 });
		expect(model.forehead).toEqual({ x: 251, y: 63, w: 138, h: 87 });
		expect(model.leftCheek).toEqual(sdk.leftCheek);
		expect(model.rightCheek).toEqual(sdk.rightCheek);
	});

	test("replays TradeLock's landmark-anchored live forehead rectangle", () => {
		const faceMesh = Array.from({ length: 338 }, () => ({ x: 0.5, y: 0.5 }));
		faceMesh[108] = { x: 0.4, y: 0.25 };
		faceMesh[151] = { x: 0.5, y: 0.2 };
		faceMesh[337] = { x: 0.6, y: 0.27 };
		faceMesh[107] = { x: 0.42, y: 0.3 };
		faceMesh[9] = { x: 0.5, y: 0.32 };
		faceMesh[336] = { x: 0.58, y: 0.29 };

		expect(
			TRADELOCK_LIVE_FOREHEAD_V1_PROFILE.compute(faceMesh, 640, 480)
				.forehead,
		).toEqual({ x: 256, y: 96, w: 128, h: 57 });
	});

	test("returns no TradeLock ROI when the required landmark contract is absent", () => {
		expect(
			TRADELOCK_LIVE_FOREHEAD_V1_PROFILE.compute(landmarks, 640, 480),
		).toEqual({});
	});
});
