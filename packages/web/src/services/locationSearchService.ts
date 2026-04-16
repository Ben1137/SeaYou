/**
 * locationSearchService.ts — Unified location search with Google Places + fallback
 *
 * Provides autocomplete-style location search that:
 *   1. Tries Google Places Text Search (new) for beach/coastal queries first
 *   2. Falls back to a general Google Text Search if no beach results are found
 *   3. Falls back to Open-Meteo geocoding if no Google API key is configured
 *   4. Always passes the app's current i18n language code so results are localized
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
}

// ─── Google Places Text Search (New API) ───

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

// @ts-expect-error Vite statically replaces import.meta.env at build time
const GOOGLE_API_KEY: string | undefined = import.meta.env.VITE_GOOGLE_PLACES_API_KEY;

/**
 * Localized "beach" hints per language — appended to the query when doing
 * the beach-focused pass so Google biases towards coastal results even when
 * the user's query is generic (e.g. "Tel Aviv" → "Tel Aviv beach").
 */
const BEACH_HINT: Record<string, string> = {
  en: 'beach',
  he: 'חוף',
  de: 'Strand',
  fr: 'plage',
  es: 'playa',
  it: 'spiaggia',
  ru: 'пляж',
  pt: 'praia',
  ar: 'شاطئ',
};

/**
 * Core Google Places Text Search call.
 *
 * @param query        Free-text search query
 * @param language     ISO 639-1 language code (e.g. "he", "fr")
 * @param includedType Optional Places type filter (e.g. "beach", "natural_feature")
 */
async function googleTextSearch(
  query: string,
  language: string,
  includedType?: string,
): Promise<LocationSearchResult[]> {
  if (!GOOGLE_API_KEY) return [];

  try {
    const body: Record<string, unknown> = {
      textQuery: query,
      languageCode: language || 'en',
      maxResultCount: 6,
    };

    // Google Places (New) supports includedType for type-biasing
    if (includedType) {
      body.includedType = includedType;
    }

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
      console.warn(`[LocationSearch] Google Places returned ${resp.status}`);
      return [];
    }

    const data: GoogleTextSearchResponse = await resp.json();
    if (!data.places || data.places.length === 0) return [];

    return data.places
      .filter((p) => p.location?.latitude != null && p.location?.longitude != null)
      .map((p) => ({
        id: p.id ?? `${p.location!.latitude},${p.location!.longitude}`,
        name: p.displayName?.text ?? p.formattedAddress ?? 'Unknown',
        lat: p.location!.latitude!,
        lng: p.location!.longitude!,
        subtitle: p.formattedAddress,
      }));
  } catch (err) {
    console.warn('[LocationSearch] Google Places failed:', err);
    return [];
  }
}

/**
 * Search for locations via Open-Meteo geocoding (free, no API key required).
 * Also passes language for localized names.
 */
async function openMeteoFallback(
  query: string,
  language: string,
): Promise<LocationSearchResult[]> {
  const results = await openMeteoSearch(query);
  return results.map((r) => ({
    id: String(r.id),
    name: r.name,
    lat: r.lat,
    lng: r.lng,
    subtitle: [r.admin1, r.country].filter(Boolean).join(', '),
  }));
}

// ─── Public API ───

/**
 * Search for locations with a two-pass beach-first strategy:
 *
 *   Pass 1 — Beach-focused: query + beach hint word, filtered to "beach" type
 *   Pass 2 — General: raw query without type filter (catches cities, POIs, etc.)
 *   Pass 3 — Open-Meteo fallback if Google is unavailable or returned nothing
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
    // Pass 1: Beach-focused search
    // Append a localized beach hint if the query doesn't already contain one
    const hint = BEACH_HINT[language] ?? BEACH_HINT.en;
    const alreadyHasBeachTerm = Object.values(BEACH_HINT).some(
      (h) => trimmed.toLowerCase().includes(h.toLowerCase()),
    );
    const beachQuery = alreadyHasBeachTerm ? trimmed : `${trimmed} ${hint}`;

    const beachResults = await googleTextSearch(beachQuery, language);
    if (beachResults.length > 0) return beachResults;

    // Pass 2: General search (no type filter)
    const generalResults = await googleTextSearch(trimmed, language);
    if (generalResults.length > 0) return generalResults;
  }

  // Pass 3: Open-Meteo fallback
  return openMeteoFallback(trimmed, language);
}

/** Check if Google Places API is configured */
export function isGooglePlacesConfigured(): boolean {
  return !!GOOGLE_API_KEY;
}
