import { describe, expect, it } from 'vitest';
import { autoSlices, transientChopCount, MIN_AUTO_CHOPS, MAX_AUTO_CHOPS } from './sample';

// flat peaks → strength selection falls back to first-come, but boundary rules
// (order / coverage / count) must always hold
const flatPeaks = new Float32Array(400).fill(0.5);

function assertValid(slices: ReturnType<typeof autoSlices>, duration: number) {
  expect(slices[0].start).toBeCloseTo(0, 6);
  expect(slices[slices.length - 1].end).toBeCloseTo(duration, 6);
  for (let i = 0; i < slices.length; i++) {
    expect(slices[i].end).toBeGreaterThan(slices[i].start); // no zero/negative length
    if (i > 0) expect(slices[i].start).toBeCloseTo(slices[i - 1].end, 6); // gap-free, ordered
  }
}

describe('autoSlices', () => {
  it('produces exactly the requested chop count', () => {
    for (const count of [2, 3, 5, 8, 16, 32]) {
      const s = autoSlices([0.5, 1, 1.5, 2, 2.5, 3, 3.5], flatPeaks, 4, count);
      expect(s.length).toBe(count);
      assertValid(s, 4);
    }
  });

  it('clamps the count to [2, 32]', () => {
    expect(autoSlices([], flatPeaks, 4, 1).length).toBe(MIN_AUTO_CHOPS);
    expect(autoSlices([], flatPeaks, 4, 999).length).toBe(MAX_AUTO_CHOPS);
  });

  it('keeps the strongest transients when there are more than needed', () => {
    // N = peaks.length = 4, duration = 4 → strengthAt(t) = peaks[floor(t)]
    const peaks = new Float32Array([0, 0.1, 0.9, 0.2]);
    const s = autoSlices([1, 2, 3], peaks, 4, 2); // need 1 internal boundary
    expect(s.length).toBe(2);
    // the strongest transient (t=2, peak 0.9) becomes the boundary
    expect(s[0].end).toBeCloseTo(2, 6);
    assertValid(s, 4);
  });

  it('fills evenly by splitting the widest gaps when transients are too few', () => {
    const s = autoSlices([], flatPeaks, 4, 4); // no transients → 4 even chops
    expect(s.length).toBe(4);
    for (const slice of s) expect(slice.end - slice.start).toBeCloseTo(1, 6);
    assertValid(s, 4);
  });
});

describe('transientChopCount', () => {
  it('counts internal transients + 1, clamped to the range', () => {
    expect(transientChopCount([], 4)).toBe(MIN_AUTO_CHOPS);
    expect(transientChopCount([1, 2, 3], 4)).toBe(4);
    const many = Array.from({ length: 60 }, (_, i) => (i + 1) * 0.05);
    expect(transientChopCount(many, 4)).toBe(MAX_AUTO_CHOPS);
  });
});
