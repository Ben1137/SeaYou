import React, { useEffect, useCallback, useState } from 'react';
import { X, Bell, Waves, Wind, BellRing, Anchor } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ActivityPersona } from '@seame/core';
import { useAlertConfig } from '../src/contexts/AlertContext';
import {
  requestPushPermission,
  waitForPlayerId,
  isNotificationReady,
  getPlayerId,
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
    setWaveThreshold,
    setWindThreshold,
    toggleHighWaves,
    toggleStrongWinds,
    toggleTsunamiAlerts,
    setPushRegistration,
    recentSearches,
    favoriteLocations,
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
    try {
      const granted = await requestPushPermission();
      if (!granted) {
        setPushStatus('denied');
        return;
      }
      setPushStatus('granted');
      const id = (await waitForPlayerId()) ?? getPlayerId();
      if (!id) return;
      // Resolve home coordinates — active location > first recent >
      // first favorite. One of these is always present by the time the
      // modal is reachable (Dashboard seeds currentLat/Lng from App).
      const fallback = recentSearches[0] ?? favoriteLocations[0] ?? null;
      const lat = currentLat ?? fallback?.lat;
      const lon = currentLng ?? fallback?.lng;
      if (typeof lat !== 'number' || typeof lon !== 'number') return;
      setPushRegistration({ id, lat, lon });
    } catch (err) {
      console.warn('[AlertConfigModal] Failed to enable push:', err);
      setPushStatus('denied');
    }
  }, [pushStatus, currentLat, currentLng, recentSearches, favoriteLocations, setPushRegistration]);

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

          {/* ═══ Persona Selector ═══ */}
          <div className="glass-inner rounded-xl p-4 border border-blue-500/20">
            <div className="flex items-center gap-2 mb-3">
              <Anchor size={16} className="text-blue-400" />
              <span className="text-sm font-bold text-white">{t('profile.primaryActivity', 'Primary Activity')}</span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {PERSONA_OPTIONS.map((opt) => {
                const isActive = primaryPersona === opt.persona;
                return (
                  <button
                    key={opt.persona}
                    onClick={() => setPrimaryPersona(opt.persona)}
                    className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg border transition-all ${
                      isActive
                        ? `${opt.color} border-white/30 scale-105`
                        : 'bg-white/5 border-white/5 opacity-50 hover:opacity-80'
                    }`}
                  >
                    <span className="text-lg">{opt.emoji}</span>
                    <span className="text-[9px] font-bold text-white leading-tight">{opt.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-white/40 mt-2 text-center">
              {t('profile.personaHint', 'Hype alerts and scoring are tuned to your primary activity')}
            </p>
          </div>

          {/* ═══ Wave threshold card ═══ */}
          <div className={`glass-inner rounded-xl p-4 border transition-colors ${thresholds.highWavesEnabled ? 'border-orange-500/30' : 'border-white/5 opacity-60'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Waves size={16} className="text-orange-400" />
                <span className="text-sm font-bold text-white">{t('alerts.highWaves', 'High Waves')}</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={thresholds.highWavesEnabled}
                  onChange={toggleHighWaves}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-white/10 rounded-full peer peer-checked:bg-orange-500/60 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
              </label>
            </div>
            <label className="text-xs text-white/60 flex justify-between mb-1.5">
              {t('dashboard.waveThreshold', 'Wave height threshold')}
              <span className="text-white font-bold">{thresholds.waveHeightThreshold} m</span>
            </label>
            <input
              type="range"
              min="0.5"
              max="10"
              step="0.5"
              value={thresholds.waveHeightThreshold}
              onChange={(e) => setWaveThreshold(parseFloat(e.target.value))}
              disabled={!thresholds.highWavesEnabled}
              className="w-full accent-orange-500"
            />
            <div className="flex justify-between text-[10px] text-white/30 mt-1">
              <span>0.5m</span>
              <span>10m</span>
            </div>
          </div>

          {/* ═══ Wind threshold card ═══ */}
          <div className={`glass-inner rounded-xl p-4 border transition-colors ${thresholds.strongWindsEnabled ? 'border-blue-500/30' : 'border-white/5 opacity-60'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Wind size={16} className="text-blue-400" />
                <span className="text-sm font-bold text-white">{t('alerts.strongWinds', 'Strong Winds')}</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={thresholds.strongWindsEnabled}
                  onChange={toggleStrongWinds}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-white/10 rounded-full peer peer-checked:bg-blue-500/60 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
              </label>
            </div>
            <label className="text-xs text-white/60 flex justify-between mb-1.5">
              {t('dashboard.windThreshold', 'Wind speed threshold')}
              <span className="text-white font-bold">{thresholds.windSpeedThreshold} km/h</span>
            </label>
            <input
              type="range"
              min="10"
              max="100"
              step="5"
              value={thresholds.windSpeedThreshold}
              onChange={(e) => setWindThreshold(parseFloat(e.target.value))}
              disabled={!thresholds.strongWindsEnabled}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-[10px] text-white/30 mt-1">
              <span>10 km/h</span>
              <span>100 km/h</span>
            </div>
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
