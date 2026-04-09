/**
 * oneSignalMobile.ts — OneSignal React Native SDK wrapper for SeaYou Mobile
 *
 * Handles push notification initialization, permission requests, and user
 * tag registration. Uses the react-native-onesignal SDK (v5+).
 *
 * Phase 4 Mobile — Push Notifications
 */

import { OneSignal, LogLevel } from 'react-native-onesignal';

// ─── Constants ───

/**
 * OneSignal App ID — replace with your real App ID from the OneSignal dashboard.
 * In production, consider reading from expo-constants or app.config.js extras.
 */
const ONESIGNAL_APP_ID = 'YOUR_ONESIGNAL_APP_ID';

let initialized = false;

// ─── Initialization ───

/**
 * Initialize OneSignal SDK for React Native.
 * Call once on app startup (App.tsx useEffect).
 * Idempotent — safe to call multiple times.
 */
export function initOneSignalMobile(appId?: string): void {
  if (initialized) return;

  const id = appId || ONESIGNAL_APP_ID;
  if (!id || id === 'YOUR_ONESIGNAL_APP_ID') {
    console.warn('[OneSignalMobile] No valid App ID — skipping initialization');
    return;
  }

  try {
    // Enable verbose logging in development
    if (__DEV__) {
      OneSignal.Debug.setLogLevel(LogLevel.Verbose);
    }

    OneSignal.initialize(id);
    initialized = true;
    console.log('[OneSignalMobile] SDK initialized');
  } catch (err) {
    console.warn('[OneSignalMobile] Initialization failed:', err);
  }
}

// ─── Permission ───

/**
 * Request push notification permission from the user.
 * On iOS this shows the system permission dialog.
 * On Android 13+ this requests POST_NOTIFICATIONS.
 *
 * @returns true if permission granted, false otherwise
 */
export async function requestPushPermission(): Promise<boolean> {
  try {
    if (!initialized) {
      console.warn('[OneSignalMobile] Not initialized — cannot request permission');
      return false;
    }

    const granted = await OneSignal.Notifications.requestPermission(true);
    console.log(`[OneSignalMobile] Push permission ${granted ? 'granted' : 'denied'}`);
    return granted;
  } catch (err) {
    console.warn('[OneSignalMobile] Permission request failed:', err);
    return false;
  }
}

// ─── User Tags ───

/**
 * Register user tags with OneSignal for targeted push notifications.
 * Tags are used for segment-based notifications (e.g., persona, favorite spots).
 */
export function registerUserTags(tags: Record<string, string>): void {
  if (!initialized) return;

  try {
    OneSignal.User.addTags(tags);
    console.log('[OneSignalMobile] Tags registered:', Object.keys(tags));
  } catch (err) {
    console.warn('[OneSignalMobile] Failed to set tags:', err);
  }
}

// ─── Notification Listeners ───

/**
 * Register a handler for when notifications are received while the app is in the foreground.
 * Call once during app setup.
 */
export function onForegroundNotification(
  handler: (notification: { title?: string; body?: string; data?: Record<string, unknown> }) => void
): void {
  if (!initialized) return;

  OneSignal.Notifications.addEventListener('foregroundWillDisplay', (event: any) => {
    const notification = event.getNotification();
    handler({
      title: notification.title ?? undefined,
      body: notification.body ?? undefined,
      data: (notification.additionalData as Record<string, unknown>) ?? undefined,
    });
    // Display the notification (don't silently swallow it)
    event.preventDefault();
    event.getNotification().display();
  });
}

/**
 * Register a handler for when the user taps a notification.
 */
export function onNotificationOpened(
  handler: (data?: Record<string, unknown>) => void
): void {
  if (!initialized) return;

  OneSignal.Notifications.addEventListener('click', (event: any) => {
    handler((event.notification.additionalData as Record<string, unknown>) ?? undefined);
  });
}

// ─── Status ───

/**
 * Check if the SDK is initialized and push permission is granted.
 */
export function isNotificationReady(): boolean {
  if (!initialized) return false;
  return OneSignal.Notifications.hasPermission();
}
