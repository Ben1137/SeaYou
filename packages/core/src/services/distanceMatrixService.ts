/**
 * DistanceMatrixService — Google Distance Matrix API wrapper
 *
 * Returns driving time + distance from an origin to a destination. Used by the
 * CoastsMarinasView "Drive" badge so users can see how long it takes to reach
 * each marina by car (vs. the straight-line "Distance" and boat-ETA cubes).
 *
 * API key handling mirrors GooglePlacesService: the caller (web package) reads
 * `import.meta.env.VITE_GOOGLE_PLACES_API_KEY` and passes it in, so this file
 * stays platform-agnostic (core is compiled by tsc, not Vite).
 *
 * API reference:
 *   https://developers.google.com/maps/documentation/distance-matrix/distance-matrix
 */

import { deduplicatedFetch } from '../utils/requestDeduplication';

export interface DriveEstimate {
  /** Driving duration in minutes (rounded). */
  driveMinutes: number;
  /** Driving distance in kilometers (one decimal precision). */
  driveKm: number;
}

interface DistanceMatrixResponse {
  status: string;
  rows?: Array<{
    elements?: Array<{
      status: string;
      duration?: { value: number; text: string };   // value in seconds
      distance?: { value: number; text: string };   // value in meters
    }>;
  }>;
}

/**
 * Fetch driving time + distance from (originLat, originLng) to
 * (destLat, destLng). Returns `null` on any failure (missing key, CORS,
 * ZERO_RESULTS, land-to-island requiring ferry, etc.).
 */
export async function fetchDriveEstimate(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  apiKey: string,
  apiBase: string = 'https://maps.googleapis.com/maps/api/distancematrix/json',
): Promise<DriveEstimate | null> {
  if (!apiKey) return null;

  const params = new URLSearchParams({
    origins: `${originLat},${originLng}`,
    destinations: `${destLat},${destLng}`,
    mode: 'driving',
    units: 'metric',
    key: apiKey,
  });

  try {
    const data = await deduplicatedFetch<DistanceMatrixResponse>(
      `${apiBase}?${params.toString()}`,
      undefined,
      // Driving estimates are stable for this OD pair — cache 10 min.
      { ttl: 600000 },
    );

    if (data.status !== 'OK') return null;
    const element = data.rows?.[0]?.elements?.[0];
    if (!element || element.status !== 'OK') return null;
    if (!element.duration || !element.distance) return null;

    return {
      driveMinutes: Math.round(element.duration.value / 60),
      driveKm: Math.round((element.distance.value / 1000) * 10) / 10,
    };
  } catch (err) {
    console.warn('[DistanceMatrixService] fetchDriveEstimate failed:', err);
    return null;
  }
}
