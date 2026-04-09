/**
 * tsunamiBackgroundTask.ts — Background tsunami alert polling for SeaYou Mobile
 *
 * Uses Expo TaskManager + BackgroundFetch to periodically check GDACS feeds
 * even when the app is backgrounded or terminated.
 *
 * When a HIGH-risk tsunami event is detected near the user's last known
 * location, fires a local push notification with evacuation instructions.
 *
 * Phase 5 Mobile — Tsunami Alerts
 */

import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { fetchActiveTsunamis, checkTsunamiRisk } from '@seame/core';

// ─── Constants ───

export const TSUNAMI_TASK_NAME = 'BACKGROUND_TSUNAMI_FETCH';

/** Minimum interval between background fetches (15 minutes) */
const BACKGROUND_FETCH_INTERVAL = 15 * 60; // seconds

// ─── Notification Configuration ───

/**
 * Configure the notification handler for local notifications.
 * Must be called early in the app lifecycle (before any notifications fire).
 */
export function configureTsunamiNotifications(): void {
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
 * Define the background task with TaskManager.
 * IMPORTANT: This must be called at the module/top level (outside any component),
 * because TaskManager.defineTask registers the task globally for the JS runtime.
 */
TaskManager.defineTask(TSUNAMI_TASK_NAME, async () => {
  try {
    console.log('[TsunamiTask] Background fetch triggered');

    // 1. Get the user's last known location
    const location = await getLastKnownLocation();
    if (!location) {
      console.log('[TsunamiTask] No location available — skipping');
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const { latitude, longitude } = location;

    // 2. Fetch active events from GDACS
    const events = await fetchActiveTsunamis();
    if (events.length === 0) {
      console.log('[TsunamiTask] No active GDACS events');
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    console.log(`[TsunamiTask] ${events.length} GDACS events fetched`);

    // 3. Check proximity risk
    const risks = checkTsunamiRisk(latitude, longitude, events);
    if (risks.length === 0) {
      console.log('[TsunamiTask] No risks near user location');
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    console.log(`[TsunamiTask] ${risks.length} risks detected`);

    // 4. Fire local notification for HIGH risk events
    const highRisks = risks.filter((r) => r.riskLevel === 'HIGH');
    if (highRisks.length > 0) {
      const topRisk = highRisks[0];
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '\u26a0\ufe0f TSUNAMI WARNING',
          body: `${topRisk.event.title} \u2014 M${topRisk.event.magnitude.toFixed(1)} \u2014 ${Math.round(topRisk.distanceKm)} km away. Seek high ground immediately.`,
          data: {
            type: 'tsunami_alert',
            riskLevel: 'HIGH',
            eventId: topRisk.event.id,
          },
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.MAX,
        },
        trigger: null, // Immediate delivery
      });
      console.log('[TsunamiTask] HIGH risk notification fired');
    }

    // Also notify for MODERATE risks (less urgent)
    const moderateRisks = risks.filter((r) => r.riskLevel === 'MODERATE');
    if (moderateRisks.length > 0 && highRisks.length === 0) {
      const topMod = moderateRisks[0];
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '\ud83c\udf0a Tsunami Advisory',
          body: `${topMod.event.title} \u2014 M${topMod.event.magnitude.toFixed(1)} \u2014 ${Math.round(topMod.distanceKm)} km away. Stay alert.`,
          data: {
            type: 'tsunami_advisory',
            riskLevel: 'MODERATE',
            eventId: topMod.event.id,
          },
          sound: 'default',
        },
        trigger: null,
      });
      console.log('[TsunamiTask] MODERATE risk notification fired');
    }

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (err) {
    console.warn('[TsunamiTask] Background fetch failed:', err);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// ─── Task Registration ───

/**
 * Register the background fetch task with the OS.
 * Call once on app startup (after permissions are granted).
 *
 * - iOS: Actual interval is determined by the OS based on usage patterns.
 *        `minimumInterval` is only a hint.
 * - Android: `stopOnTerminate: false` + `startOnBoot: true` ensures the
 *        task survives app termination and device reboot.
 */
export async function registerTsunamiBackgroundTask(): Promise<void> {
  try {
    // Check if already registered
    const isRegistered = await TaskManager.isTaskRegisteredAsync(TSUNAMI_TASK_NAME);
    if (isRegistered) {
      console.log('[TsunamiTask] Already registered');
      return;
    }

    await BackgroundFetch.registerTaskAsync(TSUNAMI_TASK_NAME, {
      minimumInterval: BACKGROUND_FETCH_INTERVAL,
      stopOnTerminate: false,
      startOnBoot: true,
    });

    console.log('[TsunamiTask] Background task registered (interval: 15 min)');
  } catch (err) {
    console.warn('[TsunamiTask] Failed to register background task:', err);
  }
}

/**
 * Unregister the background task (e.g., user opts out of tsunami alerts).
 */
export async function unregisterTsunamiBackgroundTask(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(TSUNAMI_TASK_NAME);
    if (!isRegistered) return;

    await BackgroundFetch.unregisterTaskAsync(TSUNAMI_TASK_NAME);
    console.log('[TsunamiTask] Background task unregistered');
  } catch (err) {
    console.warn('[TsunamiTask] Failed to unregister:', err);
  }
}

// ─── Helpers ───

/**
 * Get the user's last known location without triggering a new GPS fix.
 * Falls back to a low-accuracy single reading if no cached position exists.
 */
async function getLastKnownLocation(): Promise<{ latitude: number; longitude: number } | null> {
  try {
    // Check if we have permission
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.log('[TsunamiTask] No location permission');
      return null;
    }

    // Try cached location first (fast, no GPS wake)
    const last = await Location.getLastKnownPositionAsync();
    if (last) {
      return { latitude: last.coords.latitude, longitude: last.coords.longitude };
    }

    // Fallback: low-accuracy single reading
    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Low,
    });
    return { latitude: current.coords.latitude, longitude: current.coords.longitude };
  } catch (err) {
    console.warn('[TsunamiTask] Location fetch failed:', err);
    return null;
  }
}
