/**
 * DistanceMatrixService — driving ETA via our /api/distance-matrix proxy
 *
 * Returns driving time + distance from an origin to a destination. Used by the
 * CoastsMarinasView "Drive" badge so users can see how long it takes to reach
 * each marina by car (vs. the straight-line "Distance" and boat-ETA cubes).
 *
 * Why a proxy?
 *   Google's Distance Matrix Web Service is a SERVER-ONLY API — it does not
 *   send CORS headers, so direct browser calls are blocked in production.
 *   The proxy is a Vercel Serverless Function at `packages/web/api/distance-matrix.ts`
 *   that injects the API key from the GOOGLE_PLACES_API_KEY env var and returns
 *   a CORS-friendly JSON payload.
 *
 * Local dev: run `vercel dev` to exercise the serverless function, or the
 * badge will silently stay hidden (graceful degradation).
 */

import { deduplicatedFetch } from '../utils/requestDeduplication';

export interface DriveEstimate {
  /** Driving duration in minutes (rounded). */
  driveMinutes: number;
  /** Driving distance in kilometers (one decimal precision). */
  driveKm: number;
}

interface ProxyResponse {
  driveMinutes?: number;
  driveKm?: number;
  error?: string;
}

/**
 * Fetch driving time + distance from (originLat, originLng) to
 * (destLat, destLng) via the server-side proxy.
 *
 * Returns `null` on any failure (proxy unreachable, ZERO_RESULTS, land-to-island
 * requiring ferry, missing server key, etc.) so the caller can simply hide the
 * badge without special-casing errors.
 *
 * @param originLat  User latitude  (decimal degrees)
 * @param originLng  User longitude (decimal degrees)
 * @param destLat    Marina latitude  (decimal degrees)
 * @param destLng    Marina longitude (decimal degrees)
 * @param proxyBase  Optional override (defaults to same-origin `/api/distance-matrix`).
 */
export async function fetchDriveEstimate(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  proxyBase: string = '/api/distance-matrix',
): Promise<DriveEstimate | null> {
  const params = new URLSearchParams({
    origin_lat: String(originLat),
    origin_lng: String(originLng),
    dest_lat: String(destLat),
    dest_lng: String(destLng),
  });

  try {
    const data = await deduplicatedFetch<ProxyResponse>(
      `${proxyBase}?${params.toString()}`,
      undefined,
      // Driving estimates are stable for this OD pair — cache 10 min client-side
      // on top of the edge cache the proxy sets via Cache-Control.
      { ttl: 600_000, logRetries: false },
    );

    if (
      data &&
      typeof data.driveMinutes === 'number' &&
      typeof data.driveKm === 'number'
    ) {
      return { driveMinutes: data.driveMinutes, driveKm: data.driveKm };
    }

    if (data?.error) {
      console.warn('[DistanceMatrixService] Proxy returned error:', data.error);
    }
    return null;
  } catch (err) {
    console.warn('[DistanceMatrixService] fetchDriveEstimate failed:', err);
    return null;
  }
}
