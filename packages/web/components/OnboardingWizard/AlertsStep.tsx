/**
 * Step 4: Configure Alerts (Optional)
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Bell, Waves, Wind, Check, Sparkles } from 'lucide-react';
import { OnboardingStepProps } from '../../src/types/onboarding';

export const AlertsStep: React.FC<OnboardingStepProps> = ({
  onSkip,
  onPrevious,
  preferences,
  updatePreferences,
}) => {
  const { t } = useTranslation();
  const { alerts } = preferences;

  const handleWaveHeightChange = (value: number) => {
    updatePreferences({
      alerts: { ...alerts, waveHeight: value },
    });
  };

  const handleWindSpeedChange = (value: number) => {
    updatePreferences({
      alerts: { ...alerts, windSpeed: value },
    });
  };

  const handleNotifyToggle = () => {
    updatePreferences({
      alerts: { ...alerts, notifyWhenPerfect: !alerts.notifyWhenPerfect },
    });
  };

  return (
    <div className="px-4 py-8 max-w-2xl mx-auto">
      {/* Title */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 mb-4">
          <div className="bg-purple-500/20 p-3 rounded-full">
            <Bell size={32} className="text-purple-400" />
          </div>
        </div>
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">
          {t('ui.set_up_custom_alerts')}
        </h2>
        <p className="text-slate-400">
          {t('ui.optional_get_notified')}
        </p>
      </div>

      {/* Alert Settings */}
      <div className="space-y-6 mb-8">
        {/* Wave Height Threshold */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Waves size={20} className="text-blue-400" />
              <span className="font-bold text-white">{t('ui.wave_height_threshold')}</span>
            </div>
            <div className="text-2xl font-bold text-blue-400">
              {alerts.waveHeight.toFixed(1)}m
            </div>
          </div>
          <input
            type="range"
            min="0.5"
            max="5"
            step="0.1"
            value={alerts.waveHeight}
            onChange={(e) => handleWaveHeightChange(parseFloat(e.target.value))}
            className="w-full h-2 bg-slate-700 rounded-lg cursor-pointer accent-blue-500"
          />
            <div className="flex justify-between text-xs text-slate-500 mt-2">
            <span>{t('ui.threshold_calm', { val: '0.5m' })}</span>
            <span>{t('ui.threshold_extreme', { val: '5m' })}</span>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            {t('ui.alert_when_waves_exceed')}
          </p>
        </div>

        {/* Wind Speed Threshold */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Wind size={20} className="text-cyan-400" />
              <span className="font-bold text-white">{t('ui.wind_speed_threshold')}</span>
            </div>
            <div className="text-2xl font-bold text-cyan-400">
              {alerts.windSpeed} km/h
            </div>
          </div>
          <input
            type="range"
            min="0"
            max="80"
            step="5"
            value={alerts.windSpeed}
            onChange={(e) => handleWindSpeedChange(parseInt(e.target.value))}
            className="w-full h-2 bg-slate-700 rounded-lg cursor-pointer accent-cyan-500"
          />
          <div className="flex justify-between text-xs text-slate-500 mt-2">
            <span>{t('ui.threshold_min', { val: '0 km/h' })}</span>
            <span>{t('ui.threshold_max', { val: '80 km/h' })}</span>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            Alert me when wind speed exceeds this value
          </p>
        </div>

        {/* Perfect Conditions Notification */}
        <div
          onClick={handleNotifyToggle}
          className={`
            cursor-pointer rounded-xl p-6 border-2 transition-all
            ${
              alerts.notifyWhenPerfect
                ? 'bg-green-500/10 border-green-500/50'
                : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
            }
          `}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3 flex-1">
              <div className={`p-2 rounded-full ${alerts.notifyWhenPerfect ? 'bg-green-500/20' : 'bg-purple-500/20'}`}>
                <Sparkles size={20} className={alerts.notifyWhenPerfect ? 'text-green-400' : 'text-purple-400'} />
              </div>
              <div>
                <div className="font-bold text-white mb-1">
                  {t('ui.notify_when_perfect')}
                </div>
                <p className="text-xs text-slate-400">
                  {t('ui.get_alerts_when_weather_matches')}
                </p>
              </div>
            </div>
            <div
              className={`
                ml-4 flex-shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all
                ${
                  alerts.notifyWhenPerfect
                    ? 'bg-green-500 border-green-500'
                    : 'border-slate-600'
                }
              `}
            >
              {alerts.notifyWhenPerfect && <Check size={16} className="text-white" />}
            </div>
          </div>
        </div>
      </div>

      {/* Info Message */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 mb-8">
        <p className="text-sm text-blue-300 flex items-start gap-2">
          <Bell size={16} className="mt-0.5 flex-shrink-0" />
          <span>
            Alert thresholds can be customized later in settings. We'll use your activity preference to suggest optimal conditions.
          </span>
        </p>
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between items-center gap-4">
        <button
          onClick={onPrevious}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
          Back
        </button>

        <div className="flex gap-4">
          <button
            onClick={onSkip}
            className="text-slate-400 hover:text-white transition-colors text-sm px-4"
          >
            {t('ui.skip_alerts')}
          </button>
          <button
            onClick={onSkip} // onSkip acts as "Finish" on the last step
            className="flex items-center gap-2 bg-button hover:brightness-110 active:scale-[0.98] text-white font-bold py-3 px-8 rounded-xl transition-all shadow-lg"
          >
            <Check size={20} />
            {t('ui.finish_setup')}
          </button>
        </div>
      </div>

      <p className="text-center text-xs text-slate-500 mt-6">
        {t('ui.you_are_all_set')}
      </p>
    </div>
  );
};
