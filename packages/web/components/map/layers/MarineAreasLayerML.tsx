/**
 * MarineAreasLayerML - MapLibre GL JS marine areas layer
 * Uses native fill + line + symbol layers for ocean/sea region polygons
 * Source: Natural Earth 10m marine area polygons
 */

import { useEffect, useRef, useState } from 'react';
import { useMap } from '../useMap';
import type { GeoJSONSource } from 'maplibre-gl';

// ------------------------------------------------------------------
// Types & Interfaces
// ------------------------------------------------------------------

export interface MarineAreasLayerMLProps {
  visible: boolean;
  opacity?: number;
}

// ------------------------------------------------------------------
// Constants & Configuration
// ------------------------------------------------------------------

const SOURCE_ID = 'marine-areas-source';
const FILL_LAYER_ID = 'marine-areas-fill';
const LINE_LAYER_ID = 'marine-areas-outline';
const LABEL_LAYER_ID = 'marine-areas-label';

const MARINE_AREAS_LOCAL_URL = '/SeaYou/geojson/10m/marine_areas.json';
const MARINE_AREAS_FALLBACK_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_geography_marine_polys.geojson';

// Colors — purple palette to match the UI button (`bg-purple-600`)
const MARINE_FILL_COLOR = '#7b1fa2';      // Deep purple fill
const MARINE_OUTLINE_COLOR = '#ce93d8';   // Light purple outline
const MARINE_LABEL_COLOR = '#e1bee7';     // Very light purple text

// ------------------------------------------------------------------
// Data Fetching (module-level cache)
// ------------------------------------------------------------------

let marineAreasCache: GeoJSON.FeatureCollection | null = null;

async function fetchMarineAreasData(): Promise<GeoJSON.FeatureCollection | null> {
  if (marineAreasCache) return marineAreasCache;

  // Try local URL first
  try {
    const response = await fetch(MARINE_AREAS_LOCAL_URL);
    if (response.ok) {
      const data = await response.json();
      marineAreasCache = data;
      console.log('[MarineAreasLayerML] Loaded marine areas data from local');
      return data;
    }
  } catch (_error) {
    // Local fetch failed, try remote fallback
  }

  // Try remote fallback
  try {
    const response = await fetch(MARINE_AREAS_FALLBACK_URL);
    if (response.ok) {
      const data = await response.json();
      marineAreasCache = data;
      console.log('[MarineAreasLayerML] Loaded marine areas data from remote fallback');
      return data;
    }
  } catch (error) {
    console.error('[MarineAreasLayerML] Fetch error:', error);
  }

  return null;
}

// ------------------------------------------------------------------
// Main Component
// ------------------------------------------------------------------

export function MarineAreasLayerML({ visible, opacity = 0.5 }: MarineAreasLayerMLProps) {
  const map = useMap();
  const [marineAreasData, setMarineAreasData] = useState<GeoJSON.FeatureCollection | null>(null);
  const layersAddedRef = useRef(false);
  const hoveredIdRef = useRef<string | number | null>(null);

  // Load data on first visibility
  useEffect(() => {
    if (!visible) return;

    fetchMarineAreasData().then(data => {
      if (data) {
        // Assign numeric IDs to features for feature-state hover support
        const dataWithIds: GeoJSON.FeatureCollection = {
          ...data,
          features: data.features.map((f, i) => ({
            ...f,
            id: f.id ?? i,
          })),
        };
        setMarineAreasData(dataWithIds);
      }
    });
  }, [visible]);

  // Add source and layers to map
  useEffect(() => {
    if (!map || !marineAreasData) return;

    const setupLayers = () => {
      // Add or update source
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: 'geojson',
          data: marineAreasData,
          generateId: true,
        });
      } else {
        (map.getSource(SOURCE_ID) as GeoJSONSource).setData(marineAreasData);
      }

      // Fill layer — subtle, semi-transparent ocean tint
      if (!map.getLayer(FILL_LAYER_ID)) {
        map.addLayer({
          id: FILL_LAYER_ID,
          type: 'fill',
          source: SOURCE_ID,
          paint: {
            'fill-color': MARINE_FILL_COLOR,
            'fill-opacity': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              opacity * 0.35,
              opacity * 0.15,
            ],
          },
          layout: {
            visibility: visible ? 'visible' : 'none',
          },
        });
      }

      // Outline layer — dashed boundary lines
      if (!map.getLayer(LINE_LAYER_ID)) {
        map.addLayer({
          id: LINE_LAYER_ID,
          type: 'line',
          source: SOURCE_ID,
          paint: {
            'line-color': MARINE_OUTLINE_COLOR,
            'line-width': 1,
            'line-opacity': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              opacity,
              opacity * 0.5,
            ],
            'line-dasharray': [4, 4],
          },
          layout: {
            visibility: visible ? 'visible' : 'none',
            'line-join': 'round',
          },
        });
      }

      // Label layer — ocean/sea names in italic (cartographic convention)
      if (!map.getLayer(LABEL_LAYER_ID)) {
        map.addLayer({
          id: LABEL_LAYER_ID,
          type: 'symbol',
          source: SOURCE_ID,
          filter: ['<=', ['get', 'min_label'], 4], // Only show labels at appropriate zoom
          paint: {
            'text-color': MARINE_LABEL_COLOR,
            'text-halo-color': 'rgba(0, 0, 0, 0.75)',
            'text-halo-width': 1.5,
            'text-opacity': opacity,
          },
          layout: {
            visibility: visible ? 'visible' : 'none',
            'text-field': ['get', 'name'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 2, 10, 5, 13, 8, 16],
            'text-font': ['Open Sans Italic', 'Arial Unicode MS Regular'],
            'text-max-width': 10,
            'text-letter-spacing': 0.15,
            'text-transform': 'uppercase',
            'symbol-placement': 'point',
          },
        });
      }

      layersAddedRef.current = true;
      console.log('[MarineAreasLayerML] Layers added to map');
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
        if (map.getLayer(LABEL_LAYER_ID)) map.removeLayer(LABEL_LAYER_ID);
        if (map.getLayer(LINE_LAYER_ID)) map.removeLayer(LINE_LAYER_ID);
        if (map.getLayer(FILL_LAYER_ID)) map.removeLayer(FILL_LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch (_e) {
        // Ignore cleanup errors
      }
      layersAddedRef.current = false;
    };
  }, [map, marineAreasData, opacity]);

  // Update visibility
  useEffect(() => {
    if (!map || !layersAddedRef.current) return;
    const vis = visible ? 'visible' : 'none';
    try {
      for (const id of [FILL_LAYER_ID, LINE_LAYER_ID, LABEL_LAYER_ID]) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis);
      }
    } catch (_e) {
      // Ignore
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
          opacity * 0.35,
          opacity * 0.15,
        ]);
      }
      if (map.getLayer(LINE_LAYER_ID)) {
        map.setPaintProperty(LINE_LAYER_ID, 'line-opacity', [
          'case',
          ['boolean', ['feature-state', 'hover'], false],
          opacity,
          opacity * 0.5,
        ]);
      }
      if (map.getLayer(LABEL_LAYER_ID)) {
        map.setPaintProperty(LABEL_LAYER_ID, 'text-opacity', opacity);
      }
    } catch (_e) {
      // Ignore
    }
  }, [map, opacity]);

  // Hover interaction
  useEffect(() => {
    if (!map) return;

    const handleMouseMove = (e: any) => {
      if (e.features && e.features.length > 0) {
        // Clear previous hover
        if (hoveredIdRef.current !== null) {
          map.setFeatureState(
            { source: SOURCE_ID, id: hoveredIdRef.current },
            { hover: false }
          );
        }
        hoveredIdRef.current = e.features[0].id as string | number;
        map.setFeatureState(
          { source: SOURCE_ID, id: hoveredIdRef.current },
          { hover: true }
        );
        map.getCanvas().style.cursor = 'default';
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

export default MarineAreasLayerML;
