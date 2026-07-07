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

import { useState, useEffect, useRef } from 'react';
import { nearshoreTransform } from '@seame/core';
import { fetchNearshoreDepth } from '../utils/bathymetry/TerrariumBathymetry';

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
}

/**
 * Derive H0, T following the map's exact input policy.
 * Exported so Dashboard can call it directly without the hook overhead.
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

  // Track the last inputs to avoid redundant fetches
  const lastKey = useRef<string>('');

  useEffect(() => {
    if (spotLat == null || spotLon == null || !conditions) {
      setReading(null);
      return;
    }

    const { H0, T } = deriveSwellInputs(conditions);

    if (!isFinite(H0) || H0 < MIN_H0 || !isFinite(T) || T < MIN_T) {
      setReading(null);
      return;
    }

    // Deduplicate: skip re-fetch when coords + inputs are unchanged
    const key = `${spotLat.toFixed(4)},${spotLon.toFixed(4)},${H0.toFixed(3)},${T.toFixed(2)}`;
    if (key === lastKey.current) return;
    lastKey.current = key;

    let cancelled = false;

    const dbg = typeof window !== 'undefined' && window.location.search.includes('coastalReadingDebug=1');

    fetchNearshoreDepth(spotLat, spotLon, DEPTH_ZOOM)
      .then(d => {
        if (cancelled) return;
        if (dbg) {
          console.log('[CoastalReading][depth]', {
            inLat: spotLat, inLon: spotLon, rawDepth: d,
            note: !isFinite(d) ? 'NaN/no-tile' : d <= 0 ? 'land' : d >= DEEP_CUTOFF ? 'deep' : 'surf-zone',
          });
        }
        if (!isFinite(d) || d <= 0 || d >= DEEP_CUTOFF) {
          setReading(null);
          return;
        }
        const result = nearshoreTransform(H0, T, d);
        setReading({
          HFinal:      result.H,
          Ks:          result.Ks,
          Kr:          result.Kr,
          breaking:    result.breaking,
          breakingCap: result.breakingCap,
          H0,
          T,
          d,
        });
      })
      .catch(() => {
        if (!cancelled) setReading(null);
      });

    return () => { cancelled = true; };
  }, [spotLat, spotLon, conditions]);

  return reading;
}
