/**
 * The stage machine a reading moves through during capture: pure state
 * logic, no copy or presentation. Consuming apps map each stage to their own
 * label/tone (work-framing vs. recovery-framing genuinely differ per app;
 * see elata-bio-sdk#405/#24), but the ORDER these stages resolve in is the
 * same drift-prone logic every consumer needs, so only the stage machine
 * itself moves here.
 */

export type CalibrationStage =
	| "ready"
	| "paused"
	| "adapting-light"
	| "positioning"
	| "restarting"
	| "acquiring"
	| "calibrating"
	| "measuring"
	| "locked";

/**
 * Staged scan: adapt to the room, get set up, then take the reading.
 *
 * `adapting-light` comes FIRST and wins over everything except pause/lock: for
 * a brief window after arming, the app is still ramping its own fill-light and
 * the camera's exposure toward a stable reading of the room, and samples taken
 * during that ramp are the ones that come back "too high"; the light itself
 * was still changing under them. During this window nothing is gathered and
 * no advice is given, because there is nothing for the READER to fix; the app
 * is still adjusting itself.
 *
 * After that: a weak signal *or* a face that isn't framed is `positioning`,
 * show the actionable fix (more light / lower your face / hold still), no
 * progress, no vitals. Once conditions are good we're `acquiring` (warming up
 * to the first beat), then `calibrating` (a clean read building toward
 * trust), then `measuring` (the read is trustworthy and framed, we're
 * capturing the clean reading to commit). Order: pause wins, then a completed
 * lock, then the light-adaptation window, then bad conditions (always more
 * useful than a stale number), then the trustworthy capture, then build-up;
 * otherwise warming up.
 */
export function calibrationStage(args: {
	paused: boolean;
	locked: boolean;
	conditionsGood: boolean;
	trustworthy: boolean;
	progressPct: number;
	/** False while the capture is held for the walkthrough: nothing is being
	 *  measured yet, and the stage must SAY so ('ready'), because a ring that
	 *  reads "getting a clear signal" while held is calibration to the person
	 *  watching, whatever the internals do. */
	armed?: boolean;
	/**
	 * The calibrator discarded its samples and is building again.
	 *
	 * Given a stage of its own because the alternative is what shipped: the ring
	 * freezes for five seconds or more with a perfectly normal label under it, and
	 * a bar that has stopped moving for no stated reason is the thing the owner
	 * called laggy. The state is real, so it gets a name.
	 */
	restarted?: boolean;
	/** Still inside the ambient-light warm-up window since arming. No sample
	 *  is gathered while this holds. */
	adaptingLight?: boolean;
}): CalibrationStage {
	if (args.armed === false) return "ready";
	if (args.paused) return "paused";
	if (args.locked) return "locked";
	if (args.adaptingLight) return "adapting-light";
	// Bad conditions still win. "Hold still, more light" is something the reader can
	// act on; "starting again" is not, so it must never displace advice.
	if (!args.conditionsGood) return "positioning";
	if (args.restarted) return "restarting";
	if (args.trustworthy) return "measuring";
	if (args.progressPct > 0) return "calibrating";
	return "acquiring";
}
