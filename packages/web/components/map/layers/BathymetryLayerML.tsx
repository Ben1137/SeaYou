/**
 * BathymetryLayerML - MapLibre GL JS implementation of bathymetry layer
 * Uses native fill layers for depth contours
 */

import { useEffect, useRef, useState } from 'react';
import { useMap } from '../useMap';
import type { GeoJSONSource } from 'maplibre-gl';

// ------------------------------------------------------------------
// Types & Interfaces
// ------------------------------------------------------------------

export interface BathymetryLayerMLProps {
  visible: boolean;
  opacity?: number;
  depths?: number[]; // [200, 1000, 2000, 3000] meters
}

// ------------------------------------------------------------------
// Constants & Configuration
// ------------------------------------------------------------------

const SOURCE_PREFIX = 'bathymetry-source-';
const LAYER_PREFIX = 'bathymetry-layer-';

// Default depth contours in meters
// Include 0 for coastal/shelf area to eliminate gap between coastline and 200m
const DEFAULT_DEPTHS = [0, 200, 1000, 2000, 3000];

// Natural Earth bathymetry data URLs
const GEOJSON_BASE_PATH = '/SeaYou/geojson';
const REMOTE_BASE_PATH = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';

// Local bathymetry URLs
const BATHYMETRY_LOCAL_URLS: Record<number, string> = {
  // 0 = Ocean layer (fills gap between coastline and 200m)
  0: `${GEOJSON_BASE_PATH}/10m/bathymetry/ocean_base.json`,
  200: `${GEOJSON_BASE_PATH}/10m/bathymetry/depth_200m.json`,
  1000: `${GEOJSON_BASE_PATH}/10m/bathymetry/depth_1000m.json`,
  2000: `${GEOJSON_BASE_PATH}/10m/bathymetry/depth_2000m.json`,
  3000: `${GEOJSON_BASE_PATH}/10m/bathymetry/depth_3000m.json`,
};

// Remote fallback URLs
// Natural Earth provides ocean polygons that include shallow water
const BATHYMETRY_FALLBACK_URLS: Record<number, string> = {
  // Use ocean polygons as the base layer (0m depth)
  0: `${REMOTE_BASE_PATH}/ne_10m_ocean.geojson`,
  200: `${REMOTE_BASE_PATH}/ne_10m_bathymetry_K_200.geojson`,
  1000: `${REMOTE_BASE_PATH}/ne_10m_bathymetry_J_1000.geojson`,
  2000: `${REMOTE_BASE_PATH}/ne_10m_bathymetry_I_2000.geojson`,
  3000: `${REMOTE_BASE_PATH}/ne_10m_bathymetry_H_3000.geojson`,
  4000: `${REMOTE_BASE_PATH}/ne_10m_bathymetry_G_4000.geojson`,
  6000: `${REMOTE_BASE_PATH}/ne_10m_bathymetry_E_6000.geojson`,
};

// Color gradient from light to dark blue based on depth
// 0m (coastal shelf) uses the lightest color for smooth transition from coastline
const DEPTH_COLORS: Record<number, string> = {
  0: '#d4e6f7',    // Very light blue for coastal shelf (0-200m)
  200: '#b3d4f0',  // Light blue
  1000: '#8cb8e0',
  2000: '#5c9cd0',
  3000: '#3d7eb8',
  4000: '#2d6699',
  6000: '#1a4d80',
};

// ------------------------------------------------------------------
// Helper Functions
// ------------------------------------------------------------------

function getDepthColor(depth: number): string {
  const depths = Object.keys(DEPTH_COLORS).map(Number).sort((a, b) => a - b);
  for (let i = depths.length - 1; i >= 0; i--) {
    if (depth >= depths[i]) {
      return DEPTH_COLORS[depths[i]];
    }
  }
  return DEPTH_COLORS[0];
}

function getDepthUrls(targetDepth: number): { local: string | null; fallback: string | null } {
  if (BATHYMETRY_LOCAL_URLS[targetDepth]) {
    return {
      local: BATHYMETRY_LOCAL_URLS[targetDepth],
      fallback: BATHYMETRY_FALLBACK_URLS[targetDepth] || null,
    };
  }

  // Find closest available depth for fallback
  const availableDepths = Object.keys(BATHYMETRY_FALLBACK_URLS).map(Number).sort((a, b) => a - b);
  let closestDepth = availableDepths[0];
  let minDiff = Math.abs(targetDepth - closestDepth);

  for (const depth of availableDepths) {
    const diff = Math.abs(targetDepth - depth);
    if (diff < minDiff) {
      minDiff = diff;
      closestDepth = depth;
    }
  }

  return {
    local: BATHYMETRY_LOCAL_URLS[closestDepth] || null,
    fallback: BATHYMETRY_FALLBACK_URLS[closestDepth] || null,
  };
}

// ------------------------------------------------------------------
// Data Fetching
// ------------------------------------------------------------------

const bathymetryCache: Map<string, GeoJSON.FeatureCollection> = new Map();

async function fetchBathymetryData(localUrl: string | null, fallbackUrl: string | null): Promise<GeoJSON.FeatureCollection | null> {
  const cacheKey = localUrl || fallbackUrl || '';
  if (bathymetryCache.has(cacheKey)) {
    return bathymetryCache.get(cacheKey)!;
  }

  // Try local URL first
  if (localUrl) {
    try {
      const response = await fetch(localUrl);
      if (response.ok) {
        const data = await response.json();
        bathymetryCache.set(cacheKey, data);
        console.log(`[BathymetryLayerML] Loaded from local: ${localUrl}`);
        return data;
      }
    } catch (error) {
      // Local fetch failed, try fallback
    }
  }

  // Try remote fallback
  if (fallbackUrl) {
    try {
      const response = await fetch(fallbackUrl);
      if (response.ok) {
        const data = await response.json();
        bathymetryCache.set(cacheKey, data);
        console.log(`[BathymetryLayerML] Loaded from remote: ${fallbackUrl}`);
        return data;
      }
    } catch (error) {
      console.error('[BathymetryLayerML] Fetch error:', error);
    }
  }

  return null;
}

// ------------------------------------------------------------------
// Main Component
// ------------------------------------------------------------------

export function BathymetryLayerML({
  visible,
  opacity = 0.6,
  depths = DEFAULT_DEPTHS,
}: BathymetryLayerMLProps) {
  const map = useMap();
  const [loadedDepths, setLoadedDepths] = useState<Record<number, GeoJSON.FeatureCollection>>({});
  const layersAddedRef = useRef<Set<number>>(new Set());

  // Load bathymetry data for specified depths
  useEffect(() => {
    if (!visible) return;

    const loadDepthData = async () => {
      // Sort depths from deepest to shallowest for proper layering
      const sortedDepths = [...depths].sort((a, b) => b - a);

      for (const depth of sortedDepths) {
        if (!loadedDepths[depth]) {
          const urls = getDepthUrls(depth);
          if (urls.local || urls.fallback) {
            const data = await fetchBathymetryData(urls.local, urls.fallback);
            if (data) {
              setLoadedDepths(prev => ({ ...prev, [depth]: data }));
            }
          }
        }
      }
    };

    loadDepthData();
  }, [visible, depths]);

  // Add sources and layers to map
  useEffect(() => {
    if (!map) return;

    const setupLayers = () => {
      // Sort depths from deepest to shallowest (deeper layers render first/behind)
      const sortedDepths = [...depths].sort((a, b) => b - a);

      sortedDepths.forEach((depth, index) => {
        const data = loadedDepths[depth];
        if (!data) return;

        const sourceId = `${SOURCE_PREFIX}${depth}`;
        const layerId = `${LAYER_PREFIX}${depth}`;
        const fillColor = getDepthColor(depth);

        // Add source if not exists
        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, {
            type: 'geojson',
            data: data,
          });
        } else {
          (map.getSource(sourceId) as GeoJSONSource).setData(data);
        }

        // Add fill layer if not exists
        if (!map.getLayer(layerId)) {
          // Find first label layer to insert below it
          const layers = map.getStyle()?.layers || [];
          let beforeId: string | undefined;
          for (const layer of layers) {
            if (layer.type === 'symbol') {
              beforeId = layer.id;
              break;
            }
          }

          map.addLayer({
            id: layerId,
            type: 'fill',
            source: sourceId,
            paint: {
              'fill-color': fillColor,
              'fill-opacity': opacity,
              'fill-outline-color': fillColor,
            },
            layout: {
              'visibility': visible ? 'visible' : 'none',
            },
          }, beforeId);

          layersAddedRef.current.add(depth);
        }
      });
    };

    if (map.isStyleLoaded()) {
      setupLayers();
    } else {
      map.once('style.load', setupLayers);
    }

    // Cleanup
    return () => {
      if (!map || !map.getStyle()) return;

      try {
        layersAddedRef.current.forEach(depth => {
          const layerId = `${LAYER_PREFIX}${depth}`;
          const sourceId = `${SOURCE_PREFIX}${depth}`;

          if (map.getLayer(layerId)) {
            map.removeLayer(layerId);
          }
          if (map.getSource(sourceId)) {
            map.removeSource(sourceId);
          }
        });
      } catch (e) {
        // Ignore errors during cleanup
      }
      layersAddedRef.current.clear();
    };
  }, [map, loadedDepths, depths, opacity]);

  // Update visibility
  useEffect(() => {
    if (!map) return;

    try {
      layersAddedRef.current.forEach(depth => {
        const layerId = `${LAYER_PREFIX}${depth}`;
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
        }
      });
    } catch (e) {
      // Ignore errors
    }
  }, [map, visible]);

  // Update opacity
  useEffect(() => {
    if (!map) return;

    try {
      layersAddedRef.current.forEach(depth => {
        const layerId = `${LAYER_PREFIX}${depth}`;
        if (map.getLayer(layerId)) {
          map.setPaintProperty(layerId, 'fill-opacity', opacity);
        }
      });
    } catch (e) {
      // Ignore errors
    }
  }, [map, opacity]);

  return null;
}

export default BathymetryLayerML;
