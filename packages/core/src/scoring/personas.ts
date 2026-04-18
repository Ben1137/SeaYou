import { HourlyConditions, ActivityScore, ScoreFactor } from '../types/scoring';
import { sweetSpotScore, scoreToLabel, weatherBonus, gustSafetyScore, chopIndex } from '../utils/scoring';

/**
 * Classify a 0-100 factor score into the Explainable-UI impact bucket.
 *   >= 70 → positive (green)  — this factor helped
 *   40-69 → neutral  (gray)   — middling
 *   < 40  → negative (red)    — this factor hurt the score
 */
function impactFrom(score: number): ScoreFactor['impact'] {
  if (score >= 70) return 'positive';
  if (score >= 40) return 'neutral';
  return 'negative';
}

/** Build a single `ScoreFactor` row given a 0-100 numeric score. */
function factorRow(label: string, value: string, score: number): ScoreFactor {
  return { label, value, impact: impactFrom(score) };
}

function buildScore(
  overall: number,
  factors: Record<string, number>,
  warnings: string[],
  breakdown: ScoreFactor[],
): ActivityScore {
  const clamped = Math.round(Math.max(0, Math.min(100, overall)));
  const { label, color } = scoreToLabel(clamped);
  return { overall: clamped, label, color, factors, warnings, breakdown };
}

// ─── Small value-formatting helpers ────────────────────────────────────────
const fmtM = (n: number) => `${n.toFixed(1)} m`;
const fmtS = (n: number) => `${n.toFixed(1)} s`;
const fmtKmh = (n: number) => `${Math.round(n)} km/h`;
const fmtC = (n: number) => `${Math.round(n)}°C`;
const fmtMs = (n: number) => `${n.toFixed(2)} m/s`;
const fmtNm = (n: number) => `${n.toFixed(1)} nm`;

function weatherLabel(code: number | undefined): string {
  if (code === undefined) return 'Unknown';
  if (code === 0) return 'Clear';
  if (code <= 3) return 'Partly Cloudy';
  if (code <= 48) return 'Foggy';
  if (code <= 57) return 'Drizzle';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Mixed';
}

// ─── Personas ──────────────────────────────────────────────────────────────

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

  const breakdown: ScoreFactor[] = [
    factorRow('Swell Height', fmtM(c.swellHeight), factors.swellHeight),
    factorRow('Swell Period', fmtS(c.swellPeriod), factors.swellPeriod),
    factorRow('Wind Speed', fmtKmh(c.windSpeed), factors.windSpeed),
    factorRow('Chop', c.windWaveHeight ? fmtM(c.windWaveHeight) : 'Minimal', factors.chop),
    factorRow('Weather', weatherLabel(c.weatherCode), factors.weather),
  ];

  return buildScore(overall, factors, warnings, breakdown);
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

  const breakdown: ScoreFactor[] = [
    factorRow('Wind Speed', fmtKmh(c.windSpeed), factors.windSpeed),
    factorRow('Gust Safety', `${fmtKmh(c.windGusts)} gusts`, factors.gustSafety),
    factorRow('Wave Height', fmtM(c.waveHeight), factors.waveHeight),
    factorRow('Wind Consistency', `Δ ${fmtKmh(c.windGusts - c.windSpeed)}`, factors.windConsistency),
    factorRow('Sea Temp', c.seaTemp !== undefined ? fmtC(c.seaTemp) : '—', factors.seaTemp),
  ];

  return buildScore(overall, factors, warnings, breakdown);
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

  const breakdown: ScoreFactor[] = [
    factorRow('Wind Speed', fmtKmh(c.windSpeed), factors.windSpeed),
    factorRow('Gust Delta', fmtKmh(gustDelta), factors.gustDelta),
    factorRow('Wave Height', fmtM(c.waveHeight), factors.waveHeight),
    factorRow('Wind Direction', `${Math.round(c.windDirection)}°`, factors.windDirection),
    factorRow('Weather', weatherLabel(c.weatherCode), factors.weather),
  ];

  return buildScore(overall, factors, warnings, breakdown);
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

  const breakdown: ScoreFactor[] = [
    factorRow('Wind Speed', fmtKmh(c.windSpeed), factors.windSpeed),
    factorRow('Wave Height', fmtM(c.waveHeight), factors.waveHeight),
    factorRow('Visibility', fmtNm(visNm), factors.visibility),
    factorRow('Pressure', c.pressure !== undefined ? `${Math.round(c.pressure)} hPa` : '—', factors.pressure),
    factorRow('Gust Safety', `${fmtKmh(c.windGusts)} gusts`, factors.gustSafety),
    factorRow('Current', c.currentSpeed !== undefined ? fmtMs(c.currentSpeed) : '—', factors.currentSpeed),
  ];

  return buildScore(overall, factors, warnings, breakdown);
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

  const breakdown: ScoreFactor[] = [
    factorRow('Visibility', `${Math.round((c.visibility || 10000) / 1000)} km`, factors.visibility),
    factorRow('Wave Height', fmtM(c.waveHeight), factors.waveHeight),
    factorRow('Current', fmtMs(c.currentSpeed || 0), factors.currentSpeed),
    factorRow('Sea Temp', c.seaTemp !== undefined ? fmtC(c.seaTemp) : '—', factors.seaTemp),
    factorRow('Wind Speed', fmtKmh(c.windSpeed), factors.windSpeed),
  ];

  return buildScore(overall, factors, warnings, breakdown);
}

export function scoreBeachgoer(c: HourlyConditions): ActivityScore {
  const warnings: string[] = [];
  if (c.windSpeed > 25) warnings.push('Very windy — sand may blow');
  if (c.waveHeight > 1.5) warnings.push('Rough surf — swim with caution');
  if ((c.uvIndex || 0) > 8) warnings.push('Very high UV — wear sunscreen');
  if (c.weatherCode !== undefined && c.weatherCode >= 61) warnings.push('Rain expected');

  // Beachgoer ideal: calm wind, flat sea, warm air, sunny skies
  const factors: Record<string, number> = {
    windSpeed: sweetSpotScore(c.windSpeed, 0, 0, 15, 30),        // calm to light breeze ideal
    waveHeight: sweetSpotScore(c.waveHeight, 0, 0, 0.5, 1.5),   // flat to gentle surf
    weather: weatherBonus(c.weatherCode),                         // clear > overcast > rain
    uvIndex: c.uvIndex !== undefined
      ? sweetSpotScore(c.uvIndex, 0, 3, 7, 11)                   // moderate UV ideal — too low = cloudy, too high = burn risk
      : 75,
    seaTemp: c.seaTemp !== undefined
      ? sweetSpotScore(c.seaTemp, 16, 22, 30, 35)                // warm water for swimming
      : 70,
  };

  // Lightning override — beach is extremely dangerous
  if (c.weatherCode !== undefined && c.weatherCode >= 95) {
    factors.weather = 0;
    warnings.push('Thunderstorm — leave the beach immediately');
  }

  let overall = factors.weather * 0.30      // sunshine is king for beachgoers
    + factors.windSpeed * 0.25               // nobody likes sand in their eyes
    + factors.waveHeight * 0.15              // calm enough for a swim
    + factors.seaTemp * 0.15                 // warm enough to get in
    + factors.uvIndex * 0.15;                // not scorching

  // Nighttime override — beach-going is intrinsically a daylight activity.
  // If it's night, cap the score at "Poor" regardless of other factors.
  if (c.isDay === false) {
    overall = Math.min(overall, 10);
    factors.daylight = 0;
    warnings.unshift('Nighttime — no sun, limited visibility');
  } else {
    factors.daylight = 100;
  }

  const breakdown: ScoreFactor[] = [
    factorRow('Weather', weatherLabel(c.weatherCode), factors.weather),
    factorRow('Wind Speed', fmtKmh(c.windSpeed), factors.windSpeed),
    factorRow('Wave Height', fmtM(c.waveHeight), factors.waveHeight),
    factorRow('Sea Temp', c.seaTemp !== undefined ? fmtC(c.seaTemp) : '—', factors.seaTemp),
    factorRow('UV Index', c.uvIndex !== undefined ? String(Math.round(c.uvIndex)) : '—', factors.uvIndex),
    factorRow('Daylight', c.isDay === false ? 'Night' : 'Day', factors.daylight),
  ];

  return buildScore(overall, factors, warnings, breakdown);
}
