/**
 * EnergyConsistencyCard — Wave Energy + Consistency metric card.
 *
 * Energy: wave power per metre of wave crest (kW/m) using the general form
 *   P = (1/16)·ρ·g·H²·Cg  (exact at all depths, not deep-water-only).
 * Height source is controlled by ENERGY_HEIGHT_SOURCE below.
 * Default: BREAKING — the engine's own output, the differentiator.
 *
 * Consistency: CoV of nearshoreTransform().H over STEADINESS_WINDOW_H hours.
 * Each hour runs its own transform at the same spot depth (depth is stable;
 * H0 and T vary per hour from the API forecast arrays). CoV is scale-invariant —
 * a ratio proxy would return swell CoV, not breaking-height CoV.
 * Displayed as a word + proportional bar. Tooltip states what is measured.
 *
 * Both metrics are computed in @seame/core — this component is purely display.
 */

import React from 'react';
import { Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  surfPowerKwPerM,
  temporalSteadiness,
  nearshoreTransform,
  type ConsistencyResult,
} from '@seame/core';
import type { MarineWeatherData } from '@seame/core';
import type { CoastalReading } from '../hooks/useCoastalReading';
import { deriveSwellInputs } from '../hooks/useCoastalReading';

// ─── Build-time configuration ────────────────────────────────────────────────

/**
 * Which wave height feeds the energy calculation.
 * BREAKING: nearshoreTransform().H — the engine's own output, exact at depth.
 *           This is the height a surfer actually meets.
 * SWELL:    swell_wave_height from the API (modal estimate — see modal-partition caveat).
 * TOTAL:    wave_height from the API (provider's total significant height).
 */
export const ENERGY_HEIGHT_SOURCE: 'BREAKING' | 'SWELL' | 'TOTAL' = 'BREAKING';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EnergyConsistencyCardProps {
  weatherData: MarineWeatherData;
  /** Coastal Break engine reading for the current spot. Null when unavailable. */
  coastalReading: CoastalReading | null;
  /** Current hour index into weatherData.hourly arrays. */
  currentHourIndex: number;
}

// ─── Bar component ────────────────────────────────────────────────────────────

interface ConsistencyBarProps {
  result: ConsistencyResult;
}

function ConsistencyBar({ result }: ConsistencyBarProps) {
  const { t } = useTranslation();

  // Bar fill: 100% = Steady (CoV=0), 0% = highly variable (CoV≥0.5).
  // Clamped so a very high CoV doesn't show negative.
  const barPct = result.metric === 'TEMPORAL'
    ? Math.max(0, Math.min(100, (1 - result.value / 0.5) * 100))
    : Math.min(100, result.value * 100); // CLEANLINESS: dominance ratio directly

  const label = result.label;

  const barColor =
    label === 'Steady' || label === 'Clean'
      ? 'bg-teal-400'
      : label === 'Variable' || label === 'Mixed'
        ? 'bg-amber-400'
        : 'bg-rose-400'; // Dropping / Messy

  const textColor =
    label === 'Steady' || label === 'Clean'
      ? 'text-teal-300'
      : label === 'Variable' || label === 'Mixed'
        ? 'text-amber-300'
        : 'text-rose-300';

  const tooltipText = result.metric === 'TEMPORAL'
    ? t(
        'energyCard.consistencyTooltipTemporal',
        'Steadiness of breaking-wave height over the next 6 forecast hours. CoV < 0.15 = Steady.',
      )
    : t(
        'energyCard.consistencyTooltipCleanliness',
        'Fraction of wave energy from swell vs. wind-chop. Note: Open-Meteo swell/wind partitions are modal estimates and may not conserve energy.',
      );

  const labelKey = `energyCard.consistency${label}` as const;

  return (
    <div title={tooltipText}>
      <div className="flex items-center justify-between mb-1">
        <span className={`text-[11px] font-semibold tabular-nums ${textColor}`}>
          {t(labelKey, label)}
        </span>
        <span className="text-[10px] text-white/40 tabular-nums">{Math.round(barPct)}%</span>
      </div>
      <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${barPct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Main card ────────────────────────────────────────────────────────────────

export function EnergyConsistencyCard({
  weatherData,
  coastalReading,
  currentHourIndex,
}: EnergyConsistencyCardProps) {
  const { t } = useTranslation();

  // ── Energy ────────────────────────────────────────────────────────────────
  const current = weatherData.current;
  const hourly  = weatherData.hourly;

  let H: number | null = null;
  let T: number | null = null;
  let d: number = Infinity; // deep-water fallback

  if (ENERGY_HEIGHT_SOURCE === 'BREAKING' && coastalReading) {
    // Use K-G breaker height (depth-independent) rather than HShoaled.
    // HBreaker is what the Coastal Break card displays; energy should match that number.
    H = coastalReading.HBreaker;
    T = coastalReading.T;
    d = coastalReading.d;
  } else if (ENERGY_HEIGHT_SOURCE === 'SWELL') {
    H = current?.swellHeight ?? null;
    T = current?.swellPeriod ?? null;
  } else if (ENERGY_HEIGHT_SOURCE === 'TOTAL') {
    H = current?.waveHeight ?? null;
    T = current?.wavePeriod ?? null;
  }

  const energyKw =
    H != null && H > 0 && T != null && T > 0
      ? surfPowerKwPerM(H, T, d)
      : null;

  // ── Consistency (temporal steadiness over STEADINESS_WINDOW_H hours) ──────
  // Run nearshoreTransform per forecast hour using each hour's own H0 and T,
  // at the same spot depth (d doesn't change hour-to-hour).
  // This gives actual transformed heights — not a scaling approximation.
  // CoV is scale-invariant, so using a scaled proxy would return the CoV of
  // swell height, not of breaking-wave height.
  let consistencyResult: ConsistencyResult | null = null;

  if (coastalReading && coastalReading.d > 0 && hourly) {
    const transformedHeights: number[] = [coastalReading.HFinal]; // hour 0 = current

    for (let i = 1; i <= 6; i++) {
      const idx = currentHourIndex + i;
      const inputs = deriveSwellInputs({
        swellHeight:    hourly.swell_wave_height?.[idx]  ?? 0,
        swellPeriod:    hourly.swell_wave_period?.[idx]  ?? 0,
        swellDirection: 0, // direction not used by nearshoreTransform
        waveHeight:     hourly.wave_height?.[idx]        ?? 0,
        wavePeriod:     hourly.wave_period?.[idx]        ?? 0,
      });
      if (inputs.H0 > 0.05 && inputs.T > 1) {
        const result = nearshoreTransform(inputs.H0, inputs.T, coastalReading.d);
        transformedHeights.push(result.H);
      }
    }

    if (transformedHeights.length >= 2) {
      consistencyResult = temporalSteadiness(transformedHeights);
    }
  }

  // ── Energy tooltip ─────────────────────────────────────────────────────────
  const energyTooltip = t(
    'energyCard.energyTooltip',
    'Wave power per metre of wave crest (kW/m). Uses Komar-Gaughan breaker height (empirical, no depth required). Upper bound: energy dissipation at the break is not modelled.',
  );

  return (
    <div className="glass-panel p-4 relative overflow-hidden flex flex-col justify-between">
      {/* Header */}
      <h3 className="text-[10px] font-medium tracking-widest text-white/50 mb-2 uppercase relative z-10 flex items-center">
        <Zap size={11} className="mr-1.5 shrink-0 text-yellow-400" />
        {t('energyCard.label', 'Energy')}
      </h3>

      {/* Value block */}
      <div className="relative z-10 mt-1 flex flex-col gap-2">
        {/* kW/m */}
        <div title={energyTooltip}>
          {energyKw != null ? (
            <div className="flex items-end mb-0.5">
              <span className="text-4xl font-bold leading-none tabular-nums text-yellow-300">
                {energyKw.toFixed(2)}
              </span>
              <span className="text-lg ml-1 mb-1 font-medium">kW/m</span>
            </div>
          ) : (
            <div className="flex items-end mb-0.5">
              <span className="text-4xl font-bold leading-none text-white/20">—</span>
              <span className="text-lg ml-1 mb-1 font-medium text-white/20">kW/m</span>
            </div>
          )}
          <p className="text-[10px] text-white/40 leading-tight">
            {t('energyCard.source', 'Komar-Gaughan Hb · Cg(T,d)')}
          </p>
        </div>

        {/* Consistency bar */}
        {consistencyResult ? (
          <ConsistencyBar result={consistencyResult} />
        ) : (
          <div className="text-[11px] text-white/30">
            {t('energyCard.noConsistencyData', 'Consistency unavailable')}
          </div>
        )}
      </div>

      {/* Background icon */}
      <Zap className="absolute bottom-2 right-3 text-white/5" size={48} />
    </div>
  );
}

export default EnergyConsistencyCard;
