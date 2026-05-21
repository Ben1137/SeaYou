import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, BarChart2 } from 'lucide-react';
import { compareModels, WEATHER_MODELS, type ComparisonResponse } from '@seame/core';

interface Props {
  lat: number;
  lng: number;
  onClose: () => void;
}

const POPULAR_MODELS = ['best_match', 'ecmwf_ifs025', 'icon_seamless', 'gfs_seamless'] as const;

// ecmwf_ifs025 is the high-res IFS variant available on the forecast API;
// fall back gracefully to the display name from WEATHER_MODELS if present,
// otherwise use a human-readable label.
function getModelLabel(id: string): string {
  return WEATHER_MODELS[id]?.name ?? (id === 'ecmwf_ifs025' ? 'ECMWF IFS 0.25°' : id);
}

export function ModelComparisonPanel({ lat, lng, onClose }: Props) {
  const { t } = useTranslation();
  const [selectedModels, setSelectedModels] = useState<string[]>(['best_match', 'icon_seamless']);
  const [result, setResult] = useState<ComparisonResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleModel = (id: string) => {
    setSelectedModels((prev) => {
      if (prev.includes(id)) return prev.filter((m) => m !== id);
      if (prev.length >= 3) return prev; // cap at 3 to respect rate limits
      return [...prev, id];
    });
  };

  const run = async () => {
    if (selectedModels.length < 2) return;
    setLoading(true);
    setError(null);
    try {
      const r = await compareModels(lat, lng, selectedModels);
      setResult(r);
    } catch {
      setError(t('comparison.fetchError', 'Could not fetch model data. Try again.'));
    } finally {
      setLoading(false);
    }
  };

  const highSpread =
    result !== null &&
    (result.spread.waveHeight > 0.3 || result.spread.windSpeed > 5);

  const metrics: Array<{
    key: keyof typeof result.perModel[0];
    label: string;
    unit: string;
    decimals: number;
  }> = [
    { key: 'waveHeight', label: t('weather.waveHeight', 'Wave'), unit: 'm', decimals: 1 },
    { key: 'wavePeriod', label: t('weather.wavePeriod', 'Period'), unit: 's', decimals: 1 },
    { key: 'windSpeed', label: t('weather.windSpeed', 'Wind'), unit: ' km/h', decimals: 0 },
    { key: 'seaTemp', label: t('weather.sea', 'Sea temp'), unit: '°C', decimals: 1 },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('comparison.title', 'Model Comparison')}
      className="absolute bottom-0 left-0 right-0 z-[700] bg-slate-900 border-t border-white/10 rounded-t-2xl shadow-2xl p-4 max-h-[70vh] overflow-y-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart2 size={18} className="text-cyan-400" aria-hidden="true" />
          <h3 className="font-bold text-white text-sm">
            {t('comparison.title', 'Model Comparison')}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="text-white/40 hover:text-white transition-colors p-1"
          aria-label={t('common.close', 'Close')}
        >
          <X size={18} />
        </button>
      </div>

      {/* Model selector chips */}
      <div className="flex flex-wrap gap-2 mb-2" role="group" aria-label={t('comparison.pickHint', 'Pick 2–3 models to compare')}>
        {POPULAR_MODELS.map((id) => {
          const selected = selectedModels.includes(id);
          return (
            <button
              key={id}
              onClick={() => toggleModel(id)}
              aria-pressed={selected}
              className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                selected
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                  : 'border-white/10 text-white/50 hover:border-white/30 hover:text-white/70'
              }`}
            >
              {getModelLabel(id)}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-white/40 mb-3">
        {t('comparison.pickHint', 'Pick 2–3 models to compare')}
      </p>

      <button
        onClick={run}
        disabled={selectedModels.length < 2 || loading}
        className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold py-2 rounded-lg text-sm transition-colors mb-4"
      >
        {loading
          ? t('comparison.loading', 'Fetching…')
          : t('comparison.compare', 'Compare at current location')}
      </button>

      {error !== null && (
        <p className="text-xs text-red-400 mb-3">{error}</p>
      )}

      {highSpread && result !== null && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-4 text-xs text-amber-300" role="alert">
          {t(
            'comparison.highSpread',
            'Models disagree significantly — forecast confidence is low.',
          )}
        </div>
      )}

      {result !== null && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-2 text-white/50 font-medium">
                  {t('comparison.metric', 'Metric')}
                </th>
                {result.perModel.map((m) => (
                  <th key={m.model} className="text-right py-2 text-white/70 px-2 font-medium">
                    {m.modelName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.map(({ key, label, unit, decimals }) => (
                <tr key={key} className="border-b border-white/5">
                  <td className="py-2 text-white/60">{label}</td>
                  {result.perModel.map((m) => {
                    const val = m[key] as number | null;
                    return (
                      <td
                        key={m.model}
                        className="text-right py-2 px-2 font-mono text-white tabular-nums"
                      >
                        {val !== null ? `${val.toFixed(decimals)}${unit}` : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] text-white/30 mt-2">
            {new Date(result.forecastTime).toLocaleTimeString()} &middot;{' '}
            {result.lat.toFixed(3)},{result.lng.toFixed(3)}
          </p>
        </div>
      )}
    </div>
  );
}
