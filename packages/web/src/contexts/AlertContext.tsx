import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import {
  ActivityPersona,
  UserPreferences,
  DEFAULT_PREFERENCES,
  PREFERENCES_STORAGE_KEY,
  SavedLocation,
  fetchPreferences,
  upsertPreferences,
  subscribeToPreferences,
  mergePreferences,
} from '@seame/core';
import type { OnboardingPersona, SubscriptionTier } from '@seame/core';
import { registerUserTags } from '../services/oneSignalWeb';
import { useAuth } from './AuthContext';

// ─── Legacy shape kept for backward compat with AlertConfigModal + Dashboard ───

export interface AlertThresholds {
  waveHeightThreshold: number;
  windSpeedThreshold: number;
  highWavesEnabled: boolean;
  strongWindsEnabled: boolean;
  tsunamiWarningEnabled: boolean;
  tsunamiAlertsEnabled: boolean;
}

interface AlertContextType {
  /** Full preferences object (persona + alerts + scoring) */
  preferences: UserPreferences;

  /** Legacy convenience accessor for threshold values */
  thresholds: AlertThresholds;

  /** Activity persona (detailed — for scoring) */
  primaryPersona: ActivityPersona;
  setPrimaryPersona: (persona: ActivityPersona) => void;

  /** Onboarding persona (simplified — set during first-time flow) */
  persona: OnboardingPersona | null;
  setPersona: (persona: OnboardingPersona) => void;

  /** Subscription tier */
  subscriptionTier: SubscriptionTier;
  setSubscriptionTier: (tier: SubscriptionTier) => void;

  /** Threshold setters */
  setWaveThreshold: (value: number) => void;
  setWindThreshold: (value: number) => void;
  setMinScore: (value: number) => void;
  setNotifyHours: (value: number) => void;
  toggleHighWaves: () => void;
  toggleStrongWinds: () => void;
  toggleTsunamiWarning: () => void;
  toggleTsunamiAlerts: () => void;

  /** Saved locations */
  favoriteLocations: SavedLocation[];
  recentSearches: SavedLocation[];
  addFavorite: (loc: SavedLocation) => void;
  removeFavorite: (id: string) => void;
  isFavorite: (id: string) => boolean;
  addRecentSearch: (loc: SavedLocation) => void;

  /** Alert banner dismiss state (session-only) */
  isDismissed: boolean;
  dismiss: () => void;
  resetDismiss: () => void;

  /** Cloud sync status (informational) */
  cloudSyncStatus: 'idle' | 'syncing' | 'synced' | 'error';
  cloudSyncError: string | null;
}

// ─── Persistence helpers (localStorage — always used as offline fallback) ───

const LOCAL_UPDATED_AT_KEY = 'seayou_user_preferences_updated_at';

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
        persona: parsed.persona ?? null,
        subscriptionTier: parsed.subscriptionTier ?? 'free',
        favoriteLocations: parsed.favoriteLocations ?? [],
        recentSearches: parsed.recentSearches ?? [],
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
          tsunamiAlertsEnabled: old.tsunamiAlertsEnabled ?? DEFAULT_PREFERENCES.alerts.tsunamiAlertsEnabled,
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

function persistPreferences(prefs: UserPreferences, updatedAt?: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(prefs));
    if (updatedAt) {
      localStorage.setItem(LOCAL_UPDATED_AT_KEY, updatedAt);
    }
  } catch {
    // Ignore storage errors
  }
}

function loadLocalUpdatedAt(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(LOCAL_UPDATED_AT_KEY);
  } catch {
    return null;
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
  const { user, isConfigured: authConfigured } = useAuth();

  const [preferences, setPreferences] = useState<UserPreferences>(loadPreferences);
  const [isDismissed, setIsDismissed] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(null);

  // Track whether the current in-memory preferences have already been
  // reconciled with the cloud, so we don't thrash upsert on hydration.
  const hasHydratedFromCloud = useRef(false);
  // Suppresses the auto-upsert effect when we apply prefs from the cloud
  // (initial fetch or realtime push).
  const suppressUpsertRef = useRef(false);

  // ─── Hydrate from cloud on sign-in ───
  useEffect(() => {
    if (!authConfigured || !user) {
      // Signed out — reset hydration flag so next sign-in re-fetches
      hasHydratedFromCloud.current = false;
      setCloudSyncStatus('idle');
      setCloudSyncError(null);
      return;
    }

    let cancelled = false;
    setCloudSyncStatus('syncing');
    setCloudSyncError(null);

    (async () => {
      const result = await fetchPreferences(user.id);
      if (cancelled) return;

      if (result.error) {
        console.warn('[AlertContext] Cloud fetch failed:', result.error);
        setCloudSyncStatus('error');
        setCloudSyncError(result.error);
        hasHydratedFromCloud.current = true;
        return;
      }

      const localUpdatedAt = loadLocalUpdatedAt();
      const merged = mergePreferences(
        preferences,
        result.preferences,
        localUpdatedAt,
        result.updatedAt
      );

      // Apply merged result locally (without re-triggering upsert)
      suppressUpsertRef.current = true;
      setPreferences(merged);
      persistPreferences(merged, result.updatedAt ?? new Date().toISOString());
      syncToOneSignal(merged);

      // If cloud was empty (first-time sign-in), push local up so future
      // devices start from the same point.
      if (!result.preferences) {
        const { error, updatedAt } = await upsertPreferences(user.id, merged);
        if (!cancelled) {
          if (error) {
            setCloudSyncStatus('error');
            setCloudSyncError(error);
          } else {
            if (updatedAt) persistPreferences(merged, updatedAt);
            setCloudSyncStatus('synced');
          }
        }
      } else {
        setCloudSyncStatus('synced');
      }

      hasHydratedFromCloud.current = true;
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authConfigured]);

  // ─── Subscribe to realtime cloud updates (cross-device sync) ───
  useEffect(() => {
    if (!authConfigured || !user) return;

    const unsubscribe = subscribeToPreferences(user.id, (cloudPrefs) => {
      if (!cloudPrefs) return;
      // Apply without re-upserting
      suppressUpsertRef.current = true;
      setPreferences({
        ...DEFAULT_PREFERENCES,
        ...cloudPrefs,
        alerts: { ...DEFAULT_PREFERENCES.alerts, ...(cloudPrefs.alerts ?? {}) },
        persona: cloudPrefs.persona ?? null,
        subscriptionTier: cloudPrefs.subscriptionTier ?? 'free',
        favoriteLocations: cloudPrefs.favoriteLocations ?? [],
        recentSearches: cloudPrefs.recentSearches ?? [],
      });
      persistPreferences(cloudPrefs, new Date().toISOString());
      syncToOneSignal(cloudPrefs);
      setCloudSyncStatus('synced');
    });

    return () => {
      unsubscribe();
    };
  }, [user?.id, authConfigured]);

  // ─── Auto-upsert to cloud on every preferences change (signed-in only) ───
  useEffect(() => {
    if (suppressUpsertRef.current) {
      // This update came from the cloud (hydration or realtime) — skip
      suppressUpsertRef.current = false;
      return;
    }
    if (!authConfigured || !user || !hasHydratedFromCloud.current) return;

    let cancelled = false;
    setCloudSyncStatus('syncing');

    (async () => {
      const { error, updatedAt } = await upsertPreferences(user.id, preferences);
      if (cancelled) return;
      if (error) {
        console.warn('[AlertContext] Cloud upsert failed:', error);
        setCloudSyncStatus('error');
        setCloudSyncError(error);
      } else {
        if (updatedAt) persistPreferences(preferences, updatedAt);
        setCloudSyncStatus('synced');
        setCloudSyncError(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [preferences, user?.id, authConfigured]);

  const update = useCallback((fn: (prev: UserPreferences) => UserPreferences) => {
    setPreferences((prev) => {
      const next = fn(prev);
      const nowIso = new Date().toISOString();
      persistPreferences(next, nowIso);
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

  // ─── Onboarding persona ───

  const setPersona = useCallback((persona: OnboardingPersona) => {
    update((p) => ({ ...p, persona }));
  }, [update]);

  // ─── Subscription tier ───

  const setSubscriptionTier = useCallback((tier: SubscriptionTier) => {
    update((p) => ({ ...p, subscriptionTier: tier }));
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

  const toggleTsunamiAlerts = useCallback(() => {
    update((p) => ({ ...p, alerts: { ...p.alerts, tsunamiAlertsEnabled: !p.alerts.tsunamiAlertsEnabled } }));
  }, [update]);

  // ─── Saved locations ───

  const addFavorite = useCallback((loc: SavedLocation) => {
    update((p) => {
      if (p.favoriteLocations.some((f) => f.id === loc.id)) return p;
      return { ...p, favoriteLocations: [...p.favoriteLocations, loc] };
    });
  }, [update]);

  const removeFavorite = useCallback((id: string) => {
    update((p) => ({
      ...p,
      favoriteLocations: p.favoriteLocations.filter((f) => f.id !== id),
    }));
  }, [update]);

  const isFavorite = useCallback(
    (id: string) => preferences.favoriteLocations.some((f) => f.id === id),
    [preferences.favoriteLocations],
  );

  const addRecentSearch = useCallback((loc: SavedLocation) => {
    update((p) => {
      const filtered = p.recentSearches.filter((r) => r.id !== loc.id);
      return { ...p, recentSearches: [loc, ...filtered].slice(0, 3) };
    });
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
        persona: preferences.persona ?? null,
        setPersona,
        subscriptionTier: preferences.subscriptionTier ?? 'free',
        setSubscriptionTier,
        setWaveThreshold,
        setWindThreshold,
        setMinScore,
        setNotifyHours,
        toggleHighWaves,
        toggleStrongWinds,
        toggleTsunamiWarning,
        toggleTsunamiAlerts,
        favoriteLocations: preferences.favoriteLocations,
        recentSearches: preferences.recentSearches,
        addFavorite,
        removeFavorite,
        isFavorite,
        addRecentSearch,
        isDismissed,
        dismiss,
        resetDismiss,
        cloudSyncStatus,
        cloudSyncError,
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
