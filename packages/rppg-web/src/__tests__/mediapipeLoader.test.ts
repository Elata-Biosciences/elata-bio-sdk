import { loadFaceLandmarker } from "../mediapipeLoader";

describe("mediapipeLoader", () => {
	const originalDisable = (window as any).__ELATA_DISABLE_FACEMESH;

	afterEach(() => {
		(window as any).__ELATA_DISABLE_FACEMESH = originalDisable;
		jest.restoreAllMocks();
	});

	test("returns null when face tracking is disabled via the global flag", async () => {
		(window as any).__ELATA_DISABLE_FACEMESH = true;
		const result = await loadFaceLandmarker();
		expect(result).toBeNull();
	});

	// Note: the success path dynamically imports @mediapipe/tasks-vision from a
	// CDN (ESM) and creates a FaceLandmarker, which requires a real browser +
	// network and is covered by the e2e/consumer browser tests, not jsdom.
});
