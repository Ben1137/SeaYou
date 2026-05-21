import { useState, useCallback } from 'react';
import { UserPreferences, DEFAULT_PREFERENCES, PREFERENCES_STORAGE_KEY, OLD_TO_NEW_PERSONA_MAP } from '@seame/core';

function loadPrefs(): UserPreferences {
  try {
    const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (raw) {
      const prefs: UserPreferences = { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) };
      // Migrate old flat persona → new hierarchical PersonaSelection
      if (prefs.persona && !prefs.personaSelection) {
        prefs.personaSelection = OLD_TO_NEW_PERSONA_MAP[prefs.persona] ?? null;
      }
      return prefs;
    }
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
