import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface AlertThresholds {
  waveHeightThreshold: number;
  windSpeedThreshold: number;
  highWavesEnabled: boolean;
  strongWindsEnabled: boolean;
  tsunamiWarningEnabled: boolean;
}

interface AlertContextType {
  thresholds: AlertThresholds;
  setWaveThreshold: (value: number) => void;
  setWindThreshold: (value: number) => void;
  toggleHighWaves: () => void;
  toggleStrongWinds: () => void;
  toggleTsunamiWarning: () => void;
  isDismissed: boolean;
  dismiss: () => void;
  resetDismiss: () => void;
}

const STORAGE_KEY = 'seayou_alert_thresholds';

const DEFAULT_THRESHOLDS: AlertThresholds = {
  waveHeightThreshold: 2.0,
  windSpeedThreshold: 40,
  highWavesEnabled: true,
  strongWindsEnabled: true,
  tsunamiWarningEnabled: false,
};

function loadThresholds(): AlertThresholds {
  if (typeof window === 'undefined') return DEFAULT_THRESHOLDS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_THRESHOLDS, ...parsed };
    }
  } catch {
    // Ignore parse errors
  }
  return DEFAULT_THRESHOLDS;
}

function persistThresholds(thresholds: AlertThresholds): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(thresholds));
  } catch {
    // Ignore storage errors
  }
}

export const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const AlertProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [thresholds, setThresholds] = useState<AlertThresholds>(loadThresholds);
  const [isDismissed, setIsDismissed] = useState(false);

  const updateThresholds = useCallback((next: AlertThresholds) => {
    setThresholds(next);
    persistThresholds(next);
    setIsDismissed(false);
  }, []);

  const setWaveThreshold = useCallback((value: number) => {
    setThresholds(prev => {
      const next = { ...prev, waveHeightThreshold: value };
      persistThresholds(next);
      setIsDismissed(false);
      return next;
    });
  }, []);

  const setWindThreshold = useCallback((value: number) => {
    setThresholds(prev => {
      const next = { ...prev, windSpeedThreshold: value };
      persistThresholds(next);
      setIsDismissed(false);
      return next;
    });
  }, []);

  const toggleHighWaves = useCallback(() => {
    setThresholds(prev => {
      const next = { ...prev, highWavesEnabled: !prev.highWavesEnabled };
      persistThresholds(next);
      setIsDismissed(false);
      return next;
    });
  }, []);

  const toggleStrongWinds = useCallback(() => {
    setThresholds(prev => {
      const next = { ...prev, strongWindsEnabled: !prev.strongWindsEnabled };
      persistThresholds(next);
      setIsDismissed(false);
      return next;
    });
  }, []);

  const toggleTsunamiWarning = useCallback(() => {
    setThresholds(prev => {
      const next = { ...prev, tsunamiWarningEnabled: !prev.tsunamiWarningEnabled };
      persistThresholds(next);
      setIsDismissed(false);
      return next;
    });
  }, []);

  const dismiss = useCallback(() => setIsDismissed(true), []);
  const resetDismiss = useCallback(() => setIsDismissed(false), []);

  return (
    <AlertContext.Provider
      value={{
        thresholds,
        setWaveThreshold,
        setWindThreshold,
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
