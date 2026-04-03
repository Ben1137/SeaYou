export enum ActivityPersona {
  WAVE_SURFER = 'wave_surfer',
  WIND_SURFER = 'wind_surfer',
  KITE_SURFER = 'kite_surfer',
  SAILOR = 'sailor',
  DIVER = 'diver',
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
