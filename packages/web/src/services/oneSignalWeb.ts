/**
 * oneSignalWeb.ts — Real OneSignal Web SDK integration (Phase 4)
 *
 * This file lives in packages/web because react-onesignal is a web-only dependency.
 * Core's NotificationService handles platform-agnostic scoring logic;
 * this module handles browser-specific OneSignal SDK calls.
 */

import OneSignal from 'react-onesignal';
import type { UserProfile } from '@seame/core';

let initialized = false;

/**
 * Initialize the OneSignal Web SDK.
 * Call once at app startup (e.g. in App.tsx useEffect).
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function initOneSignalWeb(appId?: string): Promise<void> {
  if (initialized) {
    console.log('[OneSignalWeb] Already initialized, skipping');
    return;
  }

  const id = appId || (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_ONESIGNAL_APP_ID;
  if (!id || id === 'YOUR_ONESIGNAL_APP_ID') {
    console.warn(
      '[OneSignalWeb] No OneSignal App ID configured. Set VITE_ONESIGNAL_APP_ID in .env to enable push notifications.'
    );
    return;
  }

  try {
    await OneSignal.init({
      appId: id,
      allowLocalhostAsSecureOrigin: true,
    });
    initialized = true;
    console.log('[OneSignalWeb] Initialized successfully with appId:', id);
  } catch (err) {
    console.error('[OneSignalWeb] Initialization failed:', err);
  }
}

/**
 * Request push notification permission from the browser.
 * Returns true if the user granted permission.
 */
export async function requestPushPermission(): Promise<boolean> {
  if (!initialized) {
    console.warn('[OneSignalWeb] Not initialized — call initOneSignalWeb() first');
    // Fallback to native Notification API for testing
    if ('Notification' in window) {
      const result = await Notification.requestPermission();
      console.log('[OneSignalWeb] Fallback Notification.requestPermission():', result);
      return result === 'granted';
    }
    return false;
  }

  try {
    await OneSignal.Notifications.requestPermission();
    const granted = OneSignal.Notifications.permission;
    console.log('[OneSignalWeb] Permission result:', granted);
    return granted;
  } catch (err) {
    console.error('[OneSignalWeb] Permission request failed:', err);
    return false;
  }
}

/**
 * Register a user profile with OneSignal via tags for segmented push targeting.
 */
export function registerUserTags(profile: UserProfile): void {
  if (!initialized) {
    console.warn('[OneSignalWeb] Not initialized — tags will not be applied');
    return;
  }

  try {
    OneSignal.User.addTag('persona', profile.userType);
    OneSignal.User.addTag('userId', profile.id);
    OneSignal.User.addTag('minScore', String(profile.notificationThresholds.minScore));
    OneSignal.User.addTag(
      'notifyHours',
      String(profile.notificationThresholds.notifyHoursInAdvance)
    );

    // Tag favorite spots (up to 5)
    const spotTags: Record<string, string> = {};
    profile.favoriteSpots.slice(0, 5).forEach((spot, i) => {
      spotTags[`spot_${i}_lat`] = spot.lat.toFixed(4);
      spotTags[`spot_${i}_lon`] = spot.lon.toFixed(4);
      spotTags[`spot_${i}_name`] = spot.name;
    });
    OneSignal.User.addTags(spotTags);

    console.log('[OneSignalWeb] User tags registered:', profile.id, profile.userType);
  } catch (err) {
    console.error('[OneSignalWeb] Failed to set user tags:', err);
  }
}

/**
 * Check if OneSignal is initialized and permission is granted.
 */
export function isNotificationReady(): boolean {
  if (!initialized) return false;
  try {
    return OneSignal.Notifications.permission;
  } catch {
    return false;
  }
}
