import { describe, it, expect } from 'vitest';
import { coastalSurfRating } from '../coastalSurfRating';

describe('coastalSurfRating', () => {
  it('returns 0–100 overall score', () => {
    const result = coastalSurfRating({
      breakingHeight: 1.5,
      period: 12,
      primaryHeight: 1.5,
      secondaryHeight: 0.8,
      shoreNormalDeg: 0,
      windDirection: 0,
      windSpeed: 10,
      windWaveHeight: 0.3,
      swellHeight: 1.5,
    });
    expect(result.overall).toBeGreaterThanOrEqual(0);
    expect(result.overall).toBeLessThanOrEqual(100);
  });

  it('rises with breaking height in ideal range (0.5–2.5 m)', () => {
    const baseInputs = {
      period: 12,
      primaryHeight: 1.5,
      secondaryHeight: 0,
      shoreNormalDeg: 0,
      windDirection: 0,
      windSpeed: 10,
      windWaveHeight: 0.3,
      swellHeight: 1.5,
    };

    const small = coastalSurfRating({ ...baseInputs, breakingHeight: 0.3 });
    const medium = coastalSurfRating({ ...baseInputs, breakingHeight: 1.5 });
    const large = coastalSurfRating({ ...baseInputs, breakingHeight: 3.5 });

    // Medium should be best, small and large worse
    expect(medium.overall).toBeGreaterThan(small.overall);
    expect(medium.overall).toBeGreaterThan(large.overall);
  });

  it('rises with period in ideal range (8–16 s)', () => {
    const baseInputs = {
      breakingHeight: 1.5,
      primaryHeight: 1.5,
      secondaryHeight: 0,
      shoreNormalDeg: 0,
      windDirection: 0,
      windSpeed: 10,
      windWaveHeight: 0.3,
      swellHeight: 1.5,
    };

    const shortPeriod = coastalSurfRating({ ...baseInputs, period: 5 });
    const goodPeriod = coastalSurfRating({ ...baseInputs, period: 12 });
    const longPeriod = coastalSurfRating({ ...baseInputs, period: 18 });

    expect(goodPeriod.overall).toBeGreaterThan(shortPeriod.overall);
    expect(goodPeriod.overall).toBeGreaterThan(longPeriod.overall);
  });

  it('falls with large secondary swell (crossing reduces cleanliness)', () => {
    const baseInputs = {
      breakingHeight: 1.5,
      period: 12,
      primaryHeight: 1.5,
      shoreNormalDeg: 0,
      windDirection: 0,
      windSpeed: 10,
      windWaveHeight: 0.3,
      swellHeight: 1.5,
    };

    const clean = coastalSurfRating({ ...baseInputs, secondaryHeight: 0 });
    const crossed = coastalSurfRating({ ...baseInputs, secondaryHeight: 1.2 });

    expect(clean.overall).toBeGreaterThan(crossed.overall);
  });

  it('falls with onshore wind', () => {
    const baseInputs = {
      breakingHeight: 1.5,
      period: 12,
      primaryHeight: 1.5,
      secondaryHeight: 0,
      shoreNormalDeg: 0, // Offshore bearing
      windSpeed: 10,
      windWaveHeight: 0.3,
      swellHeight: 1.5,
    };

    const offshore = coastalSurfRating({ ...baseInputs, windDirection: 180 }); // Wind FROM south (blows north = offshore)
    const onshore = coastalSurfRating({ ...baseInputs, windDirection: 0 });   // Wind FROM north (blows south = onshore)

    expect(offshore.overall).toBeGreaterThan(onshore.overall);
  });

  it('degrades gracefully when secondary height missing', () => {
    const result = coastalSurfRating({
      breakingHeight: 1.5,
      period: 12,
      primaryHeight: 1.5,
      secondaryHeight: null, // Missing
      shoreNormalDeg: 0,
      windDirection: 180,
      windSpeed: 10,
      windWaveHeight: 0.3,
      swellHeight: 1.5,
    });

    expect(result.overall).toBeGreaterThan(0);
    expect(result.overall).toBeLessThanOrEqual(100);
    expect(result.confidence).toBe('low');
  });

  it('has "high" confidence when all inputs present', () => {
    const result = coastalSurfRating({
      breakingHeight: 1.5,
      period: 12,
      primaryHeight: 1.5,
      secondaryHeight: 0.5,
      shoreNormalDeg: 45,
      windDirection: 90,
      windSpeed: 10,
      windWaveHeight: 0.3,
      swellHeight: 1.5,
    });

    expect(result.confidence).toBe('high');
  });

  it('returns breakdown array with factor rows', () => {
    const result = coastalSurfRating({
      breakingHeight: 1.5,
      period: 12,
      primaryHeight: 1.5,
      secondaryHeight: 0.5,
      shoreNormalDeg: 0,
      windDirection: 180,
      windSpeed: 10,
      windWaveHeight: 0.3,
      swellHeight: 1.5,
    });

    expect(Array.isArray(result.breakdown)).toBe(true);
    expect(result.breakdown.length).toBeGreaterThan(0);
    result.breakdown.forEach(row => {
      expect(row).toHaveProperty('label');
      expect(row).toHaveProperty('value');
      expect(row).toHaveProperty('impact');
      expect(['positive', 'neutral', 'negative']).toContain(row.impact);
    });
  });

  it('maps overall score to label (Epic/Good/Fair/Poor/Dangerous)', () => {
    const excellent = coastalSurfRating({
      breakingHeight: 1.8,
      period: 14,
      primaryHeight: 1.8,
      secondaryHeight: 0.2,
      shoreNormalDeg: 0,
      windDirection: 180,
      windSpeed: 8,
      windWaveHeight: 0.2,
      swellHeight: 1.8,
    });

    const poor = coastalSurfRating({
      breakingHeight: 0.1,
      period: 3,
      primaryHeight: 0.1,
      secondaryHeight: null,
      shoreNormalDeg: null,
      windDirection: 0,
      windSpeed: 40,
      windWaveHeight: 2.0,
      swellHeight: 0.1,
    });

    expect(['Epic', 'Good', 'Fair', 'Poor', 'Dangerous']).toContain(excellent.label);
    expect(['Epic', 'Good', 'Fair', 'Poor', 'Dangerous']).toContain(poor.label);
    expect(excellent.overall).toBeGreaterThan(poor.overall);
  });
});
