/**
 * Is the camera actually sending a picture?
 *
 * ## The question I kept asking wrong
 *
 * The owner reported a "camera off" mark in the preview five times. I shipped a
 * status word, a status glyph, a video `poster`, an opaque cover, and finally
 * moved the whole preview to a `<canvas>` so there was no media element left to
 * decorate. It survived all five, which ruled out every explanation involving
 * our page: the mark arrives INSIDE the pixels. His machine substitutes a
 * "camera is off" card for the camera's output, and we faithfully draw it.
 *
 * Then I asked the wrong question a sixth time. I checked whether the frame was
 * DARK, and hid it below a threshold. That is wrong twice over: his room is
 * genuinely dark, so it hid his working face; and the substituted card is not
 * black, it has a bright glyph on it, so it sailed over the threshold anyway.
 *
 * Darkness is a property of the room. It is legitimate, and a dark picture is
 * still a picture. The real question is whether a sensor is on the other end.
 *
 * ## The rule
 *
 * **A real sensor is never still.** Every camera ever built produces noise: heat
 * in the photosites, read noise in the amplifier, dither in the encoder. Point a
 * webcam at a blank wall in a pitch-dark room and consecutive frames still
 * differ, by a count or two, somewhere. That is physics, not a feature, so it
 * holds on every camera on every machine without us knowing anything about the
 * hardware.
 *
 * A substituted placeholder is one still image. It is bit-identical every single
 * frame, because it is literally the same bitmap being handed out again.
 *
 * So: "has any part of this picture changed in the last two seconds?" No
 * threshold to tune, no brightness to guess at, nothing about his room.
 *
 * ## Why elapsed time rather than a count of frames
 *
 * Webcams collapse their frame rate in low light: 30fps in daylight, 5fps or
 * less in a dark room, while an animation frame keeps firing at 60Hz. Counting
 * identical frames would therefore accuse a slow-but-working camera of being
 * dead precisely in the conditions he uses it in. Two seconds without one
 * changed sample is not a slow camera; it is no camera.
 */

/**
 * Edge of the sample grid. 16x16 = 256 pixels spread across the frame.
 *
 * Sampled with image smoothing OFF, which matters more than the size: a smoothed
 * downsample AVERAGES about a thousand source pixels per output pixel, which
 * divides sensor noise by ~35 and quantises it away to a constant. That would
 * make a live camera look frozen, which is the exact false accusation this
 * module exists to avoid. Nearest-neighbour picks individual real pixels and
 * keeps their noise.
 */
export const SIGNATURE_EDGE = 16;

/**
 * No change for this long and the picture is not coming from a sensor.
 *
 * Long enough to clear the slowest plausible frame rate several times over,
 * short enough that he is told before he has spent a whole reading staring at a
 * ring that cannot succeed.
 */
export const FROZEN_MS = 2000;

/**
 * No verdict of `frozen` before this much time has passed since the FIRST
 * sample, however still the picture looks.
 *
 * Reported 2026-08-02: "keeps showing camera off icon through calibration when
 * it is dark initially." Some webcam drivers hand back a duplicate of the very
 * first captured buffer for the first few frames while the sensor's real
 * exposure is still being read out, especially at the long shutter times a
 * dark room forces. That duplicate is bit-identical, which is exactly the
 * signal this module was built to catch, and 2s is not long enough to tell a
 * driver's startup artifact apart from a genuinely covered lens. It always was
 * "initially," never mid-session, which is the startup tell.
 *
 * Twice FROZEN_MS: generous enough to clear a slow driver's warm-up, still
 * short enough that a camera covered from the very first frame is caught
 * within a few seconds of arming rather than never.
 */
export const STARTUP_GRACE_MS = FROZEN_MS * 2;

export type Liveness = {
  /** The last picture we saw, or null before the first sample. */
  readonly signature: readonly number[] | null;
  /** When the picture last differed from the one before it. */
  readonly changedAt: number;
  /** When the first sample was taken. Fixed for the life of one session, so
   *  the startup grace is measured from arming, not from the last change. */
  readonly startedAt: number;
  /** Nothing has changed for {@link FROZEN_MS}, and we are past
   *  {@link STARTUP_GRACE_MS}. */
  readonly frozen: boolean;
};

export function initialLiveness(nowMs: number): Liveness {
  return { signature: null, changedAt: nowMs, startedAt: nowMs, frozen: false };
}

/**
 * Reduce a sampled RGBA buffer to the values we compare.
 *
 * Alpha is dropped: it is 255 for every pixel of every camera frame, so keeping
 * it would be a quarter of the comparison spent on a constant.
 */
export function signatureOf(pixels: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i + 2 < pixels.length; i += 4) {
    out.push(pixels[i], pixels[i + 1], pixels[i + 2]);
  }
  return out;
}

/** Exact equality. One count of difference in one sample is a living camera. */
export function sameSignature(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Fold one sampled frame into the running judgement.
 *
 * The clock is passed in rather than read, so the whole rule is testable without
 * a camera, a dark room, or a timer.
 */
export function observeFrame(
  prev: Liveness,
  signature: readonly number[],
  nowMs: number,
): Liveness {
  if (prev.signature === null || !sameSignature(prev.signature, signature)) {
    return { signature, changedAt: nowMs, startedAt: prev.startedAt, frozen: false };
  }
  const pastStartupGrace = nowMs - prev.startedAt >= STARTUP_GRACE_MS;
  return {
    signature: prev.signature,
    changedAt: prev.changedAt,
    startedAt: prev.startedAt,
    frozen: pastStartupGrace && nowMs - prev.changedAt >= FROZEN_MS,
  };
}
