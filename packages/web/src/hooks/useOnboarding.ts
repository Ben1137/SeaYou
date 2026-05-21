/**
 * Hook for managing onboarding wizard state.
 *
 * Source of truth priority:
 *   1. Supabase `user_preferences.has_completed_onboarding` (authenticated users)
 *   2. localStorage `seayou_onboarding_complete` (offline / unauthenticated fallback)
 *
 * This ensures the wizard fires only once per user account, even when the user
 * signs in from a new device.
 */

import { useState, useEffect, useCallback } from 'react';
import { OnboardingPreferences, DEFAULT_PREFERENCES } from '../types/onboarding';
import { getSupabaseClient } from '@seame/core';

const STORAGE_KEY = 'seayou_onboarding_complete';

async function persistCompletionToSupabase() {
  try {
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from('user_preferences')
      .upsert({ user_id: user.id, has_completed_onboarding: true }, { onConflict: 'user_id' });
  } catch (e) {
    console.warn('[useOnboarding] failed to persist to Supabase', e);
  }
}

export function useOnboarding() {
  const [preferences, setPreferences] = useState<OnboardingPreferences>(DEFAULT_PREFERENCES);
  const [currentStep, setCurrentStep] = useState(1);
  const [isOpen, setIsOpen] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = getSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data, error } = await supabase
            .from('user_preferences')
            .select('has_completed_onboarding')
            .eq('user_id', user.id)
            .maybeSingle();
          if (cancelled) return;
          if (error) {
            // Supabase error — fall back to localStorage
            const stored = localStorage.getItem(STORAGE_KEY);
            setIsOpen(!stored);
          } else if (data?.has_completed_onboarding) {
            setIsOpen(false);
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ completed: true }));
          } else {
            setIsOpen(true);
          }
        } else {
          if (cancelled) return;
          const stored = localStorage.getItem(STORAGE_KEY);
          setIsOpen(!stored);
        }
      } catch {
        if (!cancelled) {
          setIsOpen(!localStorage.getItem(STORAGE_KEY));
        }
      } finally {
        if (!cancelled) setIsReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const savePreferences = useCallback((prefs: OnboardingPreferences) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
      setPreferences(prefs);
    } catch (e) {
      console.error('Failed to save onboarding preferences:', e);
    }
  }, []);

  const updatePreferences = useCallback(
    (updates: Partial<OnboardingPreferences>) => {
      setPreferences((prev) => ({ ...prev, ...updates }));
    },
    []
  );

  const completeOnboarding = useCallback(() => {
    const completed: OnboardingPreferences = {
      ...preferences,
      completed: true,
      completedAt: new Date().toISOString(),
    };
    savePreferences(completed);
    setIsOpen(false);
    void persistCompletionToSupabase();
  }, [preferences, savePreferences]);

  const skipOnboarding = useCallback(() => {
    const skipped: OnboardingPreferences = {
      ...DEFAULT_PREFERENCES,
      completed: true,
      completedAt: new Date().toISOString(),
    };
    savePreferences(skipped);
    setIsOpen(false);
    void persistCompletionToSupabase();
  }, [savePreferences]);

  const resetOnboarding = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setPreferences(DEFAULT_PREFERENCES);
    setCurrentStep(1);
    setIsOpen(true);
  }, []);

  const nextStep = useCallback(() => setCurrentStep((p) => Math.min(p + 1, 4)), []);
  const previousStep = useCallback(() => setCurrentStep((p) => Math.max(p - 1, 1)), []);

  const closeWizard = useCallback(() => {
    if (currentStep === 4) completeOnboarding();
    else skipOnboarding();
  }, [currentStep, completeOnboarding, skipOnboarding]);

  return {
    preferences, updatePreferences, currentStep, nextStep, previousStep,
    completeOnboarding, skipOnboarding, closeWizard, resetOnboarding,
    isOpen, setIsOpen, isReady,
  };
}
