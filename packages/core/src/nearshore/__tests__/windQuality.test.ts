import { describe, it, expect } from 'vitest';
import { shoreNormalFromDepthGradient, windQuality, windQualityMultiplier, windHazard } from '../windQuality';
import { ActivityPersona } from '../../types/scoring';

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
    expect(shoreNormalFromDepthGradient(1e-5, 0)).toBeNull();
  });
  it('gentle real shelf slope (~3 m/km westward) is NOT discarded', () => {
    expect(shoreNormalFromDepthGradient(-0.003, 0)).toBeCloseTo(270, 1);
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

describe('windQualityMultiplier', () => {
  it('WAVE_SURFER: offshore=1.0, onshore=0.55', () => {
    expect(windQualityMultiplier(ActivityPersona.WAVE_SURFER, 0)).toBeCloseTo(1.0, 3);
    expect(windQualityMultiplier(ActivityPersona.WAVE_SURFER, 180)).toBeCloseTo(0.55, 3);
    expect(windQualityMultiplier(ActivityPersona.WAVE_SURFER, 90)).toBeGreaterThan(0.55);
    expect(windQualityMultiplier(ActivityPersona.WAVE_SURFER, 90)).toBeLessThan(1.0);
  });
  it('BOOGIE_BOARDER: offshore=1.0, onshore=0.75', () => {
    expect(windQualityMultiplier(ActivityPersona.BOOGIE_BOARDER, 0)).toBeCloseTo(1.0, 3);
    expect(windQualityMultiplier(ActivityPersona.BOOGIE_BOARDER, 180)).toBeCloseTo(0.75, 3);
  });
  it('KITE_SURFER V-curve: offshore=0.2, cross=1.0, onshore=0.8; offshore < onshore (safety-critical)', () => {
    expect(windQualityMultiplier(ActivityPersona.KITE_SURFER, 0)).toBeCloseTo(0.2, 3);
    expect(windQualityMultiplier(ActivityPersona.KITE_SURFER, 90)).toBeCloseTo(1.0, 3);
    expect(windQualityMultiplier(ActivityPersona.KITE_SURFER, 180)).toBeCloseTo(0.8, 3);
    expect(windQualityMultiplier(ActivityPersona.KITE_SURFER, 0)).toBeLessThan(windQualityMultiplier(ActivityPersona.KITE_SURFER, 180));
  });
  it('DIVER: flat 1.0 for any angle', () => {
    expect(windQualityMultiplier(ActivityPersona.DIVER, 0)).toBeCloseTo(1.0, 3);
    expect(windQualityMultiplier(ActivityPersona.DIVER, 90)).toBeCloseTo(1.0, 3);
    expect(windQualityMultiplier(ActivityPersona.DIVER, 180)).toBeCloseTo(1.0, 3);
  });
});

describe('windHazard', () => {
  it('kite + offshore + sufficient wind → hazard', () => {
    expect(windHazard(ActivityPersona.KITE_SURFER, 30, 25)).toBe(true);
  });
  it('kite + offshore + calm wind → no hazard', () => {
    expect(windHazard(ActivityPersona.KITE_SURFER, 30, 8)).toBe(false);
  });
  it('wave surfer + offshore → no hazard (wrong persona)', () => {
    expect(windHazard(ActivityPersona.WAVE_SURFER, 30, 25)).toBe(false);
  });
  it('kite + onshore → no hazard (not offshore)', () => {
    expect(windHazard(ActivityPersona.KITE_SURFER, 120, 25)).toBe(false);
  });
});
