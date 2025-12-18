/**
 * TYPE DEFINITIONS FOR SEAYOU NAVIGATION FEATURES
 * Route Planning, Offline Navigation, and Coasts/Marinas
 */

// ============================================
// ROUTE PLANNING TYPES
// ============================================

export interface Waypoint {
  id: string;
  lat: number;
  lon: number;
  name: string;
  timestamp?: Date;
  type: 'start' | 'waypoint' | 'destination';
}

export interface Route {
  id: string;
  name: string;
  waypoints: Waypoint[];
  totalDistance: number; // nautical miles
  estimatedTime: number; // hours
  createdAt: Date;
  averageSpeed: number; // knots
}

// ============================================
// NAVIGATION TYPES
// ============================================

export interface NavigationState {
  currentPosition: { lat: number; lon: number };
  heading: number; // degrees (0-360)
  speed: number; // knots
  nextWaypoint: Waypoint | null;
  distanceToNext: number; // nautical miles
  bearingToNext: number; // degrees (0-360)
  etaToNext: number; // minutes
  progress: number; // percentage 0-100
}

export interface NavigationAlert {
  type:
    | 'waypoint-approaching'
    | 'waypoint-reached'
    | 'off-course'
    | 'destination-reached'
    | 'low-speed'
    | 'course-correction'
    | 'gps-error'
    | 'permission-denied';
  message: string;
  severity: 'info' | 'warning' | 'success' | 'error';
  timestamp: Date;
  autoClose?: boolean;
}

export interface OfflineNavigationConfig {
  updateIntervalMs: number;
  waypointThresholdNM: number;
  enableVoiceAlerts: boolean;
  enableVibration: boolean;
  speedSmoothingFactor: number;
}

// ============================================
// COASTS & MARINAS TYPES
// ============================================

export type MarinaType =
  | 'marina'
  | 'harbor'
  | 'anchorage'
  | 'beach'
  | 'port'
  | 'yacht_club';

export interface Marina {
  id: string;
  name: string;
  lat: number;
  lon: number;
  type: MarinaType;
  distance: number; // nautical miles from current position
  bearing: number; // degrees
  amenities: string[];
  phone?: string;
  website?: string;
  email?: string;
  description?: string;
  rating?: number; // 0-5
  facilities: MarinaFacilities;
  vhf_channel?: string;
}

export interface MarinaFacilities {
  fuel?: boolean;
  water?: boolean;
  electricity?: boolean;
  wifi?: boolean;
  restaurant?: boolean;
  shower?: boolean;
  laundry?: boolean;
  repair?: boolean;
  pump_out?: boolean;
  security?: boolean;
}

export interface CoastSearchOptions {
  radius: number; // nautical miles
  types?: MarinaType[];
  amenities?: string[];
  minRating?: number;
  sortBy?: 'distance' | 'rating' | 'name';
}
