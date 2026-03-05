export function estimateBpmFromSamples(samples: number[], sampleRate: number): { bpm: number | null; confidence: number } {
  if (!samples || samples.length < 8) return { bpm: null, confidence: 0 };
  const fmin = 0.7;
  const fmax = 4.0;
  const df = 0.02;
  const n = samples.length;
  // mean normalize
  const mean = samples.reduce((a, b) => a + b, 0) / n;
  const x = samples.map((v) => v - mean);
  // Hann window
  const ns = n;
  for (let i = 0; i < n; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (ns - 1)));
    x[i] *= w;
  }

  let bestF = 0;
  let bestP = 0;
  const powers: number[] = [];
  for (let k = 0; k <= Math.floor((fmax - fmin) / df); k++) {
    const f = fmin + k * df;
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate;
      const ang = 2 * Math.PI * f * t;
      re += x[i] * Math.cos(ang);
      im += x[i] * Math.sin(ang);
    }
    const p = (re * re + im * im) / n;
    powers.push(p);
    if (p > bestP) {
      bestP = p;
      bestF = f;
    }
  }
  if (bestP <= 0) return { bpm: null, confidence: 0 };
  // simple confidence: peak power / total energy
  const totalEnergy = x.reduce((a, b) => a + b * b, 0);
  const confidence = totalEnergy > 1e-12 ? Math.min(1, bestP / totalEnergy) : 0;
  return { bpm: bestF * 60, confidence };
}
