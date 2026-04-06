/**
 * preferences.ts — Cross-platform user preferences types
 *
 * Defines a single source of truth for user settings that
 * works across Web (localStorage), Mobile (AsyncStorage),
 * and Watch platforms.
 */

import { ActivityPersona } from './scoring';

// ─── Persisted User Preferences ───

export interface UserPreferences {
  /** Primary activity persona for scoring, hype alerts, and push targeting */
  primaryPersona: ActivityPersona;

  /** Alert threshold configuration */
  alerts: {
    /** Wave height threshold in meters */
    waveHeightThreshold: number;
    /** Wind speed threshold in km/h */
    windSpeedThreshold: number;
    /** Whether high wave alerts are enabled */
    highWavesEnabled: boolean;
    /** Whether strong wind alerts are enabled */
    strongWindsEnabled: boolean;
    /** Whether tsunami simulation is enabled (dev/testing) */
    tsunamiWarningEnabled: boolean;
  };

  /** Minimum activity score (0-100) to trigger push notification */
  minScore: number;

  /** How many hours in advance to scan for best windows */
  notifyHoursInAdvance: number;
}

// ─── Defaults ───

export const DEFAULT_PREFERENCES: UserPreferences = {
  primaryPersona: ActivityPersona.WAVE_SURFER,
  alerts: {
    waveHeightThreshold: 2.0,
    windSpeedThreshold: 40,
    highWavesEnabled: true,
    strongWindsEnabled: true,
    tsunamiWarningEnabled: false,
  },
  minScore: 70,
  notifyHoursInAdvance: 6,
};

/** Storage key — same across platforms for consistency */
export const PREFERENCES_STORAGE_KEY = 'seayou_user_preferences';
