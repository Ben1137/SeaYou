export enum ActivityPersona {
  WAVE_SURFER    = 'wave_surfer',
  WIND_SURFER    = 'wind_surfer',
  KITE_SURFER    = 'kite_surfer',
  BOOGIE_BOARDER = 'boogie_boarder',
  SAILOR         = 'sailor',
  DIVER          = 'diver',
  BEACHGOER      = 'beachgoer',
}

export interface HourlyConditions {
  time: string;
  waveHeight: number;
  wavePeriod: number;
  swellHeight: number;
  swellPeriod: number;
  swellDirection: number;
  /** Secondary swell partition (model-dependent; undefined when unavailable) */
  secondarySwellHeight?: number;
  secondarySwellPeriod?: number;
  secondarySwellDirection?: number;
  windSpeed: number;
  windGusts: number;
  windDirection: number;
  windWaveHeight?: number;
  currentSpeed?: number;
  currentDirection?: number;
  seaTemp?: number;
  visibility?: number;
  uvIndex?: number;
  weatherCode?: number;
  pressure?: number;
  isDay?: boolean; // true = daylight hour, false = night
  /** Offshore compass bearing from bathymetry gradient (degrees [0,360)), or null/absent when unknown. */
  shoreNormalDeg?: number | null;
}

/**
 * A single, human-readable factor describing why an activity score landed
 * where it did. Consumed by the ScoreBreakdownModal to build the
 * "Explainable UI" list (green / gray / red rows).
 */
export interface ScoreFactor {
  /** Short label, e.g. "Wind Speed", "Wave Period". */
  label: string;
  /** Human-readable value with units, e.g. "18 km/h", "8.2 s", "Warm 24°C". */
  value: string;
  /**
   * Directional influence on the score:
   *   positive → helped (green)
   *   neutral  → middling (gray)
   *   negative → hurt    (red)
   */
  impact: 'positive' | 'neutral' | 'negative';
}

export interface ActivityScore {
  overall: number;
  label: string;
  color: string;
  factors: Record<string, number>;
  warnings: string[];
  /** Human-readable breakdown powering the Explainable UI modal. */
  breakdown: ScoreFactor[];
  /**
   * Safety hazard derived from wind direction + persona. Non-null only for kite/wind surfers
   * with offshore wind above minimum speed. Null = no hazard for this condition.
   */
  hazard?: { kind: 'offshore_wind'; label: string } | null;
}

export interface BestWindow {
  startIndex: number;
  endIndex: number;
  startTime: string;
  endTime: string;
  avgScore: number;
  peakScore: number;
  persona: ActivityPersona;
}

export interface ScoredHour {
  index: number;
  time: string;
  score: number;
  conditions: HourlyConditions;
}

// ─── Push Notification Types (Phase 4) ───

export interface FavoriteSpot {
  lat: number;
  lon: number;
  radiusKm: number;
  name: string;
}

export interface NotificationThresholds {
  /** Minimum activity score (0-100) to trigger an alert */
  minScore: number;
  /** How many hours in advance to check for upcoming windows */
  notifyHoursInAdvance: number;
}

export interface UserProfile {
  id: string;
  userType: ActivityPersona | 'multi';
  favoriteSpots: FavoriteSpot[];
  notificationThresholds: NotificationThresholds;
}
