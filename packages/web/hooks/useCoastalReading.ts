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
import { nearshoreTransform, komarGaughanBreakerHeight, shoreNormalFromDepthGradient, incidentAngleFromDirections } from '@seame/core';
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
  seaLevelHeight?: number;   // m (sea_level_height_msl from Open-Meteo; nullable)
}

export interface CoastalReading {
  /**
   * Shoaled wave height at the resolved bathymetry depth (m).
   * = nearshoreTransform(H0, T, d).H
   * Useful for the heatmap layer and as a cross-check against HBreaker.
   * NOT the height at the actual break — Terrarium never resolves surf-zone depths.
   */
  HShoaled: number;
  /**
   * Komar-Gaughan (1976) breaker height estimate (m).
   * = 0.39 · g^0.2 · (T · H0²)^0.4
   * Requires no local depth — useful precisely when bathymetry cannot resolve the surf zone.
   * Caveats: empirical (gently-sloping plane beaches); no refraction or diffraction; Hb is
   * significant breaker height, NOT face height — face height is a separate decision.
   * Use for the Coastal Break card display and waveScaleLabel.
   */
  HBreaker: number;
  /**
   * Which method produced the primary displayed height.
   * 'komar-gaughan': HBreaker is the display value (depth resolved too deep to shoal).
   * 'shoaling': HShoaled is the display value (depth resolves genuinely shallow).
   * Currently always 'komar-gaughan' because Terrarium z10 never resolves surf-zone depths.
   * The shoaling path remains for the map layer and as a cross-check.
   */
  method: 'komar-gaughan' | 'shoaling';
  /** @deprecated Use HShoaled. Kept for backwards compatibility with map layers. */
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

  // Extract tide offset from conditions
  const tideOffset = conditions?.seaLevelHeight ?? 0;

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

        // Apply tide offset to depth (same as map layer does)
        // GEBCO depth is positive-down; sea_level_height_msl is MSL deviation.
        // Higher water → deeper → d_eff = d + tide.
        const effectiveDepth = centreDepth + tideOffset;

        if (!isFinite(effectiveDepth) || effectiveDepth <= 0 || effectiveDepth >= DEEP_CUTOFF) {
          setReading(null);
          return;
        }
        // Phase 4: Compute incident angle from swell direction + shore normal, enable refraction
        const theta0Deg = incidentAngleFromDirections(conditions?.swellDirection ?? 0, shoreNormalDeg);
        const result  = nearshoreTransform(H0, T, effectiveDepth, theta0Deg, true);
        const HBreaker = komarGaughanBreakerHeight(H0, T);
        // Log both heights so the divergence between shoaling and K-G is always visible.
        // Silence with ?coastalReadingDebug omitted; full output at ?coastalReadingDebug=1.
        if (dbg) {
          console.log('[CoastalReading][heights]', {
            location: `${spotLat.toFixed(4)},${spotLon.toFixed(4)}`,
            H0: H0.toFixed(3), T: T.toFixed(1), rawDepth: centreDepth.toFixed(1), effectiveDepth: effectiveDepth.toFixed(1), tideOffset: tideOffset.toFixed(3),
            HShoaled:  result.H.toFixed(3),
            HBreaker:  HBreaker.toFixed(3),
            Ks:        result.Ks.toFixed(4),
            'KG/Shoal': (HBreaker / result.H).toFixed(3),
            method:    'komar-gaughan',
          });
        }
        setReading({
          HShoaled:    result.H,
          HBreaker,
          method:      'komar-gaughan',
          HFinal:      result.H,  // backwards compat for map layer
          Ks:          result.Ks,
          Kr:          result.Kr,
          breaking:    result.breaking,
          breakingCap: result.breakingCap,
          H0,
          T,
          d:           effectiveDepth,  // Store effective depth (includes tide)
          shoreNormalDeg,
        });
      })
      .catch(() => {
        if (!ignore) setReading(null);
      });

    return () => { ignore = true; };
  }, [spotLat, spotLon, H0, T, tideOffset]);  // include tideOffset in deps

  return reading;
}
