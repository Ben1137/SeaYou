import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import {
  ActivityPersona,
  UserPreferences,
  DEFAULT_PREFERENCES,
  PREFERENCES_STORAGE_KEY,
} from '@seame/core';
import { registerUserTags } from '../services/oneSignalWeb';

// ─── Legacy shape kept for backward compat with AlertConfigModal + Dashboard ───

export interface AlertThresholds {
  waveHeightThreshold: number;
  windSpeedThreshold: number;
  highWavesEnabled: boolean;
  strongWindsEnabled: boolean;
  tsunamiWarningEnabled: boolean;
}

interface AlertContextType {
  /** Full preferences object (persona + alerts + scoring) */
  preferences: UserPreferences;

  /** Legacy convenience accessor for threshold values */
  thresholds: AlertThresholds;

  /** Persona */
  primaryPersona: ActivityPersona;
  setPrimaryPersona: (persona: ActivityPersona) => void;

  /** Threshold setters */
  setWaveThreshold: (value: number) => void;
  setWindThreshold: (value: number) => void;
  setMinScore: (value: number) => void;
  setNotifyHours: (value: number) => void;
  toggleHighWaves: () => void;
  toggleStrongWinds: () => void;
  toggleTsunamiWarning: () => void;

  /** Alert banner dismiss state (session-only) */
  isDismissed: boolean;
  dismiss: () => void;
  resetDismiss: () => void;
}

// ─── Persistence helpers ───

function loadPreferences(): UserPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES;
  try {
    const stored = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Deep merge with defaults to handle missing keys from older storage
      return {
        ...DEFAULT_PREFERENCES,
        ...parsed,
        alerts: { ...DEFAULT_PREFERENCES.alerts, ...(parsed.alerts ?? {}) },
      };
    }
    // Migrate from old storage key if it exists
    const legacy = localStorage.getItem('seayou_alert_thresholds');
    if (legacy) {
      const old = JSON.parse(legacy);
      const migrated: UserPreferences = {
        ...DEFAULT_PREFERENCES,
        alerts: {
          waveHeightThreshold: old.waveHeightThreshold ?? DEFAULT_PREFERENCES.alerts.waveHeightThreshold,
          windSpeedThreshold: old.windSpeedThreshold ?? DEFAULT_PREFERENCES.alerts.windSpeedThreshold,
          highWavesEnabled: old.highWavesEnabled ?? DEFAULT_PREFERENCES.alerts.highWavesEnabled,
          strongWindsEnabled: old.strongWindsEnabled ?? DEFAULT_PREFERENCES.alerts.strongWindsEnabled,
          tsunamiWarningEnabled: old.tsunamiWarningEnabled ?? DEFAULT_PREFERENCES.alerts.tsunamiWarningEnabled,
        },
      };
      persistPreferences(migrated);
      localStorage.removeItem('seayou_alert_thresholds'); // Clean up old key
      return migrated;
    }
  } catch {
    // Ignore parse errors
  }
  return DEFAULT_PREFERENCES;
}

function persistPreferences(prefs: UserPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Sync persona + thresholds to OneSignal tags for push targeting.
 */
function syncToOneSignal(prefs: UserPreferences): void {
  try {
    registerUserTags({
      id: 'web-user',
      userType: prefs.primaryPersona,
      favoriteSpots: [],
      notificationThresholds: {
        minScore: prefs.minScore,
        notifyHoursInAdvance: prefs.notifyHoursInAdvance,
      },
    });
  } catch {
    // Non-critical — SDK may not be initialized
  }
}

// ─── Context ───

export const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const AlertProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [preferences, setPreferences] = useState<UserPreferences>(loadPreferences);
  const [isDismissed, setIsDismissed] = useState(false);

  const update = useCallback((fn: (prev: UserPreferences) => UserPreferences) => {
    setPreferences((prev) => {
      const next = fn(prev);
      persistPreferences(next);
      setIsDismissed(false);
      return next;
    });
  }, []);

  // ─── Persona ───

  const setPrimaryPersona = useCallback((persona: ActivityPersona) => {
    update((p) => {
      const next = { ...p, primaryPersona: persona };
      syncToOneSignal(next);
      return next;
    });
  }, [update]);

  // ─── Alert thresholds ───

  const setWaveThreshold = useCallback((value: number) => {
    update((p) => ({ ...p, alerts: { ...p.alerts, waveHeightThreshold: value } }));
  }, [update]);

  const setWindThreshold = useCallback((value: number) => {
    update((p) => ({ ...p, alerts: { ...p.alerts, windSpeedThreshold: value } }));
  }, [update]);

  const setMinScore = useCallback((value: number) => {
    update((p) => ({ ...p, minScore: value }));
  }, [update]);

  const setNotifyHours = useCallback((value: number) => {
    update((p) => ({ ...p, notifyHoursInAdvance: value }));
  }, [update]);

  const toggleHighWaves = useCallback(() => {
    update((p) => ({ ...p, alerts: { ...p.alerts, highWavesEnabled: !p.alerts.highWavesEnabled } }));
  }, [update]);

  const toggleStrongWinds = useCallback(() => {
    update((p) => ({ ...p, alerts: { ...p.alerts, strongWindsEnabled: !p.alerts.strongWindsEnabled } }));
  }, [update]);

  const toggleTsunamiWarning = useCallback(() => {
    update((p) => ({ ...p, alerts: { ...p.alerts, tsunamiWarningEnabled: !p.alerts.tsunamiWarningEnabled } }));
  }, [update]);

  const dismiss = useCallback(() => setIsDismissed(true), []);
  const resetDismiss = useCallback(() => setIsDismissed(false), []);

  // Legacy thresholds adapter
  const thresholds: AlertThresholds = preferences.alerts;

  return (
    <AlertContext.Provider
      value={{
        preferences,
        thresholds,
        primaryPersona: preferences.primaryPersona,
        setPrimaryPersona,
        setWaveThreshold,
        setWindThreshold,
        setMinScore,
        setNotifyHours,
        toggleHighWaves,
        toggleStrongWinds,
        toggleTsunamiWarning,
        isDismissed,
        dismiss,
        resetDismiss,
      }}
    >
      {children}
    </AlertContext.Provider>
  );
};

export function useAlertConfig(): AlertContextType {
  const ctx = useContext(AlertContext);
  if (!ctx) {
    throw new Error('useAlertConfig must be used within an AlertProvider');
  }
  return ctx;
}
