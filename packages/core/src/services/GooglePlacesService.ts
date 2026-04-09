/**
 * GooglePlacesService — Marina booking enrichment via Google Places API
 *
 * Given a marina's name + lat/lon, look up its public business details
 * (phone, website, rating, opening hours) so the SeaYou map popup can show
 * a "Call to Book" CTA right where the skipper taps the harbour pin.
 *
 * Two-step Places API flow (legacy v1 endpoints):
 *   1. Find Place from Text — narrows by name + location bias to get a place_id
 *   2. Place Details        — fetches the rich business fields for that place_id
 *
 * IMPORTANT — API key handling:
 *   This service is part of @seame/core which is compiled by `tsc` (NOT Vite),
 *   so `import.meta.env.*` would silently return undefined at runtime when this
 *   file is consumed via the workspace symlink. The caller (the web package)
 *   reads `import.meta.env.VITE_GOOGLE_PLACES_API_KEY` and passes it in as a
 *   parameter — that way the key still lives in the .env file but the core
 *   package stays platform-agnostic.
 *
 * CORS note:
 *   Google's legacy Places web service does not officially support browser
 *   CORS. If the host environment blocks the request, add a Vite proxy entry
 *   in `packages/web/vite.config.ts` (similar to the existing Open-Meteo
 *   proxies) and pass that proxy URL as the optional `apiBase` argument.
 *
 * Phase 8 — Pro Navigation Engine (Marina Booking)
 */

import { deduplicatedFetch } from '../utils/requestDeduplication';

// ─── Types ───

export interface MarinaOpeningHours {
  open_now?: boolean;
  weekday_text?: string[];
}

export interface MarinaDetails {
  /** Google's place_id — useful if the caller wants to deep-link to Maps */
  placeId?: string;
  /** Marina's official name as Google has it */
  name?: string;
  /** E.164-friendly local phone string ready for `tel:` href */
  formatted_phone_number?: string;
  /** International form (with +country code) */
  international_phone_number?: string;
  /** Marina's official website URL */
  website?: string;
  /** 0..5 average rating */
  rating?: number;
  /** Total number of reviews backing the rating */
  user_ratings_total?: number;
  /** Opening hours block */
  opening_hours?: MarinaOpeningHours;
  /** Resolved address as Google formats it */
  formatted_address?: string;
}

interface FindPlaceResponse {
  status: string;
  candidates?: Array<{
    place_id: string;
    name?: string;
  }>;
  error_message?: string;
}

interface PlaceDetailsResponse {
  status: string;
  result?: {
    place_id?: string;
    name?: string;
    formatted_phone_number?: string;
    international_phone_number?: string;
    website?: string;
    rating?: number;
    user_ratings_total?: number;
    opening_hours?: MarinaOpeningHours;
    formatted_address?: string;
  };
  error_message?: string;
}

// ─── Constants ───

const DEFAULT_API_BASE = 'https://maps.googleapis.com/maps/api/place';
/** Radius (m) of the location bias circle around the supplied marina coords */
const LOCATION_BIAS_RADIUS_M = 1500;

// ─── Helpers ───

function buildFindPlaceUrl(
  apiBase: string,
  marinaName: string,
  lat: number,
  lon: number,
  apiKey: string,
): string {
  const params = new URLSearchParams({
    input: marinaName,
    inputtype: 'textquery',
    locationbias: `circle:${LOCATION_BIAS_RADIUS_M}@${lat},${lon}`,
    fields: 'place_id,name',
    key: apiKey,
  });
  return `${apiBase}/findplacefromtext/json?${params.toString()}`;
}

function buildDetailsUrl(apiBase: string, placeId: string, apiKey: string): string {
  const params = new URLSearchParams({
    place_id: placeId,
    fields: [
      'place_id',
      'name',
      'formatted_phone_number',
      'international_phone_number',
      'website',
      'rating',
      'user_ratings_total',
      'opening_hours',
      'formatted_address',
    ].join(','),
    key: apiKey,
  });
  return `${apiBase}/details/json?${params.toString()}`;
}

// ─── Public API ───

/**
 * Fetch enriched marina details from Google Places.
 *
 * @param lat         Marina latitude (decimal degrees)
 * @param lon         Marina longitude (decimal degrees)
 * @param marinaName  Marina display name (used for the text query)
 * @param apiKey      Google Places API key (passed in by the web caller)
 * @param apiBase     Optional base URL — pass a Vite proxy path here if CORS
 *                    blocks the direct request. Defaults to Google's host.
 * @returns           MarinaDetails on success, `null` if the marina was not
 *                    found OR if the API key is missing / blocked.
 */
export async function fetchMarinaDetails(
  lat: number,
  lon: number,
  marinaName: string,
  apiKey: string,
  apiBase: string = DEFAULT_API_BASE,
): Promise<MarinaDetails | null> {
  if (!apiKey) {
    console.warn('[GooglePlacesService] No API key supplied — skipping lookup');
    return null;
  }
  if (!marinaName || marinaName.trim().length === 0) {
    console.warn('[GooglePlacesService] No marina name supplied — skipping lookup');
    return null;
  }

  try {
    // Step 1 — Find Place from Text
    const findUrl = buildFindPlaceUrl(apiBase, marinaName, lat, lon, apiKey);
    const findResp = await deduplicatedFetch<FindPlaceResponse>(
      findUrl,
      { method: 'GET' },
      { ttl: 60_000, logRetries: false },
    );

    if (findResp.status !== 'OK' || !findResp.candidates || findResp.candidates.length === 0) {
      if (findResp.status && findResp.status !== 'ZERO_RESULTS') {
        console.warn(
          `[GooglePlacesService] Find Place failed for "${marinaName}": ${findResp.status} ${findResp.error_message ?? ''}`,
        );
      }
      return null;
    }

    const candidate = findResp.candidates[0];
    const placeId = candidate.place_id;
    if (!placeId) return null;

    // Step 2 — Place Details
    const detailsUrl = buildDetailsUrl(apiBase, placeId, apiKey);
    const detailsResp = await deduplicatedFetch<PlaceDetailsResponse>(
      detailsUrl,
      { method: 'GET' },
      { ttl: 5 * 60_000, logRetries: false },
    );

    if (detailsResp.status !== 'OK' || !detailsResp.result) {
      console.warn(
        `[GooglePlacesService] Place Details failed for "${marinaName}": ${detailsResp.status} ${detailsResp.error_message ?? ''}`,
      );
      return null;
    }

    const r = detailsResp.result;
    return {
      placeId: r.place_id,
      name: r.name,
      formatted_phone_number: r.formatted_phone_number,
      international_phone_number: r.international_phone_number,
      website: r.website,
      rating: r.rating,
      user_ratings_total: r.user_ratings_total,
      opening_hours: r.opening_hours,
      formatted_address: r.formatted_address,
    };
  } catch (err) {
    console.warn('[GooglePlacesService] Lookup failed:', err);
    return null;
  }
}

/**
 * Build a `tel:` URI from a possibly-formatted phone number.
 * Strips spaces, dashes and parentheses but keeps the leading "+".
 */
export function toTelHref(phone: string | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, '');
  if (cleaned.length === 0) return null;
  return `tel:${cleaned}`;
}
