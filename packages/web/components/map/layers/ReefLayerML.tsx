/**
 * ReefLayerML - MapLibre GL JS implementation of reef layer
 * Uses native fill + line layers for reef polygons
 */

import { useEffect, useRef, useState } from 'react';
import { useMap } from '../useMap';
import type { GeoJSONSource } from 'maplibre-gl';

// ------------------------------------------------------------------
// Types & Interfaces
// ------------------------------------------------------------------

export interface ReefFeature {
  id: string;
  name: string;
  geometry: GeoJSON.Geometry;
  properties: {
    scalerank?: number;
    featurecla?: string;
    [key: string]: any;
  };
}

export interface ReefLayerMLProps {
  visible: boolean;
  opacity?: number;
}

// ------------------------------------------------------------------
// Constants & Configuration
// ------------------------------------------------------------------

const SOURCE_ID = 'reefs-source';
const FILL_LAYER_ID = 'reefs-fill';
const LINE_LAYER_ID = 'reefs-outline';

// Natural Earth reefs data URLs
const REEFS_LOCAL_URL = '/SeaYou/geojson/10m/reefs.json';
const REEFS_FALLBACK_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_reefs.geojson';

// Colors
const REEF_FILL_COLOR = '#ff7f50';      // Coral fill
const REEF_OUTLINE_COLOR = '#d95200';    // Darker coral outline
const REEF_HIGHLIGHT_COLOR = '#ff6b35';  // Hover highlight

// ------------------------------------------------------------------
// Data Fetching
// ------------------------------------------------------------------

let reefsCache: GeoJSON.FeatureCollection | null = null;

async function fetchReefsData(): Promise<GeoJSON.FeatureCollection | null> {
  if (reefsCache) return reefsCache;

  // Try local URL first
  try {
    const response = await fetch(REEFS_LOCAL_URL);
    if (response.ok) {
      const data = await response.json();
      reefsCache = data;
      console.log('[ReefLayerML] Loaded reefs data from local');
      return data;
    }
  } catch (error) {
    // Local fetch failed, try fallback
  }

  // Try remote fallback
  try {
    const response = await fetch(REEFS_FALLBACK_URL);
    if (response.ok) {
      const data = await response.json();
      reefsCache = data;
      console.log('[ReefLayerML] Loaded reefs data from remote fallback');
      return data;
    }
  } catch (error) {
    console.error('[ReefLayerML] Fetch error:', error);
  }

  return null;
}

// ------------------------------------------------------------------
// Main Component
// ------------------------------------------------------------------

export function ReefLayerML({ visible, opacity = 0.7 }: ReefLayerMLProps) {
  const map = useMap();
  const [reefsData, setReefsData] = useState<GeoJSON.FeatureCollection | null>(null);
  const layersAddedRef = useRef(false);
  const hoveredIdRef = useRef<string | number | null>(null);

  // Load reefs data
  useEffect(() => {
    if (!visible) return;

    const loadData = async () => {
      const data = await fetchReefsData();
      if (data) {
        // Add unique IDs to features for hover state
        const dataWithIds = {
          ...data,
          features: data.features.map((f, i) => ({
            ...f,
            id: f.id ?? i,
          })),
        };
        setReefsData(dataWithIds as GeoJSON.FeatureCollection);
      }
    };

    loadData();
  }, [visible]);

  // Add source and layers to map
  useEffect(() => {
    if (!map || !reefsData) return;

    const setupLayers = () => {
      // Add source if not exists
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: 'geojson',
          data: reefsData,
          generateId: true,
        });
      } else {
        (map.getSource(SOURCE_ID) as GeoJSONSource).setData(reefsData);
      }

      // Add fill layer if not exists
      if (!map.getLayer(FILL_LAYER_ID)) {
        map.addLayer({
          id: FILL_LAYER_ID,
          type: 'fill',
          source: SOURCE_ID,
          paint: {
            'fill-color': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              REEF_HIGHLIGHT_COLOR,
              // Different colors based on reef type
              [
                'match',
                ['downcase', ['coalesce', ['get', 'featurecla'], '']],
                'atoll', '#ffa07a',      // Light salmon for atolls
                'barrier', '#ff6347',    // Tomato for barrier reefs
                REEF_FILL_COLOR          // Default coral color
              ]
            ],
            'fill-opacity': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              opacity * 0.9,
              opacity * 0.6
            ],
          },
          layout: {
            'visibility': visible ? 'visible' : 'none',
          },
        });
      }

      // Add outline layer if not exists
      if (!map.getLayer(LINE_LAYER_ID)) {
        map.addLayer({
          id: LINE_LAYER_ID,
          type: 'line',
          source: SOURCE_ID,
          paint: {
            'line-color': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              '#ff4500',
              REEF_OUTLINE_COLOR
            ],
            'line-width': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              3,
              2
            ],
            'line-opacity': opacity,
            'line-dasharray': [5, 5],
          },
          layout: {
            'visibility': visible ? 'visible' : 'none',
          },
        });
      }

      layersAddedRef.current = true;
    };

    if (map.isStyleLoaded()) {
      setupLayers();
    } else {
      map.once('style.load', setupLayers);
    }

    // Cleanup
    return () => {
      map.off('style.load', setupLayers);
      if (!map || !map.getStyle()) return;

      try {
        if (map.getLayer(LINE_LAYER_ID)) {
          map.removeLayer(LINE_LAYER_ID);
        }
        if (map.getLayer(FILL_LAYER_ID)) {
          map.removeLayer(FILL_LAYER_ID);
        }
        if (map.getSource(SOURCE_ID)) {
          map.removeSource(SOURCE_ID);
        }
      } catch (e) {
        // Ignore errors during cleanup
      }
      layersAddedRef.current = false;
    };
  }, [map, reefsData, opacity]);

  // Update visibility
  useEffect(() => {
    if (!map || !layersAddedRef.current) return;

    try {
      if (map.getLayer(FILL_LAYER_ID)) {
        map.setLayoutProperty(FILL_LAYER_ID, 'visibility', visible ? 'visible' : 'none');
      }
      if (map.getLayer(LINE_LAYER_ID)) {
        map.setLayoutProperty(LINE_LAYER_ID, 'visibility', visible ? 'visible' : 'none');
      }
    } catch (e) {
      // Ignore errors if layers don't exist
    }
  }, [map, visible]);

  // Update opacity
  useEffect(() => {
    if (!map || !layersAddedRef.current) return;

    try {
      if (map.getLayer(FILL_LAYER_ID)) {
        map.setPaintProperty(FILL_LAYER_ID, 'fill-opacity', [
          'case',
          ['boolean', ['feature-state', 'hover'], false],
          opacity * 0.9,
          opacity * 0.6
        ]);
      }
      if (map.getLayer(LINE_LAYER_ID)) {
        map.setPaintProperty(LINE_LAYER_ID, 'line-opacity', opacity);
      }
    } catch (e) {
      // Ignore errors
    }
  }, [map, opacity]);

  // Handle hover events
  useEffect(() => {
    if (!map) return;

    const handleMouseMove = (e: any) => {
      if (e.features && e.features.length > 0) {
        // Clear previous hover state
        if (hoveredIdRef.current !== null) {
          map.setFeatureState(
            { source: SOURCE_ID, id: hoveredIdRef.current },
            { hover: false }
          );
        }

        // Set new hover state
        hoveredIdRef.current = e.features[0].id;
        map.setFeatureState(
          { source: SOURCE_ID, id: hoveredIdRef.current },
          { hover: true }
        );

        map.getCanvas().style.cursor = 'pointer';
      }
    };

    const handleMouseLeave = () => {
      if (hoveredIdRef.current !== null) {
        map.setFeatureState(
          { source: SOURCE_ID, id: hoveredIdRef.current },
          { hover: false }
        );
      }
      hoveredIdRef.current = null;
      map.getCanvas().style.cursor = '';
    };

    map.on('mousemove', FILL_LAYER_ID, handleMouseMove);
    map.on('mouseleave', FILL_LAYER_ID, handleMouseLeave);

    return () => {
      map.off('mousemove', FILL_LAYER_ID, handleMouseMove);
      map.off('mouseleave', FILL_LAYER_ID, handleMouseLeave);
    };
  }, [map]);

  return null;
}

export default ReefLayerML;
