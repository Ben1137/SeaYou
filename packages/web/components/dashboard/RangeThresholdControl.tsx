import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ThresholdRange } from '@seame/core';

interface Props {
  label: string;
  unit: string;
  range: ThresholdRange;
  onChange: (next: ThresholdRange) => void;
  min: number;
  max: number;
  step: number;
}

export function RangeThresholdControl({ label, unit, range, onChange, min, max, step }: Props) {
  const { t } = useTranslation();
  const pct = (v: number) => `${Math.round(((v - min) / (max - min)) * 100)}%`;

  return (
    <div className="bg-card border border-app rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-primary">{label}</span>
        <span className="text-xs text-muted">
          {range.sweetMin}{unit}–{range.sweetMax}{unit} sweet spot
        </span>
      </div>

      {/* Visual band */}
      <div className="relative h-3 bg-elevated rounded-full overflow-hidden">
        <div className="absolute h-full bg-blue-500/50" style={{ left: pct(min), width: pct(range.sweetMin) }} />
        <div
          className="absolute h-full bg-green-500"
          style={{
            left: pct(range.sweetMin),
            width: `${Math.round(((range.sweetMax - range.sweetMin) / (max - min)) * 100)}%`,
          }}
        />
        <div
          className="absolute h-full bg-amber-500/50"
          style={{
            left: pct(range.sweetMax),
            width: `${Math.round(((range.high - range.sweetMax) / (max - min)) * 100)}%`,
          }}
        />
        <div className="absolute h-full bg-red-600" style={{ left: pct(range.high), width: pct(max) }} />
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-muted">
            {t('alertConfig.tooSmall', 'Too small')}: {range.low}{unit}
          </span>
          <input
            type="range"
            min={min}
            max={range.sweetMin - step}
            step={step}
            value={range.low}
            className="w-full accent-blue-500"
            onChange={(e) => onChange({ ...range, low: parseFloat(e.target.value) })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">
            {t('alertConfig.sweetMin', 'Sweet spot min')}: {range.sweetMin}{unit}
          </span>
          <input
            type="range"
            min={range.low + step}
            max={range.sweetMax - step}
            step={step}
            value={range.sweetMin}
            className="w-full accent-green-500"
            onChange={(e) => onChange({ ...range, sweetMin: parseFloat(e.target.value) })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">
            {t('alertConfig.sweetMax', 'Sweet spot max')}: {range.sweetMax}{unit}
          </span>
          <input
            type="range"
            min={range.sweetMin + step}
            max={range.high - step}
            step={step}
            value={range.sweetMax}
            className="w-full accent-green-500"
            onChange={(e) => onChange({ ...range, sweetMax: parseFloat(e.target.value) })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">
            {t('alertConfig.tooBig', 'Danger')}: {range.high}{unit}
          </span>
          <input
            type="range"
            min={range.sweetMax + step}
            max={max}
            step={step}
            value={range.high}
            className="w-full accent-red-500"
            onChange={(e) => onChange({ ...range, high: parseFloat(e.target.value) })}
          />
        </label>
      </div>
    </div>
  );
}
