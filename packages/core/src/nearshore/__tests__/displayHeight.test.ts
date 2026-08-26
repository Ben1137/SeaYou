import { describe, it, expect } from 'vitest';
import { breakerDisplayFactor } from '../displayHeight';

describe('breakerDisplayFactor', () => {
  it('should return 1.0 for long-period swell (T ≥ 14s)', () => {
    expect(breakerDisplayFactor({ T: 14 })).toBeCloseTo(1.0, 2);
    expect(breakerDisplayFactor({ T: 16 })).toBeCloseTo(1.0, 2);
    expect(breakerDisplayFactor({ T: 20 })).toBeCloseTo(1.0, 2);
  });

  it('should return ~0.35 for very short chop (T ≤ 4s)', () => {
    expect(breakerDisplayFactor({ T: 4 })).toBeLessThan(0.36);
    expect(breakerDisplayFactor({ T: 3 })).toBeLessThan(0.36);
    expect(breakerDisplayFactor({ T: 1 })).toBeLessThan(0.36);
  });

  it('should transition smoothly from short to long period', () => {
    const T4 = breakerDisplayFactor({ T: 4 });
    const T8 = breakerDisplayFactor({ T: 8 });
    const T14 = breakerDisplayFactor({ T: 14 });

    // Monotonically increasing
    expect(T4).toBeLessThan(T8);
    expect(T8).toBeLessThan(T14);

    // T=8 should be in the middle range
    expect(T8).toBeGreaterThan(0.55); // Not too penalized
    expect(T8).toBeLessThan(0.95); // But still penalized
  });

  it('should damp short-period wind-swell (T=5-8s) to realistic face heights', () => {
    // Gordon exemplar: K-G reports 0.73 m for ~5.2 s swell
    // Surfers see shin-to-knee (~0.2–0.5 m) → factor ~0.4–0.65
    const factor_5s = breakerDisplayFactor({ T: 5.2 });
    expect(factor_5s).toBeGreaterThan(0.35);
    expect(factor_5s).toBeLessThan(0.70);

    // Display height = 0.73 * factor_5s ≈ 0.29–0.51 m (shin to mid-calf)
    const displayHeight = 0.73 * factor_5s;
    expect(displayHeight).toBeGreaterThan(0.2);
    expect(displayHeight).toBeLessThan(0.6);
  });

  it('should clamp output to [0, 1]', () => {
    expect(breakerDisplayFactor({ T: -5 })).toBeLessThanOrEqual(1);
    expect(breakerDisplayFactor({ T: -5 })).toBeGreaterThanOrEqual(0);

    expect(breakerDisplayFactor({ T: 0 })).toBeLessThanOrEqual(1);
    expect(breakerDisplayFactor({ T: 0 })).toBeGreaterThanOrEqual(0);

    expect(breakerDisplayFactor({ T: 100 })).toBeLessThanOrEqual(1);
    expect(breakerDisplayFactor({ T: 100 })).toBeGreaterThanOrEqual(0);
  });

  it('should handle NaN/Infinity gracefully', () => {
    expect(breakerDisplayFactor({ T: NaN })).toBe(1.0);
    expect(breakerDisplayFactor({ T: Infinity })).toBe(1.0);
    expect(breakerDisplayFactor({ T: -Infinity })).toBe(1.0);
  });

  it('should return higher factors for longer periods (monotonic)', () => {
    const periods = [4, 5, 6, 7, 8, 10, 12, 14, 16];
    const factors = periods.map(T => breakerDisplayFactor({ T }));

    for (let i = 0; i < factors.length - 1; i++) {
      expect(factors[i + 1]).toBeGreaterThanOrEqual(factors[i]);
    }
  });

  it('should show factor ~0.8 for T=10s (medium swell)', () => {
    const factor = breakerDisplayFactor({ T: 10 });
    expect(factor).toBeGreaterThan(0.75);
    expect(factor).toBeLessThan(0.95);
  });

  it('should show factor ~0.5 for T=6.5s (windswell transition)', () => {
    const factor = breakerDisplayFactor({ T: 6.5 });
    expect(factor).toBeGreaterThan(0.40);
    expect(factor).toBeLessThan(0.70);
  });
});
