import { describe, it, expect } from 'vitest';
import { sweetSpotScore, toBeaufort, kmhToKnots, scoreToLabel, chopIndex, waveSteepness, weatherBonus, gustSafetyScore } from '../../utils/scoring';
import { scoreWaveSurfer, scoreWindSurfer, scoreKiteSurfer, scoreSailor, scoreDiver } from '../personas';
import { scoreActivity } from '../scoreActivity';
import { ActivityPersona, HourlyConditions } from '../../types/scoring';
import { findBestWindow } from '../bestWindow';
import { extractHourlyConditions } from '../extractConditions';
import { MarineWeatherData } from '../../types';

function makeConditions(overrides: Partial<HourlyConditions> = {}): HourlyConditions {
  return {
    time: '2026-04-04T12:00',
    waveHeight: 1.0,
    wavePeriod: 6,
    swellHeight: 1.2,
    swellPeriod: 10,
    swellDirection: 270,
    windSpeed: 15,
    windGusts: 20,
    windDirection: 180,
    ...overrides,
  };
}

// ─── sweetSpotScore ───
describe('sweetSpotScore', () => {
  it('returns 100 in the ideal range', () => {
    expect(sweetSpotScore(5, 0, 3, 7, 10)).toBe(100);
    expect(sweetSpotScore(3, 0, 3, 7, 10)).toBe(100);
    expect(sweetSpotScore(7, 0, 3, 7, 10)).toBe(100);
  });

  it('returns 0 at or beyond boundaries', () => {
    expect(sweetSpotScore(0, 0, 3, 7, 10)).toBe(0);
    expect(sweetSpotScore(10, 0, 3, 7, 10)).toBe(0);
    expect(sweetSpotScore(-1, 0, 3, 7, 10)).toBe(0);
    expect(sweetSpotScore(11, 0, 3, 7, 10)).toBe(0);
  });

  it('returns a smooth curve between boundaries and ideal', () => {
    const mid = sweetSpotScore(1.5, 0, 3, 7, 10);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(100);

    const midHigh = sweetSpotScore(8.5, 0, 3, 7, 10);
    expect(midHigh).toBeGreaterThan(0);
    expect(midHigh).toBeLessThan(100);
  });

  it('is monotonically increasing from min to idealLow', () => {
    const a = sweetSpotScore(0.5, 0, 3, 7, 10);
    const b = sweetSpotScore(1.5, 0, 3, 7, 10);
    const c = sweetSpotScore(2.5, 0, 3, 7, 10);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
});

// ─── Utility functions ───
describe('toBeaufort', () => {
  it('returns 0 for calm', () => expect(toBeaufort(0)).toBe(0));
  it('returns 6 for strong breeze', () => expect(toBeaufort(42)).toBe(6));
  it('returns 12 for hurricane', () => expect(toBeaufort(120)).toBe(12));
});

describe('kmhToKnots', () => {
  it('converts correctly', () => {
    expect(kmhToKnots(1.852)).toBeCloseTo(1, 2);
    expect(kmhToKnots(10)).toBeCloseTo(5.4, 1);
  });
});

describe('scoreToLabel', () => {
  it('maps scores to correct labels', () => {
    expect(scoreToLabel(95).label).toBe('Epic');
    expect(scoreToLabel(75).label).toBe('Good');
    expect(scoreToLabel(55).label).toBe('Fair');
    expect(scoreToLabel(35).label).toBe('Poor');
    expect(scoreToLabel(10).label).toBe('Dangerous');
  });
});

describe('chopIndex', () => {
  it('returns 0 when no wind waves', () => expect(chopIndex(0, 1)).toBe(0));
  it('returns 1 when all wind waves', () => expect(chopIndex(1, 0)).toBe(1));
  it('returns 0.5 when equal', () => expect(chopIndex(1, 1)).toBe(0.5));
  it('returns 0 when both zero', () => expect(chopIndex(0, 0)).toBe(0));
});

describe('weatherBonus', () => {
  it('returns 100 for clear', () => expect(weatherBonus(0)).toBe(100));
  it('returns 0 for thunderstorm', () => expect(weatherBonus(95)).toBe(0));
  it('returns 80 for undefined', () => expect(weatherBonus(undefined)).toBe(80));
});

describe('gustSafetyScore', () => {
  it('returns 100 when gusts match sustained', () => expect(gustSafetyScore(20, 20)).toBe(100));
  it('returns 0 when gusts are 2x sustained', () => expect(gustSafetyScore(20, 40)).toBe(0));
  it('returns 100 when wind is zero', () => expect(gustSafetyScore(0, 0)).toBe(100));
});

// ─── Persona scoring ───
describe('scoreWaveSurfer', () => {
  it('scores high for ideal surf conditions', () => {
    const score = scoreWaveSurfer(makeConditions({
      swellHeight: 1.5, swellPeriod: 10, windSpeed: 10, windWaveHeight: 0.2, weatherCode: 0,
    }));
    expect(score.overall).toBeGreaterThan(70);
    expect(['Good', 'Epic']).toContain(score.label);
  });

  it('scores low for flat conditions', () => {
    const score = scoreWaveSurfer(makeConditions({
      swellHeight: 0.2, swellPeriod: 3, windSpeed: 0,
    }));
    expect(score.overall).toBeLessThan(30);
  });

  it('warns on large swell', () => {
    const score = scoreWaveSurfer(makeConditions({ swellHeight: 4, windGusts: 50 }));
    expect(score.warnings.length).toBeGreaterThan(0);
  });
});

describe('scoreWindSurfer', () => {
  it('scores high for ideal windsurf conditions', () => {
    const score = scoreWindSurfer(makeConditions({
      windSpeed: 25, windGusts: 30, waveHeight: 1.0, seaTemp: 24,
    }));
    expect(score.overall).toBeGreaterThan(60);
  });

  it('scores low when wind is too light', () => {
    const score = scoreWindSurfer(makeConditions({ windSpeed: 5, windGusts: 6, waveHeight: 0.1, seaTemp: 15 }));
    expect(score.overall).toBeLessThan(60);
  });
});

describe('scoreKiteSurfer', () => {
  it('scores high for ideal kite conditions', () => {
    const score = scoreKiteSurfer(makeConditions({
      windSpeed: 22, windGusts: 28, waveHeight: 0.8, weatherCode: 0,
    }));
    expect(score.overall).toBeGreaterThan(60);
  });

  it('warns and penalizes for lightning', () => {
    const score = scoreKiteSurfer(makeConditions({ weatherCode: 95 }));
    expect(score.warnings).toContain('Lightning — do not kite');
    expect(score.factors.weather).toBe(0);
  });
});

describe('scoreSailor', () => {
  it('scores high for fair sailing conditions', () => {
    const score = scoreSailor(makeConditions({
      windSpeed: 18, windGusts: 22, waveHeight: 1.0, visibility: 15000, pressure: 1015,
    }));
    expect(score.overall).toBeGreaterThan(60);
  });

  it('warns on low visibility', () => {
    const score = scoreSailor(makeConditions({ visibility: 2000 }));
    expect(score.warnings).toContain('Low visibility (< 2 nm)');
  });
});

describe('scoreDiver', () => {
  it('scores high for calm, clear conditions', () => {
    const score = scoreDiver(makeConditions({
      waveHeight: 0.3, visibility: 15000, currentSpeed: 0.1, seaTemp: 25, windSpeed: 8,
    }));
    expect(score.overall).toBeGreaterThan(70);
  });

  it('warns on strong currents', () => {
    const score = scoreDiver(makeConditions({ currentSpeed: 1.0 }));
    expect(score.warnings).toContain('Strong currents');
  });

  it('scores low in rough conditions', () => {
    const score = scoreDiver(makeConditions({
      waveHeight: 2.0, visibility: 1500, currentSpeed: 1.2,
    }));
    expect(score.overall).toBeLessThan(30);
  });
});

// ─── scoreActivity dispatcher ───
describe('scoreActivity', () => {
  it('dispatches to correct persona scorer', () => {
    const conds = makeConditions();
    const waveSurf = scoreActivity(ActivityPersona.WAVE_SURFER, conds);
    const sailor = scoreActivity(ActivityPersona.SAILOR, conds);
    expect(waveSurf.overall).not.toBe(sailor.overall);
  });

  it('returns all required fields', () => {
    const result = scoreActivity(ActivityPersona.DIVER, makeConditions());
    expect(result).toHaveProperty('overall');
    expect(result).toHaveProperty('label');
    expect(result).toHaveProperty('color');
    expect(result).toHaveProperty('factors');
    expect(result).toHaveProperty('warnings');
    expect(typeof result.overall).toBe('number');
    expect(result.overall).toBeGreaterThanOrEqual(0);
    expect(result.overall).toBeLessThanOrEqual(100);
  });
});

// ─── extractHourlyConditions ───
describe('extractHourlyConditions', () => {
  const mockData: MarineWeatherData = {
    latitude: 32,
    longitude: 34,
    hourly: {
      time: ['2026-04-04T12:00', '2026-04-04T13:00'],
      wave_height: [1.5, 2.0],
      wave_direction: [270, 280],
      wave_period: [6, 7],
      wind_speed_10m: [15, 20],
      wind_direction_10m: [180, 190],
      wind_gusts_10m: [22, 28],
      swell_wave_height: [1.2, 1.4],
      swell_wave_direction: [260, 265],
      swell_wave_period: [10, 11],
      visibility: [12000, 10000],
      pressure_msl: [1015, 1013],
      sea_surface_temperature: [22, 22],
      uv_index: [5, 6],
      weather_code: [0, 2],
      ocean_current_velocity: [0.3, 0.4],
    },
    daily: {
      time: [], wave_height_max: [], wind_speed_10m_max: [],
      wind_direction_10m_dominant: [], swell_wave_height_max: [],
      swell_wave_direction_dominant: [], wave_period_max: [],
      sunrise: [], sunset: [],
    },
    hourly_units: { wave_height: 'm', wind_speed_10m: 'km/h', swell_wave_height: 'm' },
  };

  it('extracts correct values for a given hour', () => {
    const conds = extractHourlyConditions(mockData, 0);
    expect(conds.waveHeight).toBe(1.5);
    expect(conds.windSpeed).toBe(15);
    expect(conds.swellPeriod).toBe(10);
    expect(conds.visibility).toBe(12000);
    expect(conds.seaTemp).toBe(22);
    expect(conds.currentSpeed).toBe(0.3);
  });

  it('extracts second hour correctly', () => {
    const conds = extractHourlyConditions(mockData, 1);
    expect(conds.waveHeight).toBe(2.0);
    expect(conds.windSpeed).toBe(20);
  });
});

// ─── findBestWindow ───
describe('findBestWindow', () => {
  function makeMockWeatherData(hours: number, scoreSetter: (i: number) => Partial<HourlyConditions>): MarineWeatherData {
    const time: string[] = [];
    const wave_height: number[] = [];
    const wave_period: number[] = [];
    const wind_speed_10m: number[] = [];
    const wind_gusts_10m: number[] = [];
    const wind_direction_10m: number[] = [];
    const wave_direction: number[] = [];
    const swell_wave_height: number[] = [];
    const swell_wave_period: number[] = [];
    const swell_wave_direction: number[] = [];
    const visibility: number[] = [];

    for (let i = 0; i < hours; i++) {
      const h = String(i).padStart(2, '0');
      time.push(`2026-04-04T${h}:00`);
      const c = scoreSetter(i);
      wave_height.push(c.waveHeight ?? 1.0);
      wave_period.push(c.wavePeriod ?? 6);
      wind_speed_10m.push(c.windSpeed ?? 15);
      wind_gusts_10m.push(c.windGusts ?? 20);
      wind_direction_10m.push(c.windDirection ?? 180);
      wave_direction.push(270);
      swell_wave_height.push(c.swellHeight ?? 1.2);
      swell_wave_period.push(c.swellPeriod ?? 10);
      swell_wave_direction.push(c.swellDirection ?? 270);
      visibility.push(c.visibility ?? 10000);
    }

    return {
      latitude: 32, longitude: 34,
      hourly: {
        time, wave_height, wave_direction, wave_period,
        wind_speed_10m, wind_direction_10m, wind_gusts_10m,
        swell_wave_height, swell_wave_direction, swell_wave_period,
        visibility,
      },
      daily: {
        time: [], wave_height_max: [], wind_speed_10m_max: [],
        wind_direction_10m_dominant: [], swell_wave_height_max: [],
        swell_wave_direction_dominant: [], wave_period_max: [],
        sunrise: [], sunset: [],
      },
      hourly_units: { wave_height: 'm', wind_speed_10m: 'km/h', swell_wave_height: 'm' },
    };
  }

  it('finds a window when good conditions exist', () => {
    const data = makeMockWeatherData(24, (i) => {
      // Hours 10-15: ideal sailing conditions
      if (i >= 10 && i <= 15) return { windSpeed: 18, windGusts: 22, waveHeight: 1.0, visibility: 15000 };
      return { windSpeed: 3, windGusts: 4, waveHeight: 0.1 };
    });
    const bw = findBestWindow(data, ActivityPersona.SAILOR);
    expect(bw).not.toBeNull();
    expect(bw!.startIndex).toBeGreaterThanOrEqual(10);
    expect(bw!.endIndex).toBeLessThanOrEqual(15);
    expect(bw!.avgScore).toBeGreaterThan(40);
  });

  it('returns null when no conditions meet threshold', () => {
    const data = makeMockWeatherData(24, () => ({
      windSpeed: 0, windGusts: 0, waveHeight: 0, swellHeight: 0, swellPeriod: 2,
    }));
    const bw = findBestWindow(data, ActivityPersona.WAVE_SURFER);
    expect(bw).toBeNull();
  });
});
