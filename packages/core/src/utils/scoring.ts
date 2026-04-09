/**
 * Scoring utility functions — sweet-spot interpolation, unit converters, derived calculations.
 */

/**
 * Cosine-eased sweet-spot score.
 * Returns 100 when value is in [idealLow, idealHigh],
 * fades smoothly to 0 at min/max boundaries using cosine easing.
 */
export function sweetSpotScore(
  value: number,
  min: number,
  idealLow: number,
  idealHigh: number,
  max: number
): number {
  if (value <= min || value >= max) return 0;
  if (value >= idealLow && value <= idealHigh) return 100;

  if (value < idealLow) {
    const t = (value - min) / (idealLow - min);
    return (1 - Math.cos(t * Math.PI)) / 2 * 100;
  }
  // value > idealHigh
  const t = (max - value) / (max - idealHigh);
  return (1 - Math.cos(t * Math.PI)) / 2 * 100;
}

/** Convert km/h to Beaufort scale (0-12) */
export function toBeaufort(windKmh: number): number {
  const thresholds = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118];
  for (let i = 0; i < thresholds.length; i++) {
    if (windKmh < thresholds[i]) return i;
  }
  return 12;
}

/** Convert km/h to knots */
export function kmhToKnots(kmh: number): number {
  return kmh / 1.852;
}

/** 16-point compass direction from degrees */
export function getWindDirectionLabel(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const idx = Math.round(((deg % 360) + 360) % 360 / 22.5) % 16;
  return dirs[idx];
}

/** Wave steepness: H / (g * T^2 / (2 * PI)) */
export function waveSteepness(height: number, period: number): number {
  if (period <= 0) return 0;
  const wavelength = (9.81 * period * period) / (2 * Math.PI);
  return wavelength > 0 ? height / wavelength : 0;
}

/** Chop index: ratio of wind-wave height to total wave energy (0 = clean swell, 1 = pure chop) */
export function chopIndex(windWaveH: number, swellH: number): number {
  const total = windWaveH + swellH;
  if (total <= 0) return 0;
  return windWaveH / total;
}

/** Map a 0-100 score to a human label and Tailwind color class */
export function scoreToLabel(score: number): { label: string; color: string } {
  if (score >= 90) return { label: 'Epic', color: 'text-purple-400' };
  if (score >= 70) return { label: 'Good', color: 'text-green-400' };
  if (score >= 50) return { label: 'Fair', color: 'text-blue-400' };
  if (score >= 30) return { label: 'Poor', color: 'text-white/60' };
  return { label: 'Dangerous', color: 'text-red-400' };
}

/** Weather penalty: returns 0-100 where 100 = clear, 0 = severe storm */
export function weatherBonus(code: number | undefined): number {
  if (code === undefined) return 80;
  if (code <= 3) return 100;   // clear to overcast
  if (code <= 48) return 70;   // fog
  if (code <= 67) return 40;   // drizzle/rain
  if (code <= 77) return 30;   // snow
  if (code <= 82) return 35;   // rain showers
  if (code >= 95) return 0;    // thunderstorm
  return 50;
}

/** Gust safety score: 100 when gusts ≈ sustained, drops as ratio increases */
export function gustSafetyScore(windSpeed: number, windGusts: number): number {
  if (windSpeed <= 0) return 100;
  const ratio = windGusts / windSpeed;
  if (ratio <= 1.2) return 100;
  if (ratio >= 2.0) return 0;
  return Math.round((2.0 - ratio) / 0.8 * 100);
}
