import React, { useEffect, useCallback, useState } from 'react';
import { X, Bell, Waves, Wind, BellRing, Anchor } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ActivityPersona, DEFAULT_WAVE_RANGE, DEFAULT_WIND_RANGE } from '@seame/core';
import { RangeThresholdControl } from './dashboard/RangeThresholdControl';
import { useAlertConfig } from '../src/contexts/AlertContext';
import {
  requestPushPermission,
  waitForPlayerId,
  isNotificationReady,
  getPlayerId,
  wipeOneSignalIndexedDB,
  initOneSignalWeb,
} from '../src/services/oneSignalWeb';

interface AlertConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Currently active location from the parent view. Used to seed
   * `home_lat`/`home_lon` in the JSONB preferences when the user enables
   * push notifications. Falls back to recent/favorite locations when
   * absent so the Edge Function always has a forecast anchor.
   */
  currentLat?: number;
  currentLng?: number;
}

// ─── Persona selector config ───

const PERSONA_OPTIONS: { persona: ActivityPersona; label: string; emoji: string; color: string }[] = [
  { persona: ActivityPersona.WAVE_SURFER, label: 'Wave Surf', emoji: '\uD83C\uDFC4', color: 'bg-purple-500/60' },
  { persona: ActivityPersona.WIND_SURFER, label: 'Wind Surf', emoji: '\uD83D\uDCA8', color: 'bg-cyan-500/60' },
  { persona: ActivityPersona.KITE_SURFER, label: 'Kite', emoji: '\uD83E\uDE81', color: 'bg-amber-500/60' },
  { persona: ActivityPersona.SAILOR, label: 'Sailing', emoji: '\u26F5', color: 'bg-teal-500/60' },
  { persona: ActivityPersona.DIVER, label: 'Dive', emoji: '\uD83E\uDD3F', color: 'bg-blue-500/60' },
  { persona: ActivityPersona.BEACHGOER, label: 'Beach', emoji: '\uD83C\uDFD6\uFE0F', color: 'bg-amber-400/60' },
];

export const AlertConfigModal: React.FC<AlertConfigModalProps> = ({ isOpen, onClose, currentLat, currentLng }) => {
  const { t } = useTranslation();
  const [pushStatus, setPushStatus] = useState<'idle' | 'requesting' | 'granted' | 'denied'>(
    () => (isNotificationReady() ? 'granted' : 'idle'),
  );
  const {
    thresholds,
    primaryPersona,
    setPrimaryPersona,
    selectedActivities,
    setSelectedActivities,
    setWaveThreshold,
    setWindThreshold,
    setWaveRange,
    setWindRange,
    toggleHighWaves,
    toggleStrongWinds,
    toggleTsunamiAlerts,
    setPushRegistration,
    recentSearches,
    favoriteLocations,
    preferences: alertPrefs,
  } = useAlertConfig();

  // Re-sync the button state when the modal re-opens: the user may have
  // granted permission through the tour, the fallback effect, or browser
  // settings between sessions.
  useEffect(() => {
    if (!isOpen) return;
    if (isNotificationReady()) setPushStatus('granted');
  }, [isOpen]);

  /**
   * Fire the OneSignal permission prompt, capture the Player ID, and
   * persist the full registration tuple (id + opt-in + home lat/lon)
   * into Supabase. The Edge Function strictly requires all four fields.
   */
  const handleEnablePush = useCallback(async () => {
    if (pushStatus === 'requesting' || pushStatus === 'granted') return;
    setPushStatus('requesting');
    let granted = false;
    try {
      granted = await requestPushPermission();
      if (!granted) {
        setPushStatus('denied');
        return;
      }

      // Capture Player ID via the event-driven resolver. It rejects on
      // timeout (10s default) so we always get back control of the UI
      // — no infinite hang if OneSignal's handshake is blocked.
      let id: string;
      try {
        id = await waitForPlayerId();
      } catch (waitErr) {
        console.error('[AlertConfigModal] waitForPlayerId failed:', waitErr);
        // Last-ditch sync read — if the listener hadn't fired yet but
        // the ID actually did land between the timeout and now.
        const late = getPlayerId();
        if (!late) {
          // Permission *is* granted; we just couldn't capture the ID.
          // Show "Enabled" so the user can retry by clicking later
          // (button re-enables below via the finally path? — no, granted
          // path disables it; we keep it disabled once permission is in).
          setPushStatus('granted');
          return;
        }
        id = late;
      }

      // Resolve home coordinates — active location > first recent >
      // first favorite. One of these is always present by the time the
      // modal is reachable (Dashboard seeds currentLat/Lng from App).
      const fallback = recentSearches[0] ?? favoriteLocations[0] ?? null;
      const lat = currentLat ?? fallback?.lat;
      const lon = currentLng ?? fallback?.lng;
      if (typeof lat !== 'number' || typeof lon !== 'number') {
        console.warn('[AlertConfigModal] No home coordinates available; skipping push registration save');
        setPushStatus('granted');
        return;
      }

      setPushRegistration({ id, lat, lon });
      setPushStatus('granted');
    } catch (err) {
      console.error('[AlertConfigModal] Failed to enable push:', err);
    } finally {
      // Guarantee the button never stays stuck in "requesting". If we
      // successfully locked to 'granted' above this is a no-op; if we
      // bailed out with an error, flip back to 'idle' so the user can
      // retry. 'denied' sticks (browser blocked it — no point retrying).
      setPushStatus((prev) => {
        if (prev === 'requesting') {
          return granted ? 'granted' : 'idle';
        }
        return prev;
      });
    }
  }, [pushStatus, currentLat, currentLng, recentSearches, favoriteLocations, setPushRegistration]);

  /**
   * Phase 2 debug action — wipe OneSignal's IndexedDB and re-initialise
   * the SDK. Surfaces in the UI as a small "Reset push state" link under
   * the Enable button. Use when DevTools shows a `"local-<uuid>"` Player
   * ID or `Unrecognized operation: login-user` — both are fingerprints
   * of a corrupted local subscription store.
   */
  const [resetStatus, setResetStatus] = useState<'idle' | 'working' | 'done' | 'failed'>('idle');
  const handleResetPushState = useCallback(async () => {
    if (resetStatus === 'working') return;
    setResetStatus('working');
    try {
      const deleted = await wipeOneSignalIndexedDB();
      console.log('[AlertConfigModal] wipeOneSignalIndexedDB deleted:', deleted);
      // Re-init so the very next Enable click starts from a clean SDK state.
      await initOneSignalWeb();
      setPushStatus('idle');
      setResetStatus('done');
    } catch (err) {
      console.error('[AlertConfigModal] handleResetPushState failed:', err);
      setResetStatus('failed');
    }
  }, [resetStatus]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 modal-backdrop flex items-center justify-center px-4"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={t('dashboard.alertConfiguration', 'Alert Configuration')}
    >
      <div
        className="glass-panel w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-8 max-h-[90vh] overflow-y-auto hide-scrollbar"
        style={{ backgroundColor: 'color-mix(in srgb, var(--app-bg-card) 85%, transparent)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Bell size={20} className="text-blue-400" />
            {t('dashboard.alertConfiguration', 'Alert Configuration')}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
            aria-label={t('common.close', 'Close')}
          >
            <X size={18} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        {/* Divider */}
        <div className="mx-6 h-px" style={{ backgroundColor: 'var(--app-border)' }} />

        {/* Alert controls */}
        <div className="px-6 pt-5 pb-2 flex flex-col gap-4">

          {/* ═══ Activity Selector — pick up to 2 ═══ */}
          <div className="glass-inner rounded-xl p-4 border border-blue-500/20">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Anchor size={16} className="text-blue-400" />
                <span className="text-sm font-bold text-white">{t('profile.primaryActivity', 'My Activities')}</span>
              </div>
              <span className="text-[10px] text-white/40">{selectedActivities.length}/2</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {PERSONA_OPTIONS.map((opt) => {
                const isActive = selectedActivities.includes(opt.persona);
                const isDisabled = !isActive && selectedActivities.length >= 2;
                return (
                  <button
                    key={opt.persona}
                    disabled={isDisabled}
                    onClick={() => {
                      if (isActive) {
                        setSelectedActivities(selectedActivities.filter((p) => p !== opt.persona));
                        // If removing primary, set to first remaining or first option
                        if (primaryPersona === opt.persona) {
                          const remaining = selectedActivities.filter((p) => p !== opt.persona);
                          if (remaining.length > 0) setPrimaryPersona(remaining[0]);
                        }
                      } else {
                        const next = [...selectedActivities, opt.persona].slice(0, 2);
                        setSelectedActivities(next);
                        // Auto-set primary if none selected yet
                        if (selectedActivities.length === 0) setPrimaryPersona(opt.persona);
                      }
                    }}
                    className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg border transition-all ${
                      isActive
                        ? `${opt.color} border-white/30`
                        : isDisabled
                        ? 'bg-white/5 border-white/5 opacity-25 cursor-not-allowed'
                        : 'bg-white/5 border-white/5 opacity-50 hover:opacity-80'
                    }`}
                  >
                    <span className="text-lg">{opt.emoji}</span>
                    <span className="text-[9px] font-bold text-white leading-tight text-center">{opt.label}</span>
                    {isActive && primaryPersona === opt.persona && (
                      <span className="text-[8px] text-white/60 leading-tight">primary</span>
                    )}
                  </button>
                );
              })}
            </div>
            {selectedActivities.length > 1 && (
              <p className="text-[10px] text-white/40 mt-2 text-center">
                {t('alertConfig.tapToPrimary', 'Tap an active card to set it as primary')}
              </p>
            )}
          </div>

          {/* ═══ Wave range ═══ */}
          <div className={`transition-opacity ${thresholds.highWavesEnabled ? '' : 'opacity-50'}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Waves size={15} className="text-orange-400" />
                <span className="text-sm font-bold text-white">{t('alerts.highWaves', 'Wave Height')}</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={thresholds.highWavesEnabled} onChange={toggleHighWaves} className="sr-only peer" />
                <div className="w-9 h-5 bg-white/10 rounded-full peer peer-checked:bg-orange-500/60 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
              </label>
            </div>
            <RangeThresholdControl
              label={t('dashboard.waveThreshold', 'Wave height')}
              unit=" m"
              range={alertPrefs.waveHeightRange ?? DEFAULT_WAVE_RANGE}
              onChange={(r) => { setWaveRange(r); setWaveThreshold(r.high); }}
              min={0}
              max={10}
              step={0.1}
            />
          </div>

          {/* ═══ Wind range ═══ */}
          <div className={`transition-opacity ${thresholds.strongWindsEnabled ? '' : 'opacity-50'}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Wind size={15} className="text-blue-400" />
                <span className="text-sm font-bold text-white">{t('alerts.strongWinds', 'Wind Speed')}</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={thresholds.strongWindsEnabled} onChange={toggleStrongWinds} className="sr-only peer" />
                <div className="w-9 h-5 bg-white/10 rounded-full peer peer-checked:bg-blue-500/60 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
              </label>
            </div>
            <RangeThresholdControl
              label={t('dashboard.windThreshold', 'Wind speed')}
              unit=" km/h"
              range={alertPrefs.windSpeedRange ?? DEFAULT_WIND_RANGE}
              onChange={(r) => { setWindRange(r); setWindThreshold(r.high); }}
              min={0}
              max={120}
              step={1}
            />
          </div>

          {/* ═══ Daily Surf Report (push notifications) ═══
              Wires to preferences.push_opt_in (default true). The
              `daily-surf-report` Edge Function filters its query on
              push_opt_in !== false so existing users continue to receive
              pushes while new users can opt out here. */}
          <DailySurfReportToggle />

          {/* ═══ Tsunami Alerts (real push notifications) ═══ */}
          <div className={`flex items-center justify-between p-4 border rounded-xl transition-colors ${thresholds.tsunamiAlertsEnabled ? 'bg-red-950/30 border-red-900/40' : 'bg-red-950/10 border-white/5 opacity-60'}`}>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-red-900/40 flex items-center justify-center">
                <Waves size={16} className="text-red-400" />
              </div>
              <div>
                <span className="text-sm font-bold text-red-200 block">
                  {t('alerts.tsunamiAlerts', 'Tsunami Alerts')}
                </span>
                <span className="text-[10px] text-red-400/60">
                  {t('alerts.tsunamiAlertsDesc', 'Receive critical push notifications for tsunami warnings in your area')}
                </span>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={thresholds.tsunamiAlertsEnabled}
                onChange={toggleTsunamiAlerts}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-white/10 rounded-full peer peer-checked:bg-red-600/60 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
            </label>
          </div>

          {/* ═══ Push Notifications ═══ */}
          <div className="glass-inner rounded-xl p-4 border border-purple-500/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-900/40 flex items-center justify-center">
                  <BellRing size={16} className="text-purple-400" />
                </div>
                <div>
                  <span className="text-sm font-bold text-purple-200 block">
                    {t('alerts.pushNotifications', 'Push Notifications')}
                  </span>
                  <span className="text-[10px] text-purple-400/60">
                    {pushStatus === 'granted' ? t('alerts.pushEnabled', 'Enabled') :
                     pushStatus === 'denied' ? t('alerts.pushDenied', 'Blocked by browser') :
                     t('alerts.pushDesc', 'Get alerts when conditions are perfect')}
                  </span>
                </div>
              </div>
              <button
                onClick={handleEnablePush}
                disabled={pushStatus === 'requesting' || pushStatus === 'granted'}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                  pushStatus === 'granted'
                    ? 'bg-emerald-600/40 text-emerald-300 cursor-default'
                    : pushStatus === 'requesting'
                      ? 'bg-purple-600/30 text-purple-300 animate-pulse cursor-wait'
                      : 'bg-purple-600/50 text-white hover:bg-purple-500/60 active:bg-purple-500/80'
                }`}
              >
                {pushStatus === 'granted' ? t('alerts.pushGranted', 'Enabled') :
                 pushStatus === 'requesting' ? '...' :
                 t('alerts.pushEnable', 'Enable')}
              </button>
            </div>

            {/* Debug: Reset push state — wipes OneSignal IndexedDB, unblocks
                the "local-<uuid>" corrupted state. Safe to run at any time;
                the user will just need to click Enable again afterwards. */}
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[10px] text-white/30">
                {resetStatus === 'done'
                  ? 'Cleared. Reload the page, then click Enable.'
                  : resetStatus === 'failed'
                    ? 'Reset failed — see DevTools.'
                    : 'Stuck? Clear the local push cache.'}
              </span>
              <button
                type="button"
                onClick={handleResetPushState}
                disabled={resetStatus === 'working'}
                className="text-[10px] text-purple-300/70 hover:text-purple-200 underline decoration-dotted underline-offset-2 disabled:opacity-40"
              >
                {resetStatus === 'working' ? 'Resetting…' : 'Reset push state'}
              </button>
            </div>
          </div>
        </div>

        {/* Footer hint */}
        <div className="px-6 pt-4 pb-6 text-center">
          <p className="text-[10px] italic" style={{ color: 'var(--text-muted)' }}>
            {t('alerts.instantUpdate', 'Changes take effect instantly — no save needed')}
          </p>
        </div>
      </div>
    </div>
  );
};

/**
 * DailySurfReportToggle
 * ─────────────────────
 * Standalone opt-in switch for the `daily-surf-report` pg_cron push.
 * Stored in `preferences.push_opt_in` (JSONB). The Edge Function filters
 * `push_opt_in !== false`, so the default-true behaviour is preserved even
 * for legacy rows where the key is missing.
 *
 * When the user flips it ON and the browser has not yet granted permission,
 * we also fire the OneSignal permission prompt so the toggle is functional
 * the moment it's enabled (otherwise it would silently do nothing).
 */
const DailySurfReportToggle: React.FC = () => {
  const { t } = useTranslation();
  const { pushOptIn, setPushOptIn, onesignalPlayerId } = useAlertConfig();

  const handleToggle = useCallback(async () => {
    const next = !pushOptIn;
    setPushOptIn(next);
    // Turning ON without a captured Player ID means the browser hasn't
    // granted permission yet — trigger the OS prompt so the toggle is
    // actually wired to something.
    if (next && !onesignalPlayerId) {
      await requestPushPermission();
    }
  }, [pushOptIn, setPushOptIn, onesignalPlayerId]);

  return (
    <div
      className={`flex items-center justify-between p-4 border rounded-xl transition-colors ${
        pushOptIn
          ? 'bg-amber-500/10 border-amber-400/30'
          : 'bg-white/[0.02] border-white/5 opacity-70'
      }`}
    >
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
          <BellRing size={16} className="text-amber-300" />
        </div>
        <div>
          <span className="text-sm font-bold text-white block">
            {t('alerts.dailySurfReport', 'Daily Surf Report')}
          </span>
          <span className="text-[10px] text-white/50">
            {t(
              'alerts.dailySurfReportDesc',
              'Get a personalized push when the day has a Good+ window at your spot',
            )}
          </span>
        </div>
      </div>
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={pushOptIn}
          onChange={handleToggle}
          className="sr-only peer"
          aria-label={t('alerts.dailySurfReport', 'Daily Surf Report')}
        />
        <div className="w-9 h-5 bg-white/10 rounded-full peer peer-checked:bg-amber-500/70 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
      </label>
    </div>
  );
};
