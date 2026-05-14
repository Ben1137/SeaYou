/**
 * COASTS & MARINAS FINDER SERVICE
 * Finds nearby marinas, harbors, and coastal locations using OpenStreetMap
 *
 * Now includes retry logic with exponential backoff for:
 * - Overpass API (with 25-second timeout handling)
 * - Nominatim API (with rate limit handling)
 */

import type { Marina, CoastSearchOptions, MarinaType } from '../types/navigation';
import type { OverpassApiResponse, OverpassElement, NominatimApiResponse } from '../types/apiResponses';
import { calculateDistance, formatDistance } from './routePlanningService';
import { fetchWithRetry, fetchWithRetrySafe, isTimeoutError, isRateLimitError } from '../utils/fetchWithRetry';
import { globalRateLimiter } from './apiRateLimiter';
import { API_ENDPOINTS, NAVIGATION_CONSTANTS, REQUEST_CONFIG, CACHE_CONFIG, ERROR_MESSAGES } from '../constants';

/**
 * Search for nearby marinas and coastal locations
 * Uses OpenStreetMap Overpass API for real data
 */
export const searchNearbyCoasts = async (
  lat: number,
  lon: number,
  options: CoastSearchOptions = { radius: 25 }
): Promise<Marina[]> => {
  try {
    // Convert nautical miles to meters for OSM
    const radiusMeters = options.radius * NAVIGATION_CONSTANTS.NAUTICAL_MILE_METERS;

    // Build Overpass query
    const query = buildOverpassQuery(lat, lon, radiusMeters, options.types);

    // Query Overpass API with retry logic and extended timeout
    // Overpass API can take up to 25 seconds, so we use a custom timeout
    const response = await globalRateLimiter.enqueue(() =>
      fetchWithRetry(
        API_ENDPOINTS.OVERPASS,
        {
          method: 'POST',
          body: query,
        },
        {
          timeoutMs: REQUEST_CONFIG.OVERPASS_TIMEOUT_SECONDS * 1000, // 25 seconds
          maxRetries: 2, // Lower retries for long-running queries
          initialDelayMs: 2000, // Longer initial delay for Overpass
          logRetries: true,
        }
      )
    );

    if (!response.ok) {
      throw new Error('Failed to fetch coastal data');
    }

    const data = await response.json();

    // Parse and format results
    const marinas = parseOverpassResults(data, lat, lon);

    // Filter and sort
    let filtered = marinas;

    if (options.minRating) {
      filtered = filtered.filter(
        (m) => m.rating && m.rating >= options.minRating!
      );
    }

    if (options.amenities && options.amenities.length > 0) {
      filtered = filtered.filter((m) =>
        options.amenities!.some((amenity: string) => m.amenities.includes(amenity))
      );
    }

    // Sort results
    filtered.sort((a, b) => {
      switch (options.sortBy) {
        case 'rating':
          return (b.rating || 0) - (a.rating || 0);
        case 'name':
          return a.name.localeCompare(b.name);
        case 'distance':
        default:
          return a.distance - b.distance;
      }
    });

    // Cache results for offline use
    cacheCoastalData(lat, lon, filtered);

    return filtered;
  } catch (error) {
    console.error('Error searching coasts:', error);

    // Enhanced error handling with specific messages
    if (error instanceof Error) {
      if (isTimeoutError(error)) {
        console.warn('Overpass API request timed out - returning cached data if available');
      }
      if (isRateLimitError(error)) {
        console.warn('Overpass API rate limit reached - returning cached data if available');
      }
    }

    // Return cached data if available
    return getCachedCoastalData(lat, lon) || [];
  }
};

/**
 * Build Overpass API query
 */
const buildOverpassQuery = (
  lat: number,
  lon: number,
  radiusMeters: number,
  types?: MarinaType[]
): string => {
  const typeFilters = types || [
    'marina',
    'harbour',
    'anchorage',
    'beach',
    'port',
  ];

  // Overpass QL query
  return `
    [out:json][timeout:${REQUEST_CONFIG.OVERPASS_TIMEOUT_SECONDS}];
    (
      node["leisure"="marina"](around:${radiusMeters},${lat},${lon});
      node["harbour"="yes"](around:${radiusMeters},${lat},${lon});
      node["natural"="beach"](around:${radiusMeters},${lat},${lon});
      node["natural"="bay"](around:${radiusMeters},${lat},${lon});
      node["place"="bay"](around:${radiusMeters},${lat},${lon});
      way["leisure"="marina"](around:${radiusMeters},${lat},${lon});
      way["natural"="beach"](around:${radiusMeters},${lat},${lon});
      way["natural"="bay"](around:${radiusMeters},${lat},${lon});
    );
    out center;
    >;
    out skel qt;
  `;
};

/**
 * Parse Overpass API results
 */
const parseOverpassResults = (
  data: any,
  fromLat: number,
  fromLon: number
): Marina[] => {
  const marinas: Marina[] = [];

  if (!data.elements) return marinas;

  data.elements.forEach((element: any) => {
    // Overpass "out center" returns 'center' for ways/relations, and lat/lon for nodes
    const lat = element.lat || element.center?.lat;
    const lon = element.lon || element.center?.lon;

    if (lat && lon) {
      const tags = element.tags || {};

      // Skip if no name
      if (!tags.name) return;

      const distance = calculateDistance(
        fromLat,
        fromLon,
        element.lat,
        element.lon
      );

      const marina: Marina = {
        id: `osm-${element.id}`,
        name: tags.name || 'Unnamed Location',
        lat: element.lat,
        lon: element.lon,
        type: determineType(tags),
        distance,
        bearing: 0,
        amenities: parseAmenities(tags),
        phone: tags.phone,
        website: tags.website,
        email: tags.email,
        description: tags.description,
        vhf_channel: tags['seamark:radio_station:channel'],
        facilities: {
          fuel: tags.fuel === 'yes',
          water: tags.drinking_water === 'yes',
          electricity: tags.electricity === 'yes',
          wifi: tags.wifi === 'yes' || tags.internet_access === 'wifi',
          restaurant: tags.restaurant === 'yes' || tags.amenity === 'restaurant',
          shower: tags.shower === 'yes',
          laundry: tags.laundry === 'yes',
          repair: tags.repair === 'yes',
          pump_out: tags.pump_out === 'yes',
          security: tags.security === 'yes',
        },
      };

      marinas.push(marina);
    }
  });

  return marinas;
};

/**
 * Determine marina type from tags
 */
const determineType = (tags: any): MarinaType => {
  if (tags.harbour === 'yes') return 'harbor';
  if (tags.leisure === 'marina') return 'marina';
  if (tags.natural === 'beach') return 'beach';
  if (tags.harbour === 'port') return 'port';
  return 'marina';
};

/**
 * Parse amenities from tags
 */
const parseAmenities = (tags: any): string[] => {
  const amenities: string[] = [];

  if (tags.fuel === 'yes') amenities.push('Fuel');
  if (tags.drinking_water === 'yes') amenities.push('Water');
  if (tags.electricity === 'yes') amenities.push('Electricity');
  if (tags.wifi === 'yes') amenities.push('WiFi');
  if (tags.restaurant === 'yes') amenities.push('Restaurant');
  if (tags.shower === 'yes') amenities.push('Shower');
  if (tags.laundry === 'yes') amenities.push('Laundry');
  if (tags.repair === 'yes') amenities.push('Repair');
  if (tags.toilets === 'yes') amenities.push('Toilets');
  if (tags.shop === 'yes') amenities.push('Shop');

  return amenities;
};

/**
 * Get directions URL for external navigation
 */
export const getNavigationUrl = (
  marina: Marina,
  app: 'google' | 'waze' | 'apple' = 'google'
): string => {
  const { lat, lon, name } = marina;

  switch (app) {
    case 'google':
      return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&destination_place_id=${encodeURIComponent(name)}&travelmode=driving`;

    case 'waze':
      return `https://www.waze.com/ul?ll=${lat},${lon}&navigate=yes&zoom=17`;

    case 'apple':
      return `https://maps.apple.com/?daddr=${lat},${lon}&dirflg=d`;

    default:
      return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
  }
};

/**
 * Open navigation in external app
 */
export const navigateToMarina = (
  marina: Marina,
  preferredApp: 'google' | 'waze' | 'apple' = 'google'
): void => {
  const url = getNavigationUrl(marina, preferredApp);
  window.open(url, '_blank');
};

/**
 * Cache coastal data for offline use
 */
const cacheCoastalData = (lat: number, lon: number, marinas: Marina[]): void => {
  const cacheKey = `coastal-${Math.round(lat * 100)}-${Math.round(lon * 100)}`;
  const cacheData = {
    timestamp: new Date().toISOString(),
    marinas,
  };
  localStorage.setItem(cacheKey, JSON.stringify(cacheData));
};

/**
 * Get cached coastal data
 */
const getCachedCoastalData = (
  lat: number,
  lon: number
): Marina[] | null => {
  const cacheKey = `coastal-${Math.round(lat * 100)}-${Math.round(lon * 100)}`;
  const cached = localStorage.getItem(cacheKey);

  if (!cached) return null;

  try {
    const { timestamp, marinas } = JSON.parse(cached);
    const cacheAge = Date.now() - new Date(timestamp).getTime();

    // Cache valid for 24 hours (use GRIB TTL as it's also 24 hours)
    if (cacheAge < CACHE_CONFIG.TTL.GRIB) {
      return marinas;
    }
  } catch (error) {
    console.error('Error parsing cached data:', error);
  }

  return null;
};

/**
 * Calculate estimated time to marina
 */
export const calculateETAToMarina = (
  marina: Marina,
  currentSpeed: number
): number => {
  if (currentSpeed === 0) return 0;
  return (marina.distance / currentSpeed) * 60; // minutes
};

/**
 * Search marinas by name
 */
export const searchMarinasByName = async (
  query: string,
  currentLat?: number,
  currentLon?: number
): Promise<Marina[]> => {
  try {
    // Use Nominatim to search for marinas, beaches, coasts and harbours and merge results
    const typesToSearch = ['marina', 'beach', 'coast', 'harbour'];

    // Run the searches in parallel with retry logic
    // Nominatim has strict rate limiting (1 req/second), so we use:
    // - Lower retries to avoid hammering the API
    // - Longer delays between retries
    // - fetchWithRetrySafe to handle failures gracefully
    const fetches = typesToSearch.map((t) =>
      globalRateLimiter.enqueue(() =>
        fetchWithRetrySafe(
          `${API_ENDPOINTS.NOMINATIM}?` +
            `q=${encodeURIComponent(query + ' ' + t)}&` +
            `format=json&` +
            `limit=20&` +
            `addressdetails=1`,
          {},
          {
            maxRetries: 2, // Lower retries for rate-limited API
            initialDelayMs: 2000, // Longer delay to respect rate limits
            timeoutMs: 15000, // Longer timeout for Nominatim
            logRetries: true,
          }
        )
      )
    );

    const responses = await Promise.all(fetches);
    const datas = await Promise.all(
      responses.map((r) => (r?.ok ? r.json() : []))
    );

    const results: Marina[] = [];

    datas.forEach((data: any[], idx: number) => {
      (data || [])
        .filter((item: any) => item.lat && item.lon)
        .forEach((item: any) => {
          const id = `nominatim-${item.place_id}`;
          // avoid duplicates
          if (results.find((r) => r.id === id)) return;

          const distance =
            currentLat && currentLon
              ? calculateDistance(currentLat, currentLon, parseFloat(item.lat), parseFloat(item.lon))
              : 0;

          results.push({
            id,
            name: item.display_name,
            lat: parseFloat(item.lat),
            lon: parseFloat(item.lon),
            type:
              typesToSearch[idx] === 'beach'
                ? 'beach'
                : typesToSearch[idx] === 'harbour'
                ? 'harbor'
                : typesToSearch[idx] === 'coast'
                ? 'beach'
                : 'marina',
            distance,
            bearing: 0,
            amenities: [],
            facilities: {},
          });
        });
    });

    // sort by distance if possible
    results.sort((a, b) => a.distance - b.distance);

    return results;
  } catch (error) {
    console.error('Error searching marinas:', error);

    // Enhanced error handling with specific messages
    if (error instanceof Error) {
      if (isTimeoutError(error)) {
        console.warn('Nominatim search request timed out');
      }
      if (isRateLimitError(error)) {
        console.warn('Nominatim rate limit reached - please wait before searching again');
      }
    }

    return [];
  }
};

/**
 * Save marina as favorite
 */
export const saveFavoriteMarina = (marina: Marina): void => {
  const favorites = getFavoriteMarinas();
  if (!favorites.find((m) => m.id === marina.id)) {
    favorites.push(marina);
    localStorage.setItem('favoriteMarinas', JSON.stringify(favorites));
  }
};

/**
 * Get favorite marinas
 */
export const getFavoriteMarinas = (): Marina[] => {
  const saved = localStorage.getItem('favoriteMarinas');
  return saved ? JSON.parse(saved) : [];
};

/**
 * Remove favorite marina
 */
export const removeFavoriteMarina = (marinaId: string): void => {
  const favorites = getFavoriteMarinas().filter((m) => m.id !== marinaId);
  localStorage.setItem('favoriteMarinas', JSON.stringify(favorites));
};

/**
 * Check if marina is favorited
 */
export const isMarinaFavorited = (marinaId: string): boolean => {
  return getFavoriteMarinas().some((m) => m.id === marinaId);
};
