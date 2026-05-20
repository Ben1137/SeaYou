import { useState, useCallback } from 'react';
import { UserPreferences, DEFAULT_PREFERENCES, PREFERENCES_STORAGE_KEY } from '@seame/core';

function loadPrefs(): UserPreferences {
  try {
    const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (raw) return { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) };
  } catch {
    // ignore parse errors — fall through to default
  }
  return DEFAULT_PREFERENCES;
}

export function useUserPreferences() {
  const [preferences, setPreferencesState] = useState<UserPreferences>(loadPrefs);

  const setPreference = useCallback(<K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K],
  ) => {
    setPreferencesState(prev => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors (e.g. private browsing quota)
      }
      return next;
    });
  }, []);

  return { preferences, setPreference };
}
