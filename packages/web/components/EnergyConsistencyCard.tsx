/**
 * EnergyConsistencyCard — Wave Energy + Consistency metric card.
 *
 * Energy: wave power per metre of wave crest (kW/m).
 *
 * Under linear wave theory, P = (1/16)·ρ·g·H²·Cg is depth-invariant along the
 * shoaling path: H = H0·Ks and Ks² = Cg0/Cg, so H²·Cg = H0²·Cg0 = const.
 * Evaluating at d=∞ (deep water, Cg = Cg0) gives the same number as any finite
 * shoaling depth and is the simplest correct representation of the arriving flux.
 *
 * The BREAKING source therefore computes P = surfPowerKwPerM(H0, T, Infinity) —
 * equal to SWELL by construction.  K-G HBreaker is intentionally not used here:
 * P(HKG, d_break) ≈ 1.30× the arriving flux because KG > Airy by ~1.14, and
 * power scales as H². That surplus is an empirical correction factor, not a
 * physical energy gain that the wave carries to shore. Energy DENSITY rises in
 * shallow water; energy FLUX is conserved until breaking dissipates it.
 *
 * Consistency: CoV of nearshoreTransform().H over STEADINESS_WINDOW_H hours.
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
 * Which offshore height feeds the energy calculation.
 *
 * All three options evaluate at deep-water Cg = Cg0 because wave energy flux is
 * depth-invariant: P = H0²·Cg0 = const along the shoaling path until breaking.
 * Proven algebraically and in unit tests (P5.5.6).
 *
 * BREAKING: H0 from deriveSwellInputs (the same offshore height that feeds the
 *           nearshore transform). Evaluated at d=Infinity (Cg = Cg0).
 *           THIS IS NOT A DISTINCT COMPUTATION from SWELL. When swell dominates
 *           (swellHeight > SWELL_FLOOR = 0.1 m, which is 100% of ocean hours),
 *           deriveSwellInputs selects swellHeight as H0, so BREAKING = SWELL
 *           exactly. The label "Arriving flux · H₀ · Cg₀" is retained for card
 *           clarity; do not read it as implying different physics.
 * SWELL:    swell_wave_height from the API directly (modal estimate).
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
  /**
   * Presentation context. 'dashboard' (default) = the glass-panel card on the
   * Conditions Grid (unchanged). 'modal' = restyled to sit inside
   * ScoreBreakdownModal (solid modal-native panel, dual-mode text). Presentation
   * ONLY — identical computed values (kW/m, Steady %) in both variants.
   */
  variant?: 'dashboard' | 'modal';
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
  variant = 'dashboard',
}: EnergyConsistencyCardProps) {
  const { t } = useTranslation();
  const isModal = variant === 'modal';

  // ── Energy ────────────────────────────────────────────────────────────────
  const current = weatherData.current;
  const hourly  = weatherData.hourly;

  let H: number | null = null;
  let T: number | null = null;
  let d: number = Infinity; // deep-water fallback

  if (ENERGY_HEIGHT_SOURCE === 'BREAKING' && coastalReading) {
    // Use H0 (deep-water input) at d=Infinity.
    // Wave energy flux is depth-invariant: P = H0²·Cg0 at every depth until breaking.
    // Evaluating at d=Inf gives the same result as any shoaling depth and is the
    // correct representation of the arriving flux. K-G HBreaker is used for the
    // height card and scale label; it is not used for energy (KG > Airy by ~1.14,
    // so P(HKG) ≈ 1.30× arriving flux — that surplus is not real energy flux).
    H = coastalReading.H0;
    T = coastalReading.T;
    d = Infinity; // deep-water Cg0 = depth-invariant arriving flux
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
    'Wave energy flux (kW/m) — power per metre of wave crest arriving at this location. Computed from deep-water H₀ and Cg₀; energy flux is depth-invariant under linear theory until breaking dissipates it.',
  );

  return (
    <div
      className={
        isModal
          ? 'rounded-xl border border-slate-200 dark:border-white/10 bg-slate-500/5 dark:bg-white/[0.04] px-4 py-3 relative overflow-hidden'
          : 'glass-panel p-4 relative overflow-hidden flex flex-col justify-between'
      }
    >
      {/* Header */}
      {isModal ? (
        <h3 className="text-[10px] font-medium tracking-widest mb-2 uppercase relative z-10 flex items-center justify-between text-slate-500 dark:text-white/50">
          <span className="flex items-center">
            <Zap size={11} className="mr-1.5 shrink-0 text-yellow-400" />
            {t('energyCard.label', 'Energy')}
          </span>
          <span className="text-[9px] font-normal normal-case tracking-normal text-slate-400 dark:text-white/30">
            {t('energyCard.notScored', 'Not a score factor')}
          </span>
        </h3>
      ) : (
        <h3 className="text-[10px] font-medium tracking-widest text-white/50 mb-2 uppercase relative z-10 flex items-center">
          <Zap size={11} className="mr-1.5 shrink-0 text-yellow-400" />
          {t('energyCard.label', 'Energy')}
        </h3>
      )}

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
          <p className={isModal ? 'text-[10px] leading-tight text-slate-500 dark:text-white/40' : 'text-[10px] text-white/40 leading-tight'}>
            {t('energyCard.source', 'Wave energy flux')}
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

      {/* Background icon — dashboard flourish only; omitted in the tighter modal panel. */}
      {!isModal && <Zap className="absolute bottom-2 right-3 text-white/5" size={48} />}
    </div>
  );
}

export default EnergyConsistencyCard;
