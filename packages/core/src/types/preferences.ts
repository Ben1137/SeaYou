/**
 * preferences.ts — Cross-platform user preferences types
 *
 * Defines a single source of truth for user settings that
 * works across Web (localStorage), Mobile (AsyncStorage),
 * and Watch platforms.
 */

import { ActivityPersona } from './scoring';

// ─── Saved location shape (lightweight — stored inside preferences) ───

export interface SavedLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

// ─── Onboarding persona (simplified top-level identity) ───

export type OnboardingPersona = 'mariner' | 'surfer' | 'beachgoer' | 'diver';

// ─── Subscription tier ───

export type SubscriptionTier = 'free' | 'premium';


// ─── Persisted User Preferences ───

export interface UserPreferences {
  /** Primary activity persona for scoring, hype alerts, and push targeting */
  primaryPersona: ActivityPersona;

  /** Onboarding persona — null until the user completes first-time onboarding */
  persona: OnboardingPersona | null;

  /** Subscription tier — defaults to 'free', unlocked via purchase */
  subscriptionTier: SubscriptionTier;

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
    /** Whether real tsunami push notifications are enabled (safety-critical) */
    tsunamiAlertsEnabled: boolean;
  };

  /** Minimum activity score (0-100) to trigger push notification */
  minScore: number;

  /** How many hours in advance to scan for best windows */
  notifyHoursInAdvance: number;

  /** User's favorite locations — synced across devices via Supabase */
  favoriteLocations: SavedLocation[];

  /** Most recent search selections (max 3, newest first) */
  recentSearches: SavedLocation[];

  /** Whether the user has completed the post-onboarding app tour */
  hasCompletedTour: boolean;

  /**
   * OneSignal Player (Subscription) ID. Captured on the client right after
   * the user grants push permission and written here by AlertContext.
   * The `daily-surf-report` Edge Function reads this to target the user.
   * Null until the user has granted permission at least once.
   */
  onesignal_player_id: string | null;

  /**
   * Opt-in for the daily surf-report push notification. Defaults to `true`
   * — we only withhold pushes when the user has explicitly toggled the
   * "Daily Surf Report" setting off. The Edge Function filters on
   * `push_opt_in !== false` so missing-key users still receive pushes.
   */
  push_opt_in: boolean;

  /**
   * "Home" latitude used as the forecast anchor for the `daily-surf-report`
   * Edge Function. Captured alongside the OneSignal Player ID from the
   * user's currently active location (or first recent/favorite fallback).
   * Null until we have successfully captured a push registration.
   */
  home_lat: number | null;

  /** "Home" longitude — see `home_lat`. */
  home_lon: number | null;

  /**
   * User's preferred Open-Meteo weather model.
   * undefined = auto (geo-based best match via getModelForLocation).
   */
  selectedModel?: string;
}

// ─── Defaults ───

export const DEFAULT_PREFERENCES: UserPreferences = {
  primaryPersona: ActivityPersona.WAVE_SURFER,
  persona: null,
  subscriptionTier: 'free',
  alerts: {
    waveHeightThreshold: 2.0,
    windSpeedThreshold: 40,
    highWavesEnabled: true,
    strongWindsEnabled: true,
    tsunamiWarningEnabled: false,
    tsunamiAlertsEnabled: true,
  },
  minScore: 70,
  notifyHoursInAdvance: 6,
  favoriteLocations: [],
  recentSearches: [],
  hasCompletedTour: false,
  onesignal_player_id: null,
  push_opt_in: true,
  home_lat: null,
  home_lon: null,
};

/** Storage key — same across platforms for consistency */
export const PREFERENCES_STORAGE_KEY = 'seayou_user_preferences';
