export enum ActivityPersona {
  WAVE_SURFER = 'wave_surfer',
  WIND_SURFER = 'wind_surfer',
  KITE_SURFER = 'kite_surfer',
  SAILOR = 'sailor',
  DIVER = 'diver',
  BEACHGOER = 'beachgoer',
}

export interface HourlyConditions {
  time: string;
  waveHeight: number;
  wavePeriod: number;
  swellHeight: number;
  swellPeriod: number;
  swellDirection: number;
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
}

export interface ActivityScore {
  overall: number;
  label: string;
  color: string;
  factors: Record<string, number>;
  warnings: string[];
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
