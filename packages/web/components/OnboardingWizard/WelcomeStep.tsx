/**
 * Step 1: Welcome & Introduction
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Waves, ArrowRight } from 'lucide-react';
import { OnboardingStepProps } from '../../src/types/onboarding';

export const WelcomeStep: React.FC<OnboardingStepProps> = ({ onNext, onSkip }) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center text-center px-4 py-8">
      {/* Logo/Icon */}
      <div className="mb-6 relative">
        <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-2xl"></div>
        <div className="relative bg-gradient-to-br from-blue-500 to-cyan-500 p-6 rounded-full shadow-2xl">
          <Waves size={64} className="text-white" />
        </div>
      </div>

      {/* Welcome Text */}
      <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
        {t('ui.welcome_title')}
      </h1>

      <p className="text-lg text-slate-300 max-w-md mb-8 leading-relaxed">
        {t('ui.welcome_description')}
      </p>

      {/* Features List */}
      <div className="bg-slate-800/50 rounded-xl p-6 mb-8 max-w-md border border-slate-700">
        <ul className="space-y-3 text-left text-slate-300">
            <li className="flex items-start gap-3">
            <span className="text-blue-400 text-xl mt-0.5">•</span>
            <span>{t('ui.features_real_time_weather')}</span>
          </li>
            <li className="flex items-start gap-3">
            <span className="text-cyan-400 text-xl mt-0.5">•</span>
            <span>{t('ui.features_wave_swell_wind')}</span>
          </li>
            <li className="flex items-start gap-3">
            <span className="text-purple-400 text-xl mt-0.5">•</span>
            <span>{t('ui.features_custom_alerts')}</span>
          </li>
            <li className="flex items-start gap-3">
            <span className="text-green-400 text-xl mt-0.5">•</span>
            <span>{t('ui.features_tides_atmosphere')}</span>
          </li>
        </ul>
      </div>

      {/* Buttons */}
      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
        <button
          onClick={onNext}
          className="flex-1 bg-button hover:brightness-110 active:scale-[0.98] text-white font-bold py-4 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg"
        >
          {t('ui.get_started')}
          <ArrowRight size={20} />
        </button>
        <button
          onClick={onSkip}
          className="sm:w-auto px-6 text-slate-400 hover:text-white transition-colors text-sm"
        >
          {t('ui.skip')}
        </button>
      </div>

      <p className="text-xs text-slate-500 mt-6">
        {t('ui.takes_only_30_seconds')}
      </p>
    </div>
  );
};
