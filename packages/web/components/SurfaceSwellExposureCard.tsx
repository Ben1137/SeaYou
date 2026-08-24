/**
 * SurfaceSwellExposureCard — DIVER / SNORKEL modal only.
 *
 * Honest replacement for the surf EnergyConsistencyCard when the selected
 * persona is DIVER. It reports the diver-relevant thing that IS computable
 * oracle-free: SURFACE swell exposure — a period-weighted measure of how much
 * swell energy is arriving at the surface, which drives entry/exit difficulty
 * and boat comfort.
 *
 * HONESTY (non-negotiable — this feeds a get-in-the-water decision):
 *   • It is SURFACE swell exposure, NOT bottom surge. Bottom orbital velocity
 *     depends on local depth (u_b = πH / (T·sinh(kd))); no such computation
 *     exists oracle-free, and the only available depth is coarse/often-null
 *     bathymetry. So this card claims EXACTLY surface exposure and carries an
 *     explicit scope note saying it is not the surge felt at depth. See
 *     docs/phase-b/B6-diver-energy-card.md for the decision + physics ceiling.
 *   • POLARITY IS INVERTED vs the surf energy card: HIGH exposure = CAUTION
 *     (amber → rose), LOW = calm (teal). A full/warm bar reads "rough surface /
 *     harder entry", never "good".
 *   • NO steadiness bar. Steadiness of swell is a surf signal; a steady-but-large
 *     swell is still hazardous to a diver, so a positive "Steady" readout would
 *     mislead. Steadiness stays on the surf cards (EnergyConsistencyCard), which
 *     this component does not touch.
 *
 * Computed oracle-free from swell height + swell period via surfPowerKwPerM
 * (@seame/core), evaluated at deep water (period-weighted). No nearshore/oracle
 * edit — @seame/core is imported read-only.
 *
 * NOTE (wording + thresholds are provisional): the headline label, the scope
 * note, and the exposure band thresholds below are placeholder-but-reasonable
 * and are Ben's call to confirm/adjust on real-login review.
 */

import React from 'react';
import { Waves } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { surfPowerKwPerM, combineSwellPartitions, type SwellPartition } from '@seame/core';
import type { MarineWeatherData } from '@seame/core';
// DEV-ONLY: build-time gated (import.meta.env.DEV) — tree-shaken from prod. See src/dev/devSwellOverride.ts.
import { readDevSwellOverride } from '../src/dev/devSwellOverride';

// ─── Provisional tuning (Ben confirms on review) ───────────────────────────────

/** kW/m of surface swell power that fills the exposure bar to 100%. */
const EXPOSURE_CEIL_KW = 30;

/** Exposure bands on period-weighted surface swell power P (kW/m). Half-open [low, high). */
type ExposureTone = 'calm' | 'moderate' | 'rough';
interface ExposureBand {
  low: number;
  high: number;
  key: 'levelCalm' | 'levelModerate' | 'levelRough' | 'levelSevere';
  fallback: string;
  tone: ExposureTone;
}
const EXPOSURE_BANDS: ExposureBand[] = [
  { low: 0,  high: 3,        key: 'levelCalm',     fallback: 'Calm',     tone: 'calm'     },
  { low: 3,  high: 12,       key: 'levelModerate', fallback: 'Moderate', tone: 'moderate' },
  { low: 12, high: 30,       key: 'levelRough',    fallback: 'Rough',    tone: 'rough'    },
  { low: 30, high: Infinity, key: 'levelSevere',   fallback: 'Severe',   tone: 'rough'    },
];

function classifyExposure(pKw: number): ExposureBand {
  const p = Math.max(0, pKw);
  for (const b of EXPOSURE_BANDS) {
    if (p >= b.low && p < b.high) return b;
  }
  return EXPOSURE_BANDS[EXPOSURE_BANDS.length - 1];
}

// Inverted polarity vs the steadiness bar: high exposure = warm/caution.
const TONE_BAR: Record<ExposureTone, string> = {
  calm: 'bg-teal-400',
  moderate: 'bg-amber-400',
  rough: 'bg-rose-400',
};
const TONE_TEXT: Record<ExposureTone, string> = {
  calm: 'text-teal-300',
  moderate: 'text-amber-300',
  rough: 'text-rose-300',
};

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SurfaceSwellExposureCardProps {
  weatherData: MarineWeatherData;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SurfaceSwellExposureCard({ weatherData }: SurfaceSwellExposureCardProps) {
  const { t } = useTranslation();

  // Surface swell inputs — read directly from current conditions (does NOT depend
  // on coastalReading, which is null on most spots). Fallback below when absent.
  let swellHeight: number | null = weatherData.current?.swellHeight ?? null;
  let swellPeriod: number | null = weatherData.current?.swellPeriod ?? null;
  let swellDirection: number | null = weatherData.current?.swellDirection ?? null;
  let secondarySwellHeight: number | null = weatherData.current?.secondarySwellHeight ?? null;
  let secondarySwellPeriod: number | null = weatherData.current?.secondarySwellPeriod ?? null;
  let secondarySwellDirection: number | null = weatherData.current?.secondarySwellDirection ?? null;

  // DEV-only override for deterministic screenshots. `import.meta.env.DEV` is
  // statically false in prod → this branch is dead-code-eliminated and the
  // import above is tree-shaken out. Never runs in the deployed bundle.
  if (import.meta.env.DEV) {
    const ov = readDevSwellOverride();
    if (ov) {
      swellHeight = ov.swellHeight;
      swellPeriod = ov.swellPeriod;
    }
  }

  // Build swell partitions (primary + secondary, nullable)
  const primaryPartition: SwellPartition | null =
    swellHeight != null && swellHeight > 0 && swellPeriod != null && swellPeriod > 0
      ? { height: swellHeight, period: swellPeriod, directionDeg: swellDirection ?? undefined }
      : null;

  const secondaryPartition: SwellPartition | null =
    secondarySwellHeight != null && secondarySwellHeight > 0 && secondarySwellPeriod != null && secondarySwellPeriod > 0
      ? { height: secondarySwellHeight, period: secondarySwellPeriod, directionDeg: secondarySwellDirection ?? undefined }
      : null;

  // Combine partitions using energy superposition (not linear addition)
  const { combinedHeight, dominant } = combineSwellPartitions([primaryPartition, secondaryPartition]);

  const available = combinedHeight > 0 && dominant != null;

  // Period-weighted surface swell power (deep water Cg0 — longer period = more energy).
  // Use the DOMINANT partition for the power calculation, not the combined height.
  const pKw = available ? surfPowerKwPerM(dominant!.height, dominant!.period, Infinity) : null;
  const band = pKw != null ? classifyExposure(pKw) : null;
  const barPct = pKw != null ? Math.min(100, (pKw / EXPOSURE_CEIL_KW) * 100) : 0;

  const levelLabel = band ? t(`surfaceExposure.${band.key}`, band.fallback) : '';
  const barColor = band ? TONE_BAR[band.tone] : 'bg-white/10';
  const textColor = band ? TONE_TEXT[band.tone] : 'text-white/40';

  const scopeNote = t(
    'surfaceExposure.scopeNote',
    'Entry/exit & boat comfort — not the surge felt at depth',
  );
  const tooltip = t(
    'surfaceExposure.tooltip',
    'Relative exposure to surface swell, period-weighted from swell height & period (longer period carries more energy). Indicates entry/exit difficulty and boat comfort at the surface — NOT the orbital surge felt at depth, which depends on local water depth.',
  );

  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-500/5 dark:bg-white/[0.04] px-4 py-3 relative overflow-hidden">
      {/* Header */}
      <h3 className="text-[10px] font-medium tracking-widest mb-2 uppercase relative z-10 flex items-center justify-between text-slate-500 dark:text-white/50">
        <span className="flex items-center">
          <Waves size={11} className="mr-1.5 shrink-0 text-teal-400" />
          {t('surfaceExposure.label', 'Surface Swell Exposure')}
        </span>
        <span className="text-[9px] font-normal normal-case tracking-normal text-slate-400 dark:text-white/30">
          {t('surfaceExposure.notScored', 'Not a score factor')}
        </span>
      </h3>

      {/* Value block */}
      <div className="relative z-10 mt-1 flex flex-col gap-2">
        {available ? (
          <div title={tooltip}>
            <div className="flex items-end mb-0.5 gap-2">
              <span className={`text-3xl font-bold leading-none tabular-nums ${textColor}`}>
                {levelLabel}
              </span>
              <span className="text-sm mb-0.5 font-medium tabular-nums text-slate-500 dark:text-white/50">
                {t('surfaceExposure.combinedBasis', '{{combined}} m combined', {
                  combined: combinedHeight.toFixed(1),
                })}
              </span>
            </div>

            {/* Partition breakdown (modal / indicative) */}
            <div className="text-[9px] leading-snug text-slate-400 dark:text-white/35 mb-1.5 space-y-0.5">
              {primaryPartition && (
                <div>
                  <span className="text-slate-500 dark:text-white/40">Primary:</span> {primaryPartition.height.toFixed(1)} m @ {primaryPartition.period.toFixed(1)} s
                  {primaryPartition.directionDeg != null && <span className=" ml-1">↑ {Math.round(primaryPartition.directionDeg)}°</span>}
                </div>
              )}
              {secondaryPartition && (
                <div>
                  <span className="text-slate-500 dark:text-white/40">Secondary:</span> {secondaryPartition.height.toFixed(1)} m @ {secondaryPartition.period.toFixed(1)} s
                  {secondaryPartition.directionDeg != null && <span className=" ml-1">↑ {Math.round(secondaryPartition.directionDeg)}°</span>}
                </div>
              )}
              <div className="text-[8px] italic text-white/25">
                {t('surfaceExposure.partitionNote', 'Modal estimates (indicative only)', {})}
              </div>
            </div>

            <p className="text-[10px] leading-tight text-slate-500 dark:text-white/40 mb-2">
              {scopeNote}
            </p>
            {/* Inverted-polarity exposure bar: HIGH swell = fuller/warmer = caution. */}
            <div className="flex items-center justify-between mb-1">
              <span className={`text-[10px] font-semibold tabular-nums ${textColor}`}>
                {t('surfaceExposure.barCaption', 'Surface exposure')}
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
        ) : (
          <div>
            <div className="flex items-end mb-0.5">
              <span className="text-3xl font-bold leading-none text-white/20">—</span>
            </div>
            <p className="text-[10px] leading-tight text-slate-500 dark:text-white/40 mb-1">
              {scopeNote}
            </p>
            <div className="text-[11px] text-white/30">
              {t('surfaceExposure.unavailable', 'Swell data unavailable')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SurfaceSwellExposureCard;
