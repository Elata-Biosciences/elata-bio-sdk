import { ManualPulseTimer } from '../manualTimer';

jest.useFakeTimers();

describe('ManualPulseTimer', () => {
  beforeEach(() => {
    jest.setSystemTime(0);
  });

  test('counts taps and computes bpm', () => {
    const t = new ManualPulseTimer();
    t.start();

    // at t=0
    t.tap(); // 1

    // advance 833ms (approx 72 bpm => period 833ms)
    jest.advanceTimersByTime(833);
    t.tap(); // 2

    jest.advanceTimersByTime(833);
    t.tap(); // 3

    jest.advanceTimersByTime(833);
    t.tap(); // 4

    // elapsed ~2499ms -> 4 taps / 2.499s * 60 = ~96 BPM
    const bpm = t.getBpm();
    expect(bpm).not.toBeNull();
    expect(bpm!).toBeGreaterThan(80);
    expect(bpm!).toBeLessThan(110);
  });

  test('reset clears state', () => {
    const t = new ManualPulseTimer();
    t.start();
    t.tap();
    jest.advanceTimersByTime(1000);
    t.reset();
    expect(t.getCount()).toBe(0);
    expect(t.getBpm()).toBeNull();
  });
});
