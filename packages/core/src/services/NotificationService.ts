/**
 * NotificationService.ts — Push Notification Engine (Phase 4 + Hype Alerts)
 *
 * Provides:
 *  1. OneSignal SDK stubs (replaced by real SDKs in web/mobile wrappers)
 *  2. User profile → OneSignal tag registration
 *  3. Forecast → threshold checking → alert generation
 *  4. Persona-based "hype" notification copy (witty 1-hour warnings)
 *  5. Best-window proximity detection for smart alerting
 *  6. Custom threshold matching for immediate condition alerts
 *
 * Platform-agnostic — web/mobile wrappers handle actual SDK calls.
 */

import {
  ActivityPersona,
  UserProfile,
  MarineWeatherData,
  ActivityScore,
  BestWindow,
  HourlyConditions,
} from '../types';
import { scoreActivity } from '../scoring/scoreActivity';
import { extractHourlyConditions } from '../scoring/extractConditions';
import { findBestWindow } from '../scoring/bestWindow';

// ─── OneSignal Stub (replaced by real SDK in platform wrappers) ───

interface OneSignalStub {
  init(config: { appId: string }): void;
  User: {
    addTag(key: string, value: string): void;
    addTags(tags: Record<string, string>): void;
    removeTag(key: string): void;
  };
  Notifications: {
    requestPermission(): Promise<boolean>;
  };
}

const OneSignal: OneSignalStub = {
  init: (_config) => {
    console.log('[NotificationService] OneSignal.init() stub — install SDK to activate');
  },
  User: {
    addTag: (key, value) => {
      console.log(`[NotificationService] OneSignal.User.addTag("${key}", "${value}") stub`);
    },
    addTags: (tags) => {
      console.log('[NotificationService] OneSignal.User.addTags() stub:', tags);
    },
    removeTag: (key) => {
      console.log(`[NotificationService] OneSignal.User.removeTag("${key}") stub`);
    },
  },
  Notifications: {
    requestPermission: async () => {
      console.log('[NotificationService] OneSignal.Notifications.requestPermission() stub');
      return false;
    },
  },
};

// ═════════════════════════════════════════════════════════════════
// ─── Persona "Hype" Notification Copy ───
// ═════════════════════════════════════════════════════════════════

/**
 * Witty, persona-specific push notification messages for upcoming windows.
 * Each persona has multiple variants — pick one at random for freshness.
 */
export const HYPE_MESSAGES: Record<ActivityPersona, { title: string; body: string }[]> = {
  [ActivityPersona.WAVE_SURFER]: [
    { title: '\uD83C\uDF0A Surf\u2019s Up in 1 Hour!', body: 'The best wave window is about to open... should I save a wave for you?' },
    { title: '\uD83C\uDFC4 Swell Alert!', body: 'Perfect sets rolling in soon. Wax up and get moving!' },
    { title: '\uD83C\uDF0A Waves Are Calling!', body: 'Epic swell window in 1 hour. Your board misses you.' },
  ],
  [ActivityPersona.WIND_SURFER]: [
    { title: '\uD83D\uDCA8 Wind\u2019s Hitting the Sweet Spot!', body: 'Perfect planing conditions in 1 hour! Time to rig up!' },
    { title: '\uD83C\uDF2C\uFE0F Steady Breeze Alert!', body: 'Consistent wind window opening soon. Your sail is waiting.' },
    { title: '\uD83D\uDCA8 Powered Up!', body: 'Wind is cranking to your sweet spot in 1 hour. Don\u2019t miss it!' },
  ],
  [ActivityPersona.KITE_SURFER]: [
    { title: '\uD83E\uDE81 Kite Weather Incoming!', body: 'Wind is hitting the sweet spot in an hour! Time to pump up and launch!' },
    { title: '\uD83D\uDCA8\uD83E\uDE81 Send It!', body: 'Perfect kite conditions in 1 hour. Consistent wind, low gusts. Let\u2019s fly!' },
    { title: '\uD83E\uDE81 Launch Window!', body: 'Steady onshore breeze opening up soon. Your kite is jealous of your couch.' },
  ],
  [ActivityPersona.SAILOR]: [
    { title: '\u26F5 Perfect Cruising Ahead!', body: 'Ideal sailing conditions in 1 hour. Steady winds, calm seas. All aboard!' },
    { title: '\u26F5 Fair Winds!', body: 'Beaufort 3-5 window opening soon. Time to cast off!' },
    { title: '\uD83E\uDDED Sailing Weather!', body: 'Smooth seas and steady breeze in 1 hour. Your boat is calling.' },
  ],
  [ActivityPersona.DIVER]: [
    { title: '\uD83E\uDD3F Crystal Clear!', body: 'Amazing visibility coming up in 1 hour. Grab your fins and mask!' },
    { title: '\uD83D\uDC20 Dive Window!', body: 'Calm surface, great viz, perfect temps in 1 hour. The reef is waiting.' },
    { title: '\uD83E\uDD3F Time to Dive!', body: 'Ultra-low currents and clear water in 1 hour. Don\u2019t forget your camera!' },
  ],
  [ActivityPersona.BEACHGOER]: [
    { title: '\uD83C\uDFD6\uFE0F Perfect Beach Day!', body: 'Sunny skies, calm sea, warm breeze in 1 hour. Grab your towel and sunscreen!' },
    { title: '\u2600\uFE0F Beach Weather Alert!', body: 'Golden hour vibes incoming! Flat water, blue skies. Time to hit the sand.' },
    { title: '\uD83C\uDFD6\uFE0F Sun\u2019s Out!', body: 'Ideal tanning and swimming conditions in 1 hour. Don\u2019t forget your SPF!' },
  ],
};

/**
 * Pick a random hype message for a given persona.
 */
export function getHypeMessage(persona: ActivityPersona): { title: string; body: string } {
  const messages = HYPE_MESSAGES[persona];
  return messages[Math.floor(Math.random() * messages.length)];
}

/**
 * Generate a custom threshold-exceeded notification message.
 */
export function getThresholdMessage(
  conditions: HourlyConditions,
  thresholds: { waveHeight?: number; windSpeed?: number },
): { title: string; body: string } | null {
  const parts: string[] = [];

  if (thresholds.waveHeight != null && conditions.waveHeight >= thresholds.waveHeight) {
    parts.push(`Waves at ${conditions.waveHeight.toFixed(1)}m`);
  }
  if (thresholds.windSpeed != null && conditions.windSpeed >= thresholds.windSpeed) {
    parts.push(`Wind at ${conditions.windSpeed.toFixed(0)} km/h`);
  }

  if (parts.length === 0) return null;

  return {
    title: '\uD83D\uDEA8 Conditions Matched!',
    body: `${parts.join(' \u2022 ')} right now \u2014 your custom threshold was triggered!`,
  };
}

// ═════════════════════════════════════════════════════════════════
// ─── Alert Result Types ───
// ═════════════════════════════════════════════════════════════════

export interface ConditionAlert {
  persona: ActivityPersona;
  hourIndex: number;
  time: string;
  score: ActivityScore;
}

export interface HypeAlert {
  type: 'best_window_approaching';
  persona: ActivityPersona;
  window: BestWindow;
  message: { title: string; body: string };
  minutesUntilStart: number;
}

export interface ThresholdAlert {
  type: 'threshold_exceeded';
  conditions: HourlyConditions;
  message: { title: string; body: string };
  time: string;
}

// ═════════════════════════════════════════════════════════════════
// ─── Service Functions ───
// ═════════════════════════════════════════════════════════════════

/**
 * Initialize OneSignal SDK (stub).
 */
export function initOneSignal(appId?: string): void {
  const id = appId || 'YOUR_ONESIGNAL_APP_ID';
  OneSignal.init({ appId: id });
  console.log('[NotificationService] OneSignal initialized with appId:', id);
}

/**
 * Register a user profile with OneSignal via tags.
 */
export function registerUser(profile: UserProfile): void {
  OneSignal.User.addTag('persona', profile.userType);
  OneSignal.User.addTag('userId', profile.id);
  OneSignal.User.addTag('minScore', String(profile.notificationThresholds.minScore));
  OneSignal.User.addTag('notifyHours', String(profile.notificationThresholds.notifyHoursInAdvance));

  const spotTags: Record<string, string> = {};
  profile.favoriteSpots.slice(0, 5).forEach((spot, i) => {
    spotTags[`spot_${i}_lat`] = spot.lat.toFixed(4);
    spotTags[`spot_${i}_lon`] = spot.lon.toFixed(4);
    spotTags[`spot_${i}_name`] = spot.name;
    spotTags[`spot_${i}_radius`] = String(spot.radiusKm);
  });
  OneSignal.User.addTags(spotTags);

  console.log('[NotificationService] User registered:', profile.id, profile.userType);
}

/**
 * Request push notification permission (stub).
 */
export async function requestNotificationPermission(): Promise<boolean> {
  return OneSignal.Notifications.requestPermission();
}

/**
 * Check upcoming forecast against user thresholds and return matching alerts.
 */
export function checkAndTriggerLocalAlerts(
  forecastData: MarineWeatherData,
  profile: UserProfile,
): ConditionAlert[] {
  const { minScore, notifyHoursInAdvance } = profile.notificationThresholds;
  const totalHours = forecastData.hourly?.time?.length ?? 0;
  const alerts: ConditionAlert[] = [];

  const now = Date.now();
  let currentIdx = 0;
  let minDiff = Infinity;
  forecastData.hourly.time.forEach((t, i) => {
    const diff = Math.abs(now - new Date(t).getTime());
    if (diff < minDiff) { minDiff = diff; currentIdx = i; }
  });

  const endIdx = Math.min(currentIdx + notifyHoursInAdvance, totalHours);
  const personas: ActivityPersona[] =
    profile.userType === 'multi'
      ? Object.values(ActivityPersona)
      : [profile.userType as ActivityPersona];

  for (let i = currentIdx; i < endIdx; i++) {
    const conditions = extractHourlyConditions(forecastData, i);
    for (const persona of personas) {
      const score = scoreActivity(persona, conditions);
      if (score.overall >= minScore) {
        const timeStr = forecastData.hourly.time[i] || `+${i - currentIdx}h`;
        alerts.push({ persona, hourIndex: i, time: timeStr, score });
      }
    }
  }

  return alerts;
}

// ═════════════════════════════════════════════════════════════════
// ─── Hype Alert Engine (1-Hour Best Window Warning) ───
// ═════════════════════════════════════════════════════════════════

/**
 * Check if a best window for the user's persona is starting within ~1 hour.
 * Returns a HypeAlert with witty copy if a window is approaching.
 *
 * @param forecastData - Full marine weather data
 * @param persona - User's primary activity persona
 * @param toleranceMinutes - How close to 1 hour to trigger (default: 15 min window)
 * @returns HypeAlert if window starts in 45-75 minutes, null otherwise
 */
export function checkBestWindowApproaching(
  forecastData: MarineWeatherData,
  persona: ActivityPersona,
  toleranceMinutes = 15,
): HypeAlert | null {
  const now = Date.now();

  // Find current hour index
  let currentIdx = 0;
  let minDiff = Infinity;
  forecastData.hourly.time.forEach((t, i) => {
    const diff = Math.abs(now - new Date(t).getTime());
    if (diff < minDiff) { minDiff = diff; currentIdx = i; }
  });

  const window = findBestWindow(forecastData, persona, { startHourIndex: currentIdx });
  if (!window) return null;

  const windowStartMs = new Date(window.startTime).getTime();
  const minutesUntil = (windowStartMs - now) / 60000;

  // Trigger if the window starts between (60 - tolerance) and (60 + tolerance) minutes
  const lowerBound = 60 - toleranceMinutes;
  const upperBound = 60 + toleranceMinutes;

  if (minutesUntil >= lowerBound && minutesUntil <= upperBound) {
    return {
      type: 'best_window_approaching',
      persona,
      window,
      message: getHypeMessage(persona),
      minutesUntilStart: Math.round(minutesUntil),
    };
  }

  return null;
}

// ═════════════════════════════════════════════════════════════════
// ─── Custom Threshold Matching ───
// ═════════════════════════════════════════════════════════════════

/**
 * Check the immediate next hour's conditions against custom user thresholds.
 * Returns a ThresholdAlert if any threshold is exceeded.
 *
 * @param forecastData - Full marine weather data
 * @param thresholds - User's custom thresholds (e.g., { waveHeight: 0.5, windSpeed: 20 })
 * @returns ThresholdAlert if conditions exceed thresholds, null otherwise
 */
export function checkCustomThresholds(
  forecastData: MarineWeatherData,
  thresholds: { waveHeight?: number; windSpeed?: number },
): ThresholdAlert | null {
  const now = Date.now();

  // Find next hour index (1 hour ahead)
  let nextIdx = 0;
  let minDiff = Infinity;
  forecastData.hourly.time.forEach((t, i) => {
    const targetTime = now + 60 * 60 * 1000; // 1 hour from now
    const diff = Math.abs(targetTime - new Date(t).getTime());
    if (diff < minDiff) { minDiff = diff; nextIdx = i; }
  });

  const conditions = extractHourlyConditions(forecastData, nextIdx);
  const message = getThresholdMessage(conditions, thresholds);

  if (!message) return null;

  return {
    type: 'threshold_exceeded',
    conditions,
    message,
    time: forecastData.hourly.time[nextIdx] || '',
  };
}
