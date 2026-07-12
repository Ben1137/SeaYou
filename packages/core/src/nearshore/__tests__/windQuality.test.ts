import { describe, it, expect } from 'vitest';
import { shoreNormalFromDepthGradient, windQuality } from '../windQuality';

describe('shoreNormalFromDepthGradient', () => {
  it('gradient pointing west → bearing 270', () => {
    const result = shoreNormalFromDepthGradient(-1, 0);
    expect(result).toBeCloseTo(270, 1);
  });
  it('gradient pointing south → bearing 180', () => {
    expect(shoreNormalFromDepthGradient(0, -1)).toBeCloseTo(180, 1);
  });
  it('gradient pointing east → bearing 90', () => {
    expect(shoreNormalFromDepthGradient(1, 0)).toBeCloseTo(90, 1);
  });
  it('gradient pointing north → bearing 0 (or 360)', () => {
    const r = shoreNormalFromDepthGradient(0, 1)!;
    expect(r % 360).toBeCloseTo(0, 1);
  });
  it('near-zero gradient → null (ambiguous seafloor)', () => {
    expect(shoreNormalFromDepthGradient(0, 0)).toBeNull();
    expect(shoreNormalFromDepthGradient(0.001, 0)).toBeNull();
  });
});

describe('windQuality — sign anchor (west-facing coast)', () => {
  // West-facing coast: gradient points west → shoreNormalDeg = 270
  // Easterly wind (windFrom=90) blows TOWARD west → pure offshore
  it('easterly wind at west-facing coast → offshore', () => {
    const r = windQuality(90, 270);
    expect(r.angle).toBeCloseTo(0, 1);
    expect(r.factor).toBeCloseTo(1, 2);
    expect(r.label).toBe('offshore');
  });
  // Westerly wind (windFrom=270) blows TOWARD east → pure onshore
  it('westerly wind at west-facing coast → onshore', () => {
    const r = windQuality(270, 270);
    expect(r.angle).toBeCloseTo(180, 1);
    expect(r.factor).toBeCloseTo(0, 2);
    expect(r.label).toBe('onshore');
  });
  // Northerly (windFrom=0 → toward=180) at west-facing (normal=270) → 90° cross
  it('northerly wind at west-facing coast → cross ~0.5', () => {
    const r = windQuality(0, 270);
    expect(r.angle).toBeCloseTo(90, 1);
    expect(r.factor).toBeCloseTo(0.5, 2);
    expect(r.label).toBe('cross');
  });
});

describe('windQuality — wrap-around', () => {
  it('near-north bearings wrap correctly', () => {
    // windFrom=170 → toward=350; shoreNormal=10 → diff=20 short way
    const r = windQuality(170, 10);
    expect(r.angle).toBeCloseTo(20, 1);
    expect(r.label).toBe('offshore');
  });
});

describe('windQuality — factor shape', () => {
  it('factor is 1 at angle 0', () => {
    expect(windQuality(90, 270).factor).toBeCloseTo(1, 3);
  });
  it('factor is 0.5 at angle 90', () => {
    expect(windQuality(0, 270).factor).toBeCloseTo(0.5, 2);
  });
  it('factor is 0 at angle 180', () => {
    expect(windQuality(270, 270).factor).toBeCloseTo(0, 3);
  });
});
