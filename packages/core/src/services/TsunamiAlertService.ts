/**
 * TsunamiAlertService.ts — Real-time tsunami/earthquake risk detection via GDACS (Phase 5)
 *
 * Fetches active events from the GDACS (Global Disaster Alert and Coordination System)
 * GeoJSON API and calculates proximity risk to the user's location.
 *
 * Data source: https://www.gdacs.org/
 * GDACS provides freely available disaster alert data in GeoJSON format.
 */

import { calculateDistanceKm } from '../utils/geo';

// ─── Types ───

export interface GDACSEvent {
  id: string;
  title: string;
  eventType: string;
  alertLevel: 'Green' | 'Orange' | 'Red' | string;
  magnitude: number;
  lat: number;
  lon: number;
  date: string;
  url?: string;
  country?: string;
  tsunamiFlag?: boolean;
}

export interface TsunamiRisk {
  event: GDACSEvent;
  distanceKm: number;
  riskLevel: 'HIGH' | 'MODERATE' | 'LOW';
}

// ─── GDACS GeoJSON Response Types ───

interface GDACSFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [lon, lat]
  };
  properties: {
    eventid?: number;
    eventtype?: string;
    name?: string;
    description?: string;
    htmldescription?: string;
    alertlevel?: string;
    alertscore?: number;
    severity?: { value?: number; unit?: string };
    fromdate?: string;
    todate?: string;
    url?: { report?: string };
    country?: string;
    iscurrent?: string;
    // Earthquake-specific
    Class?: string;
  };
}

interface GDACSGeoJSON {
  type: 'FeatureCollection';
  features: GDACSFeature[];
}

// ─── Constants ───

/** GDACS event feed — earthquakes (most common tsunami trigger) + tsunamis */
const GDACS_EQ_URL =
  'https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP?eventlist=EQ';
const GDACS_TS_URL =
  'https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP?eventlist=TS';

/** Risk distance thresholds in km */
const RISK_THRESHOLDS = {
  HIGH: 200,     // Within 200 km — immediate danger zone
  MODERATE: 500, // 200-500 km — advisory zone
  LOW: 1000,     // 500-1000 km — watch zone
} as const;

/** Minimum earthquake magnitude to consider for tsunami risk */
const MIN_TSUNAMI_MAGNITUDE = 5.5;

// ─── Service Functions ───

/**
 * Fetch active tsunami and earthquake events from GDACS.
 * Returns parsed events from both EQ and TS feeds.
 */
export async function fetchActiveTsunamis(): Promise<GDACSEvent[]> {
  const events: GDACSEvent[] = [];

  const fetchFeed = async (url: string, type: string): Promise<void> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`[TsunamiAlertService] ${type} feed returned ${response.status}`);
        return;
      }

      const data: GDACSGeoJSON = await response.json();

      if (!data?.features?.length) {
        console.log(`[TsunamiAlertService] No active ${type} events`);
        return;
      }

      for (const feature of data.features) {
        const props = feature.properties;
        const coords = feature.geometry?.coordinates;
        if (!coords || coords.length < 2) continue;

        const magnitude = props?.severity?.value || props?.alertscore || 0;
        const alertLevel = props?.alertlevel || 'Green';

        events.push({
          id: `${type}-${props?.eventid || Math.random().toString(36).slice(2)}`,
          title: props?.name || props?.description || `${type} Event`,
          eventType: type,
          alertLevel,
          magnitude,
          lat: coords[1],
          lon: coords[0],
          date: props?.fromdate || new Date().toISOString(),
          url: props?.url?.report,
          country: props?.country,
          tsunamiFlag: type === 'TS' || (type === 'EQ' && magnitude >= MIN_TSUNAMI_MAGNITUDE),
        });
      }

      console.log(`[TsunamiAlertService] Fetched ${data.features.length} ${type} events`);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.warn(`[TsunamiAlertService] ${type} feed timed out`);
      } else {
        console.warn(`[TsunamiAlertService] Failed to fetch ${type} feed:`, err);
      }
    }
  };

  // Fetch both feeds in parallel
  await Promise.all([
    fetchFeed(GDACS_EQ_URL, 'EQ'),
    fetchFeed(GDACS_TS_URL, 'TS'),
  ]);

  return events;
}

/**
 * Check if any events pose a tsunami risk near the user's location.
 * Filters by magnitude and distance, returns risks sorted by proximity.
 *
 * @param userLat - User's latitude
 * @param userLon - User's longitude
 * @param events  - Array of GDACS events from fetchActiveTsunamis()
 * @returns Array of TsunamiRisk objects, sorted nearest-first
 */
export function checkTsunamiRisk(
  userLat: number,
  userLon: number,
  events: GDACSEvent[],
): TsunamiRisk[] {
  const risks: TsunamiRisk[] = [];

  for (const event of events) {
    // Only consider events with tsunami potential
    if (!event.tsunamiFlag && event.magnitude < MIN_TSUNAMI_MAGNITUDE) continue;

    // Skip low-severity earthquake events without orange/red alert
    if (event.eventType === 'EQ' && event.alertLevel === 'Green' && event.magnitude < 6.0) continue;

    const distanceKm = calculateDistanceKm(userLat, userLon, event.lat, event.lon);

    if (distanceKm <= RISK_THRESHOLDS.LOW) {
      const riskLevel: TsunamiRisk['riskLevel'] =
        distanceKm <= RISK_THRESHOLDS.HIGH
          ? 'HIGH'
          : distanceKm <= RISK_THRESHOLDS.MODERATE
            ? 'MODERATE'
            : 'LOW';

      risks.push({ event, distanceKm, riskLevel });
    }
  }

  // Sort by distance (nearest first)
  risks.sort((a, b) => a.distanceKm - b.distanceKm);

  return risks;
}
