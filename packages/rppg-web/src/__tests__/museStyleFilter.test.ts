import { museStyleFilter } from '../rppgProcessor';

describe('museStyleFilter', () => {
  test('returns empty output for empty input', () => {
    expect(museStyleFilter([], 30)).toEqual([]);
  });

  test('preserves sample count and attenuates DC baseline', () => {
    const fs = 30;
    const n = 300;
    const samples = new Array(n).fill(0).map((_, i) => {
      const t = i / fs;
      return 8 + 0.6 * Math.sin(2 * Math.PI * 1.2 * t) + 0.3 * Math.sin(2 * Math.PI * 0.1 * t);
    });

    const filtered = museStyleFilter(samples, fs);
    expect(filtered.length).toBe(samples.length);
    expect(filtered.every((v) => Number.isFinite(v))).toBe(true);

    const inputMean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const outputMean = filtered.reduce((a, b) => a + b, 0) / filtered.length;
    expect(Math.abs(outputMean)).toBeLessThan(Math.abs(inputMean) * 0.2);
  });
});
