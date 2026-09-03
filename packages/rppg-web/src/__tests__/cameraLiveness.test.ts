import {
	FROZEN_MS,
	STARTUP_GRACE_MS,
	initialLiveness,
	observeFrame,
	pastStartupGrace,
	sameSignature,
	signatureOf,
} from "../cameraLiveness";

/**
 * A dark room and a dead camera are different things, and the whole point of
 * this module is that it can tell them apart WITHOUT a camera or a dark room.
 *
 * Two anchors hold each other up here, and both are needed:
 *
 *  - "a still image is caught" alone passes if the rule degrades to `frozen:
 *    true` always, which would put "no picture from your camera" over the
 *    owner's working face. That is the exact bug this replaces.
 *  - "a live camera is never accused" alone passes if the rule degrades to
 *    `frozen: false` always, which is the silence he has been fighting for a
 *    week.
 */

/** A frame of flat mid-grey: what a placeholder card's background looks like. */
function flat(value = 40, pixels = 256): number[] {
	return Array.from({ length: pixels * 3 }, () => value);
}

/** The same picture, with sensor noise on exactly one sample. */
function noisier(sig: number[], at = 7, by = 1): number[] {
	const out = sig.slice();
	out[at] += by;
	return out;
}

describe("signatureOf", () => {
	test("keeps colour and drops alpha, which is 255 on every camera frame", () => {
		expect(signatureOf([1, 2, 3, 255, 4, 5, 6, 255])).toEqual([1, 2, 3, 4, 5, 6]);
	});

	test("ignores a trailing partial pixel rather than reading undefined", () => {
		expect(signatureOf([1, 2, 3, 255, 9, 9])).toEqual([1, 2, 3]);
	});
});

describe("sameSignature", () => {
	test("is exact: one count of difference in one sample is a difference", () => {
		const a = flat();
		expect(sameSignature(a, a.slice())).toBe(true);
		expect(sameSignature(a, noisier(a))).toBe(false);
	});

	test("treats a different length as different rather than comparing the overlap", () => {
		expect(sameSignature([1, 2, 3], [1, 2, 3, 4])).toBe(false);
	});
});

describe("a substituted still image is caught", () => {
	test("reports frozen once the identical picture has run for FROZEN_MS, past startup grace", () => {
		// His machine hands the browser a "camera off" card: the same bitmap, over
		// and over. Nothing about it is dark enough to catch with a brightness
		// threshold, because the glyph on it is bright. It is caught by being STILL.
		// Armed at t=14000 (an arbitrary time well after page load), so the
		// startup grace measured from THIS session's first frame has already
		// cleared by the time the freeze is asserted below — a mid-session
		// freeze, not a driver warming up.
		// Since the very first frame of THIS session never changes, `changedAt`
		// stays pinned to `armedAt` too, so STARTUP_GRACE_MS (the larger of the
		// two windows) is what actually gates the verdict here.
		const card = flat();
		const armedAt = 24_000; // arbitrary time well after page load
		let state = initialLiveness(armedAt);
		state = observeFrame(state, card, armedAt);
		expect(state.frozen).toBe(false);

		state = observeFrame(state, card.slice(), armedAt + STARTUP_GRACE_MS - 1);
		expect(state.frozen).toBe(false);

		state = observeFrame(state, card.slice(), armedAt + STARTUP_GRACE_MS);
		expect(state.frozen).toBe(true);
	});

	test("never claims frozen off a single frame, however long the app has been open", () => {
		// Before two pictures have been compared there is no evidence either way,
		// and an accusation with no evidence is the failure mode being replaced.
		const state = observeFrame(initialLiveness(0), flat(), 60_000);
		expect(state.frozen).toBe(false);
	});
});

describe("a driver warming up is not accused", () => {
	test("reproduces the 2026-08-02 report: identical from the very first frame, in the dark, at start", () => {
		/**
		 * THE REGRESSION THIS EXISTS FOR. "keeps showing camera off icon through
		 * calibration when it is dark initially." Some webcam drivers hand back a
		 * duplicate of the first captured buffer for the first few frames while
		 * the sensor's real (longer, dark-room) exposure is still being read out.
		 * That duplicate is bit-identical, and FROZEN_MS alone caught it as a
		 * covered camera. It always cleared once real frames started arriving,
		 * which is the "initially" in his report.
		 */
		const startupDupe = flat(3); // a dark frame, repeated verbatim by the driver
		let state = initialLiveness(0);
		state = observeFrame(state, startupDupe, 0);
		for (let t = 200; t < STARTUP_GRACE_MS; t += 200) {
			state = observeFrame(state, startupDupe.slice(), t);
			expect(state.frozen).toBe(false);
		}
	});

	test("still catches a camera covered from the very first frame, just not instantly", () => {
		// The anti-vacuity partner: the startup grace must not become a licence to
		// never accuse a camera that is covered from t=0. Since the very first
		// frame never changes, `changedAt` stays at 0 too, so STARTUP_GRACE_MS
		// (4000ms) is the binding constraint here, not FROZEN_MS (2000ms) — by the
		// time the grace window clears, the identical streak has already run
		// longer than FROZEN_MS regardless.
		const covered = flat(0);
		let state = initialLiveness(0);
		state = observeFrame(state, covered, 0);
		state = observeFrame(state, covered.slice(), STARTUP_GRACE_MS - 1);
		expect(state.frozen).toBe(false);
		state = observeFrame(state, covered.slice(), STARTUP_GRACE_MS);
		expect(state.frozen).toBe(true);
	});
});

describe("pastStartupGrace", () => {
	test("is false before STARTUP_GRACE_MS has elapsed, true at and past it", () => {
		// Shared by observeFrame's own frozen check and by the zero-frames-ever
		// case a consumer (e.g. peak-app's CameraPreview.tsx) has no signature
		// to compare and so cannot call observeFrame at all — one threshold,
		// two callers.
		expect(pastStartupGrace(1000, 1000 + STARTUP_GRACE_MS - 1)).toBe(false);
		expect(pastStartupGrace(1000, 1000 + STARTUP_GRACE_MS)).toBe(true);
		expect(pastStartupGrace(1000, 1000 + STARTUP_GRACE_MS + 5000)).toBe(true);
	});

	test("measures from the given start, not from zero", () => {
		expect(pastStartupGrace(50_000, 50_000 + STARTUP_GRACE_MS)).toBe(true);
		expect(pastStartupGrace(50_000, 50_000 + STARTUP_GRACE_MS - 1)).toBe(false);
	});
});

describe("a live camera is never accused", () => {
	test("stays live on a pitch-dark frame that still carries sensor noise", () => {
		/**
		 * THE REGRESSION THIS EXISTS FOR. The owner's room is dark, so the previous
		 * rule ("is the frame dark?") hid his face for a whole working reading and
		 * left him asking whether the app was broken. Near-black is a legitimate
		 * picture. Only stillness is not.
		 */
		let sig = flat(2);
		let state = initialLiveness(0);
		for (let t = 0; t <= FROZEN_MS * 5; t += 200) {
			state = observeFrame(state, sig, t);
			expect(state.frozen).toBe(false);
			sig = noisier(sig, (t / 200) % sig.length, t % 2 ? 1 : -1);
		}
	});

	test("stays live on a camera that has dropped to 2fps in the dark", () => {
		/**
		 * Low light collapses a webcam's frame rate, so the same picture is sampled
		 * many times in a row while the camera is working perfectly. A rule counting
		 * identical frames would accuse it; the clock does not, because a new
		 * picture still lands well inside the window.
		 */
		let sig = flat(3);
		let state = initialLiveness(0);
		for (let frame = 0; frame < 10; frame++) {
			const arrivesAt = frame * 500; // 2fps
			for (let t = arrivesAt; t < arrivesAt + 500; t += 100) {
				state = observeFrame(state, sig, t);
				expect(state.frozen).toBe(false);
			}
			sig = noisier(sig, frame, 1);
		}
	});

	test("clears a frozen verdict the moment the picture moves again", () => {
		// He flips the camera switch back on. The accusation must not latch: a
		// status that can only go one way is a status that stops meaning anything.
		const card = flat();
		let state = initialLiveness(0);
		state = observeFrame(state, card, 0);
		state = observeFrame(state, card.slice(), STARTUP_GRACE_MS + FROZEN_MS);
		expect(state.frozen).toBe(true);

		state = observeFrame(state, noisier(card), STARTUP_GRACE_MS + FROZEN_MS + 100);
		expect(state.frozen).toBe(false);
	});
});
