/**
 * NotificationService.ts — OneSignal Push Notification Foundation (Phase 4)
 *
 * Provides a skeleton for:
 *  1. Initializing the OneSignal SDK (web + mobile)
 *  2. Registering user profiles with persona-based tags
 *  3. Checking forecast data against user thresholds and triggering local alerts
 *
 * Actual OneSignal SDK calls are stubbed — replace with real SDK when
 * @onesignal/react-native and onesignal-web-sdk are installed.
 */

import {
  ActivityPersona,
  UserProfile,
  MarineWeatherData,
  ActivityScore,
} from '../types';
import { scoreActivity } from '../scoring/scoreActivity';
import { extractHourlyConditions } from '../scoring/extractConditions';

// ─── OneSignal Stub (replace with real SDK imports) ───

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

/** Placeholder — will be replaced by the real OneSignal global */
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

// ─── Alert Result Type ───

export interface ConditionAlert {
  persona: ActivityPersona;
  hourIndex: number;
  time: string;
  score: ActivityScore;
}

// ─── Service Functions ───

/**
 * Initialize OneSignal SDK.
 * Call once at app startup (e.g. in App.tsx or _app.tsx).
 */
export function initOneSignal(appId?: string): void {
  const id = appId || 'YOUR_ONESIGNAL_APP_ID';
  OneSignal.init({ appId: id });
  console.log('[NotificationService] OneSignal initialized with appId:', id);
}

/**
 * Register a user profile with OneSignal via tags.
 * Tags allow segmented push targeting by persona and favorite spots.
 */
export function registerUser(profile: UserProfile): void {
  // Tag the user's persona
  OneSignal.User.addTag('persona', profile.userType);
  OneSignal.User.addTag('userId', profile.id);
  OneSignal.User.addTag('minScore', String(profile.notificationThresholds.minScore));
  OneSignal.User.addTag('notifyHours', String(profile.notificationThresholds.notifyHoursInAdvance));

  // Tag favorite spots (up to 5 for OneSignal tag limits)
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
 * Request push notification permission from the browser/OS.
 * Returns true if granted.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  return OneSignal.Notifications.requestPermission();
}

/**
 * Check upcoming forecast against user thresholds and return matching alerts.
 * This runs client-side — for production, move scoring to a server-side cron.
 *
 * @param forecastData - Full marine weather data with hourly arrays
 * @param profile - User profile with persona and thresholds
 * @returns Array of alerts for hours exceeding the user's minScore
 */
export function checkAndTriggerLocalAlerts(
  forecastData: MarineWeatherData,
  profile: UserProfile,
): ConditionAlert[] {
  const { minScore, notifyHoursInAdvance } = profile.notificationThresholds;
  const totalHours = forecastData.hourly?.time?.length ?? 0;
  const alerts: ConditionAlert[] = [];

  // Find current hour index
  const now = Date.now();
  let currentIdx = 0;
  let minDiff = Infinity;
  forecastData.hourly.time.forEach((t, i) => {
    const diff = Math.abs(now - new Date(t).getTime());
    if (diff < minDiff) { minDiff = diff; currentIdx = i; }
  });

  const endIdx = Math.min(currentIdx + notifyHoursInAdvance, totalHours);

  // Determine which personas to check
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
        console.log(
          `[NotificationService] Alert: ${persona} score ${score.overall} at ${timeStr} (threshold: ${minScore})`
        );
      }
    }
  }

  if (alerts.length === 0) {
    console.log(`[NotificationService] No windows found above ${minScore} in next ${notifyHoursInAdvance}h`);
  }

  return alerts;
}
