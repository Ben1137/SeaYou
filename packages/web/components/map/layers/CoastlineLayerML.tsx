/**
 * CoastlineLayerML - MapLibre GL JS coastline line layer
 * Uses native line layer for Natural Earth 10m coastline rendering
 */

import { useEffect, useRef, useState } from 'react';
import { useMap } from '../useMap';
import type { GeoJSONSource } from 'maplibre-gl';

// ------------------------------------------------------------------
// Types & Interfaces
// ------------------------------------------------------------------

export interface CoastlineLayerMLProps {
  visible: boolean;
  opacity?: number;
}

// ------------------------------------------------------------------
// Constants & Configuration
// ------------------------------------------------------------------

const SOURCE_ID = 'coastline-source';
const LINE_LAYER_ID = 'coastline-line';

const COASTLINE_LOCAL_URL = '/SeaYou/geojson/10m/coastline.json';
const COASTLINE_FALLBACK_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_coastline.geojson';

const COASTLINE_COLOR = '#00bcd4'; // Cyan — matches the UI button color

// ------------------------------------------------------------------
// Data Fetching (module-level cache)
// ------------------------------------------------------------------

let coastlineCache: GeoJSON.FeatureCollection | null = null;

/**
 * Exported so the Route Planner's safety analyzer can reuse the same
 * cached Natural Earth coastline GeoJSON as input to Turf.js's
 * `lineIntersect` landmask check — zero extra network round-trips.
 */
export async function fetchCoastlineData(): Promise<GeoJSON.FeatureCollection | null> {
  if (coastlineCache) return coastlineCache;

  // Try local URL first
  try {
    const response = await fetch(COASTLINE_LOCAL_URL);
    if (response.ok) {
      const data = await response.json();
      coastlineCache = data;
      console.log('[CoastlineLayerML] Loaded coastline data from local');
      return data;
    }
  } catch (_error) {
    // Local fetch failed, try remote fallback
  }

  // Try remote fallback
  try {
    const response = await fetch(COASTLINE_FALLBACK_URL);
    if (response.ok) {
      const data = await response.json();
      coastlineCache = data;
      console.log('[CoastlineLayerML] Loaded coastline data from remote fallback');
      return data;
    }
  } catch (error) {
    console.error('[CoastlineLayerML] Fetch error:', error);
  }

  return null;
}

// ------------------------------------------------------------------
// Main Component
// ------------------------------------------------------------------

export function CoastlineLayerML({ visible, opacity = 0.8 }: CoastlineLayerMLProps) {
  const map = useMap();
  const [coastlineData, setCoastlineData] = useState<GeoJSON.FeatureCollection | null>(null);
  const layersAddedRef = useRef(false);

  // Load data on first visibility
  useEffect(() => {
    if (!visible) return;

    fetchCoastlineData().then(data => {
      if (data) setCoastlineData(data);
    });
  }, [visible]);

  // Add source and layer to map
  useEffect(() => {
    if (!map || !coastlineData) return;

    const setupLayers = () => {
      // Add or update source
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: 'geojson',
          data: coastlineData,
        });
      } else {
        (map.getSource(SOURCE_ID) as GeoJSONSource).setData(coastlineData);
      }

      // Add line layer
      if (!map.getLayer(LINE_LAYER_ID)) {
        map.addLayer({
          id: LINE_LAYER_ID,
          type: 'line',
          source: SOURCE_ID,
          paint: {
            'line-color': COASTLINE_COLOR,
            'line-width': 1.5,
            'line-opacity': opacity,
          },
          layout: {
            visibility: visible ? 'visible' : 'none',
            'line-cap': 'round',
            'line-join': 'round',
          },
        });
      }

      layersAddedRef.current = true;
      console.log('[CoastlineLayerML] Layer added to map');
    };

    if (map.isStyleLoaded()) {
      setupLayers();
    } else {
      map.once('style.load', setupLayers);
    }

    // Cleanup on unmount
    return () => {
      if (!map || !map.getStyle()) return;
      try {
        if (map.getLayer(LINE_LAYER_ID)) map.removeLayer(LINE_LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch (_e) {
        // Ignore cleanup errors
      }
      layersAddedRef.current = false;
    };
  }, [map, coastlineData, opacity]);

  // Update visibility
  useEffect(() => {
    if (!map || !layersAddedRef.current) return;
    try {
      if (map.getLayer(LINE_LAYER_ID)) {
        map.setLayoutProperty(LINE_LAYER_ID, 'visibility', visible ? 'visible' : 'none');
      }
    } catch (_e) {
      // Ignore
    }
  }, [map, visible]);

  // Update opacity
  useEffect(() => {
    if (!map || !layersAddedRef.current) return;
    try {
      if (map.getLayer(LINE_LAYER_ID)) {
        map.setPaintProperty(LINE_LAYER_ID, 'line-opacity', opacity);
      }
    } catch (_e) {
      // Ignore
    }
  }, [map, opacity]);

  return null;
}

export default CoastlineLayerML;
