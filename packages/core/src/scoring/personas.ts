import { HourlyConditions, ActivityScore } from '../types/scoring';
import { sweetSpotScore, scoreToLabel, weatherBonus, gustSafetyScore, chopIndex } from '../utils/scoring';

function buildScore(overall: number, factors: Record<string, number>, warnings: string[]): ActivityScore {
  const clamped = Math.round(Math.max(0, Math.min(100, overall)));
  const { label, color } = scoreToLabel(clamped);
  return { overall: clamped, label, color, factors, warnings };
}

export function scoreWaveSurfer(c: HourlyConditions): ActivityScore {
  const warnings: string[] = [];
  if (c.swellHeight > 3.5) warnings.push('Large swell — experienced surfers only');
  if (c.windGusts > 40) warnings.push('Strong gusts');

  const factors: Record<string, number> = {
    swellHeight: sweetSpotScore(c.swellHeight, 0.3, 1.0, 2.5, 4.0),
    swellPeriod: sweetSpotScore(c.swellPeriod, 4, 8, 14, 20),
    windSpeed: sweetSpotScore(c.windSpeed, 0, 5, 15, 35),
    chop: (1 - chopIndex(c.windWaveHeight || 0, c.swellHeight)) * 100,
    weather: weatherBonus(c.weatherCode),
  };

  const overall = factors.swellHeight * 0.35
    + factors.swellPeriod * 0.25
    + factors.windSpeed * 0.20
    + factors.chop * 0.10
    + factors.weather * 0.10;

  return buildScore(overall, factors, warnings);
}

export function scoreWindSurfer(c: HourlyConditions): ActivityScore {
  const warnings: string[] = [];
  if (c.windGusts > 50) warnings.push('Extreme gusts — danger');
  if (c.waveHeight > 3) warnings.push('Heavy seas');

  const factors: Record<string, number> = {
    windSpeed: sweetSpotScore(c.windSpeed, 12, 20, 35, 55),
    gustSafety: gustSafetyScore(c.windSpeed, c.windGusts),
    waveHeight: sweetSpotScore(c.waveHeight, 0, 0.5, 2.0, 3.5),
    windConsistency: gustSafetyScore(c.windSpeed, c.windGusts),
    seaTemp: c.seaTemp !== undefined ? sweetSpotScore(c.seaTemp, 10, 18, 28, 35) : 70,
  };

  const overall = factors.windSpeed * 0.40
    + factors.gustSafety * 0.15
    + factors.waveHeight * 0.20
    + factors.windConsistency * 0.15
    + factors.seaTemp * 0.10;

  return buildScore(overall, factors, warnings);
}

export function scoreKiteSurfer(c: HourlyConditions): ActivityScore {
  const warnings: string[] = [];
  if (c.windGusts > 45) warnings.push('Dangerous gusts for kiting');
  if (c.weatherCode !== undefined && c.weatherCode >= 95) warnings.push('Lightning — do not kite');

  const gustDelta = c.windGusts - c.windSpeed;
  const factors: Record<string, number> = {
    windSpeed: sweetSpotScore(c.windSpeed, 10, 15, 30, 45),
    gustDelta: sweetSpotScore(gustDelta, 0, 0, 10, 20),
    waveHeight: sweetSpotScore(c.waveHeight, 0, 0.3, 1.5, 3.0),
    windDirection: 70, // neutral — would need shore orientation for full accuracy
    weather: weatherBonus(c.weatherCode),
  };

  // Lightning override
  if (c.weatherCode !== undefined && c.weatherCode >= 95) {
    factors.weather = 0;
  }

  const overall = factors.windSpeed * 0.45
    + factors.gustDelta * 0.15
    + factors.waveHeight * 0.15
    + factors.windDirection * 0.15
    + factors.weather * 0.10;

  return buildScore(overall, factors, warnings);
}

export function scoreSailor(c: HourlyConditions): ActivityScore {
  const warnings: string[] = [];
  if (c.waveHeight > 3) warnings.push('Heavy seas');
  if ((c.visibility || 10000) < 3704) warnings.push('Low visibility (< 2 nm)');
  if (c.windGusts > 45) warnings.push('Strong gusts');

  const visNm = (c.visibility || 10000) / 1852;
  const factors: Record<string, number> = {
    windSpeed: sweetSpotScore(c.windSpeed, 0, 10, 25, 45),
    waveHeight: sweetSpotScore(c.waveHeight, 0, 0, 2.0, 4.0),
    visibility: sweetSpotScore(visNm, 1, 5, 20, 30),
    pressure: c.pressure !== undefined ? sweetSpotScore(c.pressure, 990, 1005, 1025, 1040) : 70,
    gustSafety: gustSafetyScore(c.windSpeed, c.windGusts),
    currentSpeed: c.currentSpeed !== undefined ? sweetSpotScore(c.currentSpeed, 0, 0, 0.8, 1.5) : 70,
  };

  const overall = factors.windSpeed * 0.30
    + factors.waveHeight * 0.25
    + factors.visibility * 0.15
    + factors.pressure * 0.10
    + factors.gustSafety * 0.10
    + factors.currentSpeed * 0.10;

  return buildScore(overall, factors, warnings);
}

export function scoreDiver(c: HourlyConditions): ActivityScore {
  const warnings: string[] = [];
  if ((c.currentSpeed || 0) > 0.8) warnings.push('Strong currents');
  if ((c.visibility || 10000) < 3000) warnings.push('Poor visibility');
  if (c.waveHeight > 1.2) warnings.push('Rough surface conditions');

  const factors: Record<string, number> = {
    visibility: sweetSpotScore(c.visibility || 10000, 2000, 8000, 20000, 30000),
    waveHeight: sweetSpotScore(c.waveHeight, 0, 0, 0.8, 1.5),
    currentSpeed: sweetSpotScore(c.currentSpeed || 0, 0, 0, 0.3, 1.0),
    seaTemp: c.seaTemp !== undefined ? sweetSpotScore(c.seaTemp, 14, 22, 28, 32) : 70,
    windSpeed: sweetSpotScore(c.windSpeed, 0, 0, 15, 30),
  };

  const overall = factors.visibility * 0.30
    + factors.waveHeight * 0.25
    + factors.currentSpeed * 0.20
    + factors.seaTemp * 0.15
    + factors.windSpeed * 0.10;

  return buildScore(overall, factors, warnings);
}
