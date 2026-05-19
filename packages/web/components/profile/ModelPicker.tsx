import React from 'react';
import { useTranslation } from 'react-i18next';
import { WEATHER_MODELS } from '@seame/core';

interface ModelPickerProps {
  selectedModel: string | undefined;
  onChange: (model: string | undefined) => void;
}

export function ModelPicker({ selectedModel, onChange }: ModelPickerProps) {
  const { t } = useTranslation();
  const current = selectedModel ? WEATHER_MODELS[selectedModel] : null;

  return (
    <div className="flex flex-col gap-2 p-4 rounded-xl bg-white/5 border border-white/10">
      <label className="text-sm font-semibold text-white/70">
        {t('settings.weatherModel.label', 'Forecast model')}
      </label>
      <select
        className="bg-[var(--app-bg-card)] text-white rounded-lg px-3 py-2 border border-white/20 focus:outline-none focus:ring-2 focus:ring-cyan-400 text-sm"
        value={selectedModel ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
      >
        <option value="">{t('settings.weatherModel.auto', 'Auto (best for location)')}</option>
        {Object.entries(WEATHER_MODELS).map(([id, model]) => (
          <option key={id} value={id}>
            {model.name} ({model.resolution})
          </option>
        ))}
      </select>
      {current && (
        <p className="text-xs text-white/50 leading-snug">
          {t('settings.weatherModel.description', {
            resolution: current.resolution,
            horizon: current.forecastDays,
            defaultValue: `${current.resolution} resolution · ${current.forecastDays}-day horizon`,
          })}
        </p>
      )}
    </div>
  );
}
