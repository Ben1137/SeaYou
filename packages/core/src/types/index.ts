
export * from './navigation';

export enum ViewState {
  DASHBOARD = 'DASHBOARD',
  MAP = 'MAP',
  ATMOSPHERE = 'ATMOSPHERE',
  ROUTE_PLANNING = 'ROUTE_PLANNING',
  COASTS_MARINAS = 'COASTS_MARINAS'
}

export interface AlertConfig {
  waveHeightThreshold: number;
  windSpeedThreshold: number;
  swellHeightThreshold: number;
  simulateTsunami: boolean;
}

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface Location {
  id: number;
  name: string;
  lat: number;
  lng: number;
  country?: string;
  admin1?: string;
}

export interface MarineWeatherHourly {
  time: string[];
  wave_height: number[];
  wave_direction: number[];
  wave_period: number[];
  wind_speed_10m: number[];
  wind_direction_10m: number[];
  wind_gusts_10m: number[]; 
  swell_wave_height: number[];
  swell_wave_direction: number[];
  swell_wave_period: number[];
  pressure_msl?: number[]; 
  visibility?: number[];
  relative_humidity_2m?: number[];
  sea_surface_temperature?: number[];
  uv_index?: number[];
  weather_code?: number[];
}

export interface MarineWeatherDaily {
  time: string[];
  wave_height_max: number[];
  wind_speed_10m_max: number[];
  wind_direction_10m_dominant: number[];
  swell_wave_height_max: number[];
  swell_wave_direction_dominant: number[];
  wave_period_max: number[];
  sunrise: string[];
  sunset: string[];
}

export interface TideEvent {
  time: string;
  height: number;
  type: 'HIGH' | 'LOW';
}

export interface TideData {
  currentHeight: number;
  rising: boolean;
  nextHigh: TideEvent;
  nextLow: TideEvent;
  hourly: { time: string; height: number }[];
}

export interface GeneralWeather {
  temperature: number;
  feelsLike: number;
  humidity: number;
  uvIndex: number;
  weatherCode: number;
  weatherDescription: string;
  isDay: boolean;
  sunrise: string;
  sunset: string;
  moonPhase: string;
  moonIllumination: number; 
  nextFullMoon: string; // Calculated date of next full moon
  moonrise: string; 
  moonset: string; 
  pressure: number; 
  visibility: number; 
  dailyForecast: {
    time: string;
    code: number;
    tempMax: number;
    tempMin: number;
  }[];
}

export interface MarineWeatherData {
  latitude: number;
  longitude: number;
  hourly: MarineWeatherHourly;
  daily: MarineWeatherDaily;
  hourly_units: {
    wave_height: string;
    wind_speed_10m: string;
    swell_wave_height: string;
    wave_period?: string;
    swell_wave_period?: string;
  };
  current?: {
    windSpeed: number;
    windGusts: number;
    windDirection: number;
    seaTemperature?: number;
    waveHeight?: number;
    wavePeriod?: number;
    swellHeight?: number;
    swellDirection?: number;
    swellPeriod?: number;
    pressure?: number;
    visibility?: number;
    seaLevel?: number;
    uvIndex?: number;
  };
  tides?: TideData;
  general?: GeneralWeather;
}

export interface PointForecast {
  lat: number;
  lng: number;
  waveHeight: number;
  wavePeriod?: number; // Significant wave period
  windSpeed: number;
  windDirection: number;
  swellHeight: number;
  swellDirection: number;
  temp: number;
  weatherCode: number;
  weatherDesc: string;
  // New Fields
  currentSpeed?: number;
  currentDirection?: number;
  windWaveHeight?: number;
  windWaveDirection?: number;
  windWavePeriod?: number;
  swellPeriod?: number;
}

export interface DetailedPointForecast {
  lat: number;
  lng: number;
  hourly: {
    time: string[];
    waveHeight: number[];
    windSpeed: number[];
    windDirection: number[];
    swellHeight: number[];
    currentSpeed?: number[];
    currentDirection?: number[];
  };
}
