/**
 * preferencesStore.ts — AsyncStorage wrapper for UserPreferences (Mobile)
 *
 * Parallel to the web's localStorage-based implementation in
 * `packages/web/src/contexts/AlertContext.tsx`. Both read and write the same
 * `UserPreferences` shape defined in `@seame/core/types/preferences` and use
 * the same storage key (`PREFERENCES_STORAGE_KEY`) so mobile and web stay in
 * sync conceptually.
 *
 * Safe to call from anywhere in the mobile app — including the background
 * fetch task, which runs outside the React tree.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  UserPreferences,
  DEFAULT_PREFERENCES,
  PREFERENCES_STORAGE_KEY,
} from '@seame/core';

/**
 * Deep-merge stored preferences with defaults so older stored blobs missing
 * new keys (e.g. after we add a field to `UserPreferences`) still load cleanly.
 */
function mergeWithDefaults(partial: Partial<UserPreferences> | null): UserPreferences {
  if (!partial) return DEFAULT_PREFERENCES;
  return {
    ...DEFAULT_PREFERENCES,
    ...partial,
    alerts: {
      ...DEFAULT_PREFERENCES.alerts,
      ...(partial.alerts ?? {}),
    },
  };
}

/**
 * Load the user's persisted preferences from AsyncStorage.
 * Returns `DEFAULT_PREFERENCES` if nothing has been saved yet or if parsing fails.
 */
export async function getUserPreferences(): Promise<UserPreferences> {
  try {
    const raw = await AsyncStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return mergeWithDefaults(parsed);
  } catch (err) {
    console.warn('[preferencesStore] Failed to load preferences:', err);
    return DEFAULT_PREFERENCES;
  }
}

/**
 * Persist the given preferences to AsyncStorage.
 * Errors are logged but swallowed — callers should assume best-effort.
 */
export async function saveUserPreferences(prefs: UserPreferences): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(prefs));
  } catch (err) {
    console.warn('[preferencesStore] Failed to save preferences:', err);
  }
}

/**
 * Convenience helper: reset preferences to defaults (e.g. for a "Reset to defaults" button).
 */
export async function resetUserPreferences(): Promise<UserPreferences> {
  await saveUserPreferences(DEFAULT_PREFERENCES);
  return DEFAULT_PREFERENCES;
}
