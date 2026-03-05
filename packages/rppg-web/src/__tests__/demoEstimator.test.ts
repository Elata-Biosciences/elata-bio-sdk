import { estimateBpmFromSamples } from '../demoEstimator';

test('estimator finds 1.5 Hz (90 bpm) tone', () => {
  const fs = 100;
  const n = 500;
  const freq = 1.5;
  const samples = new Array(n).fill(0).map((_, i) => Math.sin(2 * Math.PI * freq * (i / fs)));
  const res = estimateBpmFromSamples(samples, fs);
  expect(res.bpm).not.toBeNull();
  expect(Math.abs((res.bpm || 0) - freq * 60)).toBeLessThan(3);
  expect(res.confidence).toBeGreaterThan(0.05);
});
