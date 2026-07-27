/**
 * useCoastalReading — per-spot Coastal Dynamics reading (Phase 5.1)
 *
 * Computes the engine's H_final breaking-wave height for a single spot using
 * @seame/core's nearshoreTransform — the SAME function the map uses per cell —
 * wired to the spot's depth via fetchDepthAtPoint.
 *
 * Input policy matches CoastalDynamicsLayerML exactly (single source of truth):
 *   H0 = swellHeight > 0.1 m ? swellHeight : waveHeight
 *   T  = swellHeight > 0.1 m ? (swellPeriod > 0 ? swellPeriod : wavePeriod) : wavePeriod
 *   nearshoreTransform(H0, T, d)  — theta=0 (refraction Phase 4, not yet)
 *
 * Returns null when:
 *   - spot coords are missing
 *   - depth fetch is in-flight
 *   - depth ≤ 0 (land / intertidal)
 *   - depth ≥ 200 m (deep water — engine only renders nearshore)
 *   - H0 or T below engine minimums
 */

import { useState, useEffect } from 'react';
import { nearshoreTransform, shoreNormalFromDepthGradient } from '@seame/core';
import { fetchNearshoreDepthWithGradient } from '../utils/bathymetry/TerrariumBathymetry';

// Mirrors the map's constants (CoastalDynamicsLayerML.tsx)
const SWELL_FLOOR  = 0.1;   // m — same as map's SWELL_FLOOR
const MIN_H0       = 0.05;  // m — below this, engine discards
const MIN_T        = 1;     // s
const DEEP_CUTOFF  = 200;   // m — engine only renders < 200 m
const DEPTH_ZOOM   = 10;    // same as map at nearshore zoom

export interface CoastalReadingInputs {
  /** Current wave/swell conditions — from weatherData.current */
  swellHeight: number;       // m
  swellPeriod: number;       // s
  swellDirection: number;    // degrees (meteorological FROM)
  waveHeight: number;        // m (fallback when swell negligible)
  wavePeriod: number;        // s (fallback)
  waveDirection?: number;    // degrees (fallback direction)
}

export interface CoastalReading {
  /** Estimated breaking-wave height at the spot depth (m). Equal to γ·d when breaking. */
  HFinal: number;
  /** Shoaling coefficient applied. */
  Ks: number;
  /** Refraction coefficient (1.0 until Phase 4). */
  Kr: number;
  /** True when depth-limited breaking condition H > γ·d was triggered. */
  breaking: boolean;
  /** Breaking-wave cap γ·d at this depth (m). */
  breakingCap: number;
  /** Deep-water H0 used as input. */
  H0: number;
  /** Period (s) used as input. */
  T: number;
  /** Depth (m, +down) at the spot. */
  d: number;
  /** Offshore compass bearing derived from bathymetry depth gradient (degrees [0,360)), or null when gradient is ambiguous. */
  shoreNormalDeg: number | null;
}

/**
 * Derive H0, T following the map's exact input policy.
 * Exported so Dashboard can call it directly without the hook overhead.
 */
/**
 * MODAL PARTITION CAVEAT (measured P6.2.15, 2026-07-25):
 *
 * Open-Meteo's `swell_wave_height` is a modal estimate, NOT an energy-conserving partition.
 * Verified: sqrt(swell_wave_height² + wind_wave_height²) misses the provider's own `wave_height`
 * (total) by a mean of 0.06–0.25 m and up to 1.56 m at individual timesteps across 9 measured
 * locations. The partition is internally inconsistent with the total.
 *
 * Consequence: when `swellHeight > SWELL_FLOOR` (which is 100% of hours at all measured ocean
 * spots), production displays and computes with a modal swell estimate whose physical meaning is
 * provider-defined and not comparable to buoy total-Hs measurements.
 *
 * OPEN PRODUCT DECISION: swell vs total H0 is not a calibration choice — it is a product choice
 * about what the user should see. Surfers want swell height; mariners and beachgoers want total
 * sea state. The persona routing could express this distinction explicitly.
 *
 * This comment does NOT change any behaviour. It documents a measurement result so it is visible
 * to product-facing code rather than buried in a gitignored calibration report.
 */
export function deriveSwellInputs(c: CoastalReadingInputs): { H0: number; T: number } {
  const swDominant = c.swellHeight > SWELL_FLOOR;
  const H0 = swDominant ? c.swellHeight : c.waveHeight;
  const T  = swDominant
    ? (c.swellPeriod > 0 ? c.swellPeriod : c.wavePeriod)
    : c.wavePeriod;
  return { H0, T };
}

export function useCoastalReading(
  spotLat: number | null | undefined,
  spotLon: number | null | undefined,
  conditions: CoastalReadingInputs | null | undefined,
): CoastalReading | null {
  const [reading, setReading] = useState<CoastalReading | null>(null);

  // Extract primitive scalars so deps are stable numbers, not object identity.
  // When conditions is null (no data yet) → H0=0, T=0 → fails MIN checks → null path.
  const { H0, T } = conditions ? deriveSwellInputs(conditions) : { H0: 0, T: 0 };

  useEffect(() => {
    if (spotLat == null || spotLon == null ||
        !isFinite(H0) || H0 < MIN_H0 ||
        !isFinite(T)  || T  < MIN_T) {
      setReading(null);
      return;
    }

    // Clear stale reading immediately — return null while the new fetch is in-flight
    // rather than showing the previous spot's values.
    setReading(null);

    let ignore = false;
    // Capture coords at request time for stale-response guard
    const reqLat = spotLat;
    const reqLon = spotLon;

    const dbg = typeof window !== 'undefined' && window.location.search.includes('coastalReadingDebug=1');

    fetchNearshoreDepthWithGradient(spotLat, spotLon, DEPTH_ZOOM)
      .then(({ centreDepth, gradEast, gradNorth }) => {
        if (ignore || spotLat !== reqLat || spotLon !== reqLon) return;
        const shoreNormalDeg = (isFinite(gradEast) && isFinite(gradNorth))
          ? shoreNormalFromDepthGradient(gradEast, gradNorth)
          : null;
        const dbgWQ = typeof window !== 'undefined' && window.location.search.includes('windQualityDebug=1');
        if (dbg) {
          console.log('[CoastalReading][depth]', {
            inLat: spotLat, inLon: spotLon, rawDepth: centreDepth,
            gradEast, gradNorth, shoreNormalDeg,
            note: !isFinite(centreDepth) ? 'NaN/no-tile' : centreDepth <= 0 ? 'land' : centreDepth >= DEEP_CUTOFF ? 'deep' : 'surf-zone',
          });
        }
        if (!isFinite(centreDepth) || centreDepth <= 0 || centreDepth >= DEEP_CUTOFF) {
          setReading(null);
          return;
        }
        const result = nearshoreTransform(H0, T, centreDepth);
        setReading({
          HFinal:      result.H,
          Ks:          result.Ks,
          Kr:          result.Kr,
          breaking:    result.breaking,
          breakingCap: result.breakingCap,
          H0,
          T,
          d:           centreDepth,
          shoreNormalDeg,
        });
      })
      .catch(() => {
        if (!ignore) setReading(null);
      });

    return () => { ignore = true; };
  }, [spotLat, spotLon, H0, T]);  // primitive deps — no object-identity churn

  return reading;
}
