/**
 * SimulatedEegSource
 *
 * Generates synthetic EEG data with realistic frequency content:
 *   - Alpha rhythm (10 Hz, dominant)
 *   - Theta rhythm (6 Hz)
 *   - Beta component (20 Hz, low amplitude)
 *   - Pink-ish noise floor
 *
 * Calls back with { data: number[][] } where data is sample-major:
 *   data[sample][channel]
 */
export class SimulatedEegSource {
  constructor(sampleRate = 256, channels = 4) {
    this._fs = sampleRate;
    this._ch = channels;
    this._timer = null;
    this._t = 0;
    this._batchSize = Math.round(sampleRate / 10); // 10 deliveries/sec
  }

  start(callback) {
    const intervalMs = (this._batchSize / this._fs) * 1000;
    // Per-channel phase offsets so channels differ slightly
    const phaseOffsets = Array.from({ length: this._ch }, (_, i) => (i * Math.PI) / 4);

    this._timer = setInterval(() => {
      const data = [];
      for (let s = 0; s < this._batchSize; s++) {
        const t = this._t + s / this._fs;
        const row = [];
        for (let ch = 0; ch < this._ch; ch++) {
          const phi = phaseOffsets[ch];
          const alpha = 25 * Math.sin(2 * Math.PI * 10 * t + phi);
          const theta = 10 * Math.sin(2 * Math.PI * 6 * t + phi * 0.5);
          const beta  =  5 * Math.sin(2 * Math.PI * 20 * t);
          const noise = (Math.random() - 0.5) * 8;
          row.push(alpha + theta + beta + noise);
        }
        data.push(row);
      }
      this._t += this._batchSize / this._fs;
      callback({ data });
    }, intervalMs);
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }
}
