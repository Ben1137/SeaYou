/**
 * locationSearchService.ts — Google Places (New) powered location search
 *
 * Strategy (Google billing active):
 *   1. Google Places Autocomplete (New) — fast predictions as user types
 *   2. Google Place Details (New) — exact lat/lng when user selects a result
 *   3. Google Text Search (New) — fallback when Autocomplete returns nothing
 *   4. Open-Meteo geocoding — absolute last-resort when Google APIs fail
 *
 * The Google API key is read from import.meta.env.VITE_GOOGLE_PLACES_API_KEY.
 * If absent, the service gracefully degrades to Open-Meteo geocoding.
 */

import { searchLocations as openMeteoSearch } from '@seame/core';
import type { SavedLocation } from '@seame/core';

// ─── Types ───

export interface LocationSearchResult extends SavedLocation {
  /** Display subtitle (country, region, etc.) */
  subtitle?: string;
  /** Google Place ID — present when result came from Autocomplete */
  placeId?: string;
  /** True when lat/lng are not yet resolved (need Place Details call) */
  needsResolution?: boolean;
}

// ─── API Key ───

// @ts-expect-error Vite statically replaces import.meta.env at build time
const GOOGLE_API_KEY: string | undefined = import.meta.env.VITE_GOOGLE_PLACES_API_KEY;

// ─── Session Token Management ───
// Groups Autocomplete keystrokes + final Place Details into one billing session.
// Tokens expire after 3 minutes of inactivity per Google's recommendation.

let _sessionToken: string | null = null;
let _sessionTokenTs = 0;
const SESSION_TTL = 180_000; // 3 min

function getSessionToken(): string {
  const now = Date.now();
  if (!_sessionToken || now - _sessionTokenTs > SESSION_TTL) {
    _sessionToken = crypto.randomUUID();
    _sessionTokenTs = now;
  }
  return _sessionToken;
}

/** Close the billing session (call when user selects a place). */
function endSession(): void {
  _sessionToken = null;
  _sessionTokenTs = 0;
}

// ─── Google Places Autocomplete (New) ───

interface AutocompleteSuggestion {
  placePrediction?: {
    placeId: string;
    text?: { text?: string };
    structuredFormat?: {
      mainText?: { text?: string };
      secondaryText?: { text?: string };
    };
    types?: string[];
  };
}

interface AutocompleteResponse {
  suggestions?: AutocompleteSuggestion[];
}

/**
 * Google Places Autocomplete (New) — fast, session-billed predictions.
 * Returns results with `placeId` but WITHOUT coordinates. The caller
 * must use `resolvePlace()` to get exact lat/lng on selection.
 */
async function googleAutocomplete(
  input: string,
  language: string,
): Promise<LocationSearchResult[]> {
  if (!GOOGLE_API_KEY) return [];

  try {
    const body: Record<string, unknown> = {
      input,
      languageCode: language || 'en',
      sessionToken: getSessionToken(),
    };

    const resp = await fetch(
      'https://places.googleapis.com/v1/places:autocomplete',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_API_KEY,
        },
        body: JSON.stringify(body),
      },
    );

    if (!resp.ok) {
      console.warn(`[LocationSearch] Autocomplete HTTP ${resp.status}`);
      return [];
    }

    const data: AutocompleteResponse = await resp.json();
    if (!data.suggestions?.length) return [];

    return data.suggestions
      .filter((s) => s.placePrediction?.placeId)
      .slice(0, 6)
      .map((s) => {
        const pred = s.placePrediction!;
        return {
          id: pred.placeId,
          name:
            pred.structuredFormat?.mainText?.text ||
            pred.text?.text ||
            'Unknown',
          lat: 0, // Resolved via resolvePlace() on selection
          lng: 0,
          subtitle: pred.structuredFormat?.secondaryText?.text || '',
          placeId: pred.placeId,
          needsResolution: true,
        };
      });
  } catch (err) {
    console.warn('[LocationSearch] Autocomplete failed:', err);
    return [];
  }
}

// ─── Google Place Details (New) — Resolve exact coordinates ───

interface PlaceDetailsResponse {
  location?: { latitude?: number; longitude?: number };
  displayName?: { text?: string };
  formattedAddress?: string;
}

/**
 * Resolve a Google Place ID to exact coordinates + display name.
 * Called when the user selects an Autocomplete result.
 * Ends the Autocomplete billing session.
 *
 * @returns { lat, lng, name } with 6-decimal precision, or null on failure.
 */
export async function resolvePlace(
  placeId: string,
): Promise<{ lat: number; lng: number; name: string } | null> {
  if (!GOOGLE_API_KEY || !placeId) return null;

  try {
    const resp = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}`,
      {
        headers: {
          'X-Goog-Api-Key': GOOGLE_API_KEY,
          'X-Goog-FieldMask': 'location,displayName,formattedAddress',
        },
      },
    );

    if (!resp.ok) {
      console.warn(`[LocationSearch] Place Details HTTP ${resp.status}`);
      return null;
    }

    const data: PlaceDetailsResponse = await resp.json();
    endSession(); // Close the Autocomplete billing session

    if (data.location?.latitude == null || data.location?.longitude == null) {
      console.warn('[LocationSearch] Place Details: no coordinates in response');
      return null;
    }

    return {
      lat: parseFloat(data.location.latitude.toFixed(6)),
      lng: parseFloat(data.location.longitude.toFixed(6)),
      name: data.displayName?.text || data.formattedAddress || 'Unknown',
    };
  } catch (err) {
    console.warn('[LocationSearch] Place Details failed:', err);
    return null;
  }
}

// ─── Google Text Search (New) — Secondary path ───

interface GooglePlaceCandidate {
  id?: string;
  displayName?: { text?: string; languageCode?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  types?: string[];
}

interface GoogleTextSearchResponse {
  places?: GooglePlaceCandidate[];
}

/**
 * Google Places Text Search (New) — returns results WITH coordinates.
 * More expensive per request than Autocomplete but useful as fallback
 * when Autocomplete returns nothing (e.g. very specific queries).
 */
async function googleTextSearch(
  query: string,
  language: string,
): Promise<LocationSearchResult[]> {
  if (!GOOGLE_API_KEY) return [];

  try {
    const body: Record<string, unknown> = {
      textQuery: query,
      languageCode: language || 'en',
      maxResultCount: 6,
    };

    const resp = await fetch(
      'https://places.googleapis.com/v1/places:searchText',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_API_KEY,
          'X-Goog-FieldMask':
            'places.id,places.displayName,places.formattedAddress,places.location,places.types',
        },
        body: JSON.stringify(body),
      },
    );

    if (!resp.ok) {
      console.warn(`[LocationSearch] Text Search HTTP ${resp.status}`);
      return [];
    }

    const data: GoogleTextSearchResponse = await resp.json();
    if (!data.places?.length) return [];

    return data.places
      .filter((p) => p.location?.latitude != null && p.location?.longitude != null)
      .map((p) => ({
        id: p.id ?? `${p.location!.latitude},${p.location!.longitude}`,
        name: p.displayName?.text ?? p.formattedAddress ?? 'Unknown',
        lat: parseFloat(p.location!.latitude!.toFixed(6)),
        lng: parseFloat(p.location!.longitude!.toFixed(6)),
        subtitle: p.formattedAddress,
        needsResolution: false,
      }));
  } catch (err) {
    console.warn('[LocationSearch] Text Search failed:', err);
    return [];
  }
}

// ─── Open-Meteo Geocoding — Absolute last resort ───

/**
 * Fallback: Open-Meteo geocoding (free, no API key required).
 * Only reached when Google APIs are unavailable or return nothing.
 */
async function openMeteoFallback(
  query: string,
): Promise<LocationSearchResult[]> {
  try {
    const results = await openMeteoSearch(query);
    return results.map((r) => ({
      id: String(r.id),
      name: r.name,
      lat: parseFloat(r.lat.toFixed(6)),
      lng: parseFloat(r.lng.toFixed(6)),
      subtitle: [r.admin1, r.country].filter(Boolean).join(', '),
      needsResolution: false,
    }));
  } catch (err) {
    console.warn('[LocationSearch] Open-Meteo fallback failed:', err);
    return [];
  }
}

// ─── Public API ───

/**
 * Search for locations with Google Places as the primary engine.
 *
 * Strategy:
 *   1. Google Autocomplete (New) — fast, session-billed live predictions
 *   2. Google Text Search (New) — fallback for when Autocomplete returns empty
 *   3. Open-Meteo geocoding — absolute last resort (free, no key)
 *
 * Results from Autocomplete have `needsResolution: true` — the caller MUST
 * use `resolvePlace(result.placeId)` to get exact coordinates on selection.
 *
 * @param query    Search string (e.g. "Bondi Beach", "חוף גורדון", "Tel Aviv")
 * @param language ISO 639-1 language code (e.g. "en", "he", "fr")
 */
export async function searchLocationsSmart(
  query: string,
  language: string = 'en',
): Promise<LocationSearchResult[]> {
  if (!query || query.trim().length < 2) return [];

  const trimmed = query.trim();

  if (GOOGLE_API_KEY) {
    // 1. Try Autocomplete first (fast, cheap per-session billing)
    const autoResults = await googleAutocomplete(trimmed, language);
    if (autoResults.length > 0) return autoResults;

    // 2. Fall back to Text Search (returns coords directly, more expensive)
    const textResults = await googleTextSearch(trimmed, language);
    if (textResults.length > 0) return textResults;
  }

  // 3. Last resort: Open-Meteo geocoding (no Google key or both paths failed)
  return openMeteoFallback(trimmed);
}

/** Check if Google Places API is configured */
export function isGooglePlacesConfigured(): boolean {
  return !!GOOGLE_API_KEY;
}
