import { useEffect, useMemo } from 'react';
import { calculateDistanceKm } from '@seame/core';
import { useAlertConfig } from '../src/contexts/AlertContext';
import { useCoastalReading, type CoastalReading, type CoastalReadingInputs } from './useCoastalReading';

const STORAGE_KEY = 'seayou_free_coastal_probe_v1';
const TOLERANCE_KM = 2; // "same spot" tolerance
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface FreeProbeRecord {
  lat: number;
  lon: number;
  ts: number;
}

function readRecord(): FreeProbeRecord | null {
  try {
    const r = localStorage.getItem(STORAGE_KEY);
    return r ? (JSON.parse(r) as FreeProbeRecord) : null;
  } catch {
    return null;
  }
}

function writeRecord(rec: FreeProbeRecord): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rec));
  } catch {
    /* soft limit — ignore */
  }
}

export interface UseCoastalReadingGatedResult {
  reading: CoastalReading | null;
  isBlocked: boolean;
  isFree: boolean;
}

/**
 * Free tier: home spot & live geolocation unlimited; one arbitrary spot per 7 days.
 * NOTE: this is a SOFT limit (client localStorage — clearable/incognito-bypassable). It's
 * upsell friction, not entitlement enforcement. Hard enforcement would be server-side (out of scope).
 */
export function useCoastalReadingGated(
  spotLat: number | null | undefined,
  spotLon: number | null | undefined,
  conditions: CoastalReadingInputs | null | undefined,
  isCurrentGeolocation: boolean,
): UseCoastalReadingGatedResult {
  const { subscriptionTier, homeLat, homeLon } = useAlertConfig();
  const isFree = subscriptionTier !== 'premium';

  // Pure decision (reads storage but never writes during render).
  const decision = useMemo<{ blocked: boolean; charge: FreeProbeRecord | null }>(() => {
    if (!isFree || spotLat == null || spotLon == null) return { blocked: false, charge: null };
    if (isCurrentGeolocation) return { blocked: false, charge: null };
    if (
      homeLat != null &&
      homeLon != null &&
      calculateDistanceKm(spotLat, spotLon, homeLat, homeLon) <= TOLERANCE_KM
    ) {
      return { blocked: false, charge: null };
    }
    const rec = readRecord();
    const now = Date.now();
    if (!rec || now - rec.ts >= WEEK_MS) {
      return { blocked: false, charge: { lat: spotLat, lon: spotLon, ts: now } };
    }
    if (calculateDistanceKm(spotLat, spotLon, rec.lat, rec.lon) <= TOLERANCE_KM) {
      return { blocked: false, charge: null };
    }
    return { blocked: true, charge: null };
  }, [isFree, spotLat, spotLon, isCurrentGeolocation, homeLat, homeLon]);

  // Persist the "charge" as an effect, not during render.
  useEffect(() => {
    if (decision.charge) writeRecord(decision.charge);
  }, [decision.charge]);

  // Only fetch/compute when allowed → blocked users trigger no PMTiles fetch.
  const reading = useCoastalReading(
    decision.blocked ? null : spotLat,
    decision.blocked ? null : spotLon,
    decision.blocked ? null : conditions,
  );

  return { reading: decision.blocked ? null : reading, isBlocked: decision.blocked, isFree };
}
