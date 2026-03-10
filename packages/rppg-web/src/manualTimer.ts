export class ManualPulseTimer {
	private startMs: number | null = null;
	private pausedElapsedMs: number = 0;
	private count: number = 0;

	start() {
		if (this.startMs === null) {
			this.startMs = Date.now();
		}
	}

	stop() {
		if (this.startMs !== null) {
			this.pausedElapsedMs += Date.now() - this.startMs;
			this.startMs = null;
		}
	}

	reset() {
		this.startMs = null;
		this.pausedElapsedMs = 0;
		this.count = 0;
	}

	tap() {
		// increment count regardless of running state to allow retrospective taps
		this.count += 1;
	}

	getCount() {
		return this.count;
	}

	getElapsedMs() {
		let elapsed = this.pausedElapsedMs;
		if (this.startMs !== null) {
			elapsed += Date.now() - this.startMs;
		}
		return elapsed;
	}

	getElapsedSeconds() {
		return this.getElapsedMs() / 1000.0;
	}

	getBpm() {
		const secs = this.getElapsedSeconds();
		if (secs <= 0) return null;
		const bpm = (this.count / secs) * 60.0;
		return Number.isFinite(bpm) ? bpm : null;
	}
}
