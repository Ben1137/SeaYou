import React, { useEffect, useCallback } from 'react';
import { X, Bell, Waves, Wind } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAlertConfig } from '../src/contexts/AlertContext';

interface AlertConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AlertConfigModal: React.FC<AlertConfigModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const {
    thresholds,
    setWaveThreshold,
    setWindThreshold,
    toggleHighWaves,
    toggleStrongWinds,
    toggleTsunamiWarning,
  } = useAlertConfig();

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
        className="glass-panel w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-8"
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

          {/* Wave threshold card */}
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

          {/* Wind threshold card */}
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

          {/* Tsunami simulation */}
          <div className="flex items-center justify-between p-4 bg-red-950/30 border border-red-900/40 rounded-xl">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-red-900/40 flex items-center justify-center">
                <Waves size={16} className="text-red-400" />
              </div>
              <div>
                <span className="text-sm font-bold text-red-200 block">
                  {t('dashboard.tsunamiSimulation', 'Tsunami Simulation')}
                </span>
                <span className="text-[10px] text-red-400/60">
                  {t('alerts.tsunamiDesc', 'Simulates tsunami warning banner')}
                </span>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={thresholds.tsunamiWarningEnabled}
                onChange={toggleTsunamiWarning}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-white/10 rounded-full peer peer-checked:bg-red-600/60 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
            </label>
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
