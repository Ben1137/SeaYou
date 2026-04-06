/**
 * backgroundFetchTask.ts — Unified background polling for SeaYou Mobile
 *
 * Combines two critical background jobs into a single Expo TaskManager task:
 *
 *   1. TSUNAMI ALERTS — Fetches GDACS feeds, checks proximity risk, fires
 *      immediate local notifications for HIGH/MODERATE risk events.
 *
 *   2. WEATHER HYPE ALERTS — Fetches marine forecast data, runs the scoring
 *      engine for the user's primary persona, and fires witty "1-hour warning"
 *      notifications when a best window is approaching. Also checks custom
 *      wave/wind thresholds.
 *
 * Uses Expo TaskManager + BackgroundFetch to run even when the app is
 * backgrounded or terminated.
 *
 * Phase 5+6 Mobile — Tsunami + Personalized Weather Alerts
 */

import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import {
  fetchActiveTsunamis,
  checkTsunamiRisk,
  fetchMarineWeather,
  ActivityPersona,
  checkBestWindowApproaching,
  checkCustomThresholds,
} from '@seame/core';
import { getUserPreferences } from '../utils/preferencesStore';

// ─── Constants ───

export const BACKGROUND_TASK_NAME = 'BACKGROUND_SEAYOU_FETCH';

/** Minimum interval between background fetches (15 minutes) */
const BACKGROUND_FETCH_INTERVAL = 15 * 60; // seconds

// ─── Notification Configuration ───

/**
 * Configure the notification handler for local notifications.
 * Must be called early in the app lifecycle (before any notifications fire).
 */
export function configureNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
      priority: Notifications.AndroidNotificationPriority.MAX,
    }),
  });
}

// ─── Background Task Definition ───

/**
 * IMPORTANT: TaskManager.defineTask must be at module top-level.
 * It registers the task globally for the JS runtime.
 */
TaskManager.defineTask(BACKGROUND_TASK_NAME, async () => {
  try {
    console.log('[BackgroundTask] Triggered');

    // 1. Get location
    const location = await getLastKnownLocation();
    if (!location) {
      console.log('[BackgroundTask] No location — skipping');
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // 2. Load the user's persisted preferences (persona + thresholds).
    //    Falls back to DEFAULT_PREFERENCES inside getUserPreferences().
    const prefs = await getUserPreferences();
    const userPersona: ActivityPersona = prefs.primaryPersona;
    console.log(
      `[BackgroundTask] Using persona=${userPersona}, waveThreshold=${prefs.alerts.waveHeightThreshold}m, windThreshold=${prefs.alerts.windSpeedThreshold}km/h`,
    );

    const { latitude, longitude } = location;
    let hasNewData = false;

    // ═══════════════════════════════════════════════════
    // Job 1: TSUNAMI CHECK
    // ═══════════════════════════════════════════════════
    try {
      const events = await fetchActiveTsunamis();
      if (events.length > 0) {
        const risks = checkTsunamiRisk(latitude, longitude, events);

        // HIGH risk → immediate warning
        const highRisks = risks.filter((r) => r.riskLevel === 'HIGH');
        if (highRisks.length > 0) {
          const top = highRisks[0];
          await Notifications.scheduleNotificationAsync({
            content: {
              title: '\u26a0\ufe0f TSUNAMI WARNING',
              body: `${top.event.title} \u2014 M${top.event.magnitude.toFixed(1)} \u2014 ${Math.round(top.distanceKm)} km away. Seek high ground immediately.`,
              data: { type: 'tsunami_alert', riskLevel: 'HIGH', eventId: top.event.id },
              sound: 'default',
              priority: Notifications.AndroidNotificationPriority.MAX,
            },
            trigger: null,
          });
          hasNewData = true;
        }

        // MODERATE risk (only if no HIGH)
        const modRisks = risks.filter((r) => r.riskLevel === 'MODERATE');
        if (modRisks.length > 0 && highRisks.length === 0) {
          const top = modRisks[0];
          await Notifications.scheduleNotificationAsync({
            content: {
              title: '\uD83C\uDF0A Tsunami Advisory',
              body: `${top.event.title} \u2014 M${top.event.magnitude.toFixed(1)} \u2014 ${Math.round(top.distanceKm)} km away. Stay alert.`,
              data: { type: 'tsunami_advisory', riskLevel: 'MODERATE', eventId: top.event.id },
              sound: 'default',
            },
            trigger: null,
          });
          hasNewData = true;
        }

        if (risks.length > 0) {
          console.log(`[BackgroundTask] Tsunami: ${risks.length} risks detected`);
        }
      }
    } catch (err) {
      console.warn('[BackgroundTask] Tsunami check failed:', err);
    }

    // ═══════════════════════════════════════════════════
    // Job 2: WEATHER HYPE ALERTS (driven by user preferences)
    // ═══════════════════════════════════════════════════
    try {
      const weatherData = await fetchMarineWeather(latitude, longitude);

      // --- 2a: Best Window "1-Hour Warning" ---
      // Uses the user's actual selected persona from AsyncStorage.
      const hype = checkBestWindowApproaching(weatherData, userPersona);
      if (hype) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: hype.message.title,
            body: hype.message.body,
            data: {
              type: 'hype_alert',
              persona: hype.persona,
              windowStart: hype.window.startTime,
              windowEnd: hype.window.endTime,
              avgScore: hype.window.avgScore,
            },
            sound: 'default',
          },
          trigger: null,
        });
        console.log(
          `[BackgroundTask] Hype alert fired: ${hype.persona} window in ${hype.minutesUntilStart} min (score: ${hype.window.avgScore})`,
        );
        hasNewData = true;
      }

      // --- 2b: Custom Threshold Check ---
      // Only pass thresholds the user has explicitly enabled — this lets the
      // user silence wave OR wind alerts independently from ProfileScreen.
      const userThresholds: { waveHeight?: number; windSpeed?: number } = {};
      if (prefs.alerts.highWavesEnabled) {
        userThresholds.waveHeight = prefs.alerts.waveHeightThreshold;
      }
      if (prefs.alerts.strongWindsEnabled) {
        userThresholds.windSpeed = prefs.alerts.windSpeedThreshold;
      }

      const threshold =
        Object.keys(userThresholds).length > 0
          ? checkCustomThresholds(weatherData, userThresholds)
          : null;
      if (threshold) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: threshold.message.title,
            body: threshold.message.body,
            data: {
              type: 'threshold_alert',
              time: threshold.time,
              waveHeight: threshold.conditions.waveHeight,
              windSpeed: threshold.conditions.windSpeed,
            },
            sound: 'default',
          },
          trigger: null,
        });
        console.log(`[BackgroundTask] Threshold alert fired at ${threshold.time}`);
        hasNewData = true;
      }
    } catch (err) {
      console.warn('[BackgroundTask] Weather hype check failed:', err);
    }

    return hasNewData
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (err) {
    console.warn('[BackgroundTask] Failed:', err);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// ─── Task Registration ───

/**
 * Register the unified background fetch task with the OS.
 *
 * - iOS: minimumInterval is a hint; OS schedules based on usage patterns
 * - Android: stopOnTerminate: false + startOnBoot: true for persistence
 */
export async function registerBackgroundTask(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK_NAME);
    if (isRegistered) {
      console.log('[BackgroundTask] Already registered');
      return;
    }

    await BackgroundFetch.registerTaskAsync(BACKGROUND_TASK_NAME, {
      minimumInterval: BACKGROUND_FETCH_INTERVAL,
      stopOnTerminate: false,
      startOnBoot: true,
    });

    console.log('[BackgroundTask] Registered (interval: 15 min)');
  } catch (err) {
    console.warn('[BackgroundTask] Registration failed:', err);
  }
}

/**
 * Unregister the background task.
 */
export async function unregisterBackgroundTask(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK_NAME);
    if (!isRegistered) return;

    await BackgroundFetch.unregisterTaskAsync(BACKGROUND_TASK_NAME);
    console.log('[BackgroundTask] Unregistered');
  } catch (err) {
    console.warn('[BackgroundTask] Unregister failed:', err);
  }
}

// ─── Helpers ───

async function getLastKnownLocation(): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.log('[BackgroundTask] No location permission');
      return null;
    }

    const last = await Location.getLastKnownPositionAsync();
    if (last) {
      return { latitude: last.coords.latitude, longitude: last.coords.longitude };
    }

    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Low,
    });
    return { latitude: current.coords.latitude, longitude: current.coords.longitude };
  } catch (err) {
    console.warn('[BackgroundTask] Location failed:', err);
    return null;
  }
}
