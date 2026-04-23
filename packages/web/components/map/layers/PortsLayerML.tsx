/**
 * PortsLayerML - MapLibre GL JS implementation of ports layer
 * Uses native circle + symbol layers for optimal performance
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useMap } from '../useMap';
import type { Map as MaplibreMap, GeoJSONSource } from 'maplibre-gl';

// ------------------------------------------------------------------
// Types & Interfaces
// ------------------------------------------------------------------

export interface PortFeature {
  id: string;
  name: string;
  coordinates: [number, number]; // [lng, lat] for GeoJSON
  properties: {
    scalerank?: number;
    featurecla?: string;
    website?: string;
    natlscale?: number;
    [key: string]: any;
  };
}

export interface PortsLayerMLProps {
  visible: boolean;
  onPortClick?: (port: PortFeature) => void;
}

// ------------------------------------------------------------------
// Constants & Configuration
// ------------------------------------------------------------------

const SOURCE_ID = 'ports-source';
const CIRCLE_LAYER_ID = 'ports-circle';
const SYMBOL_LAYER_ID = 'ports-label';

// Natural Earth ports data URLs
const PORTS_LOCAL_URL = '/SeaYou/geojson/10m/ports.json';
const PORTS_FALLBACK_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_ports.geojson';

// ------------------------------------------------------------------
// Data Fetching
// ------------------------------------------------------------------

let portsCache: GeoJSON.FeatureCollection | null = null;

/**
 * Exported so the Route Planner's port-search bar can reuse the same
 * cached Natural Earth dataset without paying for a separate fetch.
 * Resolves to `null` if both local + remote sources fail.
 */
export async function fetchPortsData(): Promise<GeoJSON.FeatureCollection | null> {
  if (portsCache) return portsCache;

  // Try local URL first
  try {
    const response = await fetch(PORTS_LOCAL_URL);
    if (response.ok) {
      const data = await response.json();
      portsCache = data;
      console.log('[PortsLayerML] Loaded ports data from local');
      return data;
    }
  } catch (error) {
    // Local fetch failed, try fallback
  }

  // Try remote fallback
  try {
    const response = await fetch(PORTS_FALLBACK_URL);
    if (response.ok) {
      const data = await response.json();
      portsCache = data;
      console.log('[PortsLayerML] Loaded ports data from remote fallback');
      return data;
    }
  } catch (error) {
    console.error('[PortsLayerML] Fetch error:', error);
  }

  return null;
}

// ------------------------------------------------------------------
// Main Component
// ------------------------------------------------------------------

export function PortsLayerML({ visible, onPortClick }: PortsLayerMLProps) {
  const map = useMap();
  const [portsData, setPortsData] = useState<GeoJSON.FeatureCollection | null>(null);
  const layersAddedRef = useRef(false);

  // Load ports data
  useEffect(() => {
    if (!visible) return;

    const loadData = async () => {
      const data = await fetchPortsData();
      if (data) {
        setPortsData(data);
      }
    };

    loadData();
  }, [visible]);

  // Add source and layers to map
  useEffect(() => {
    if (!map || !portsData) return;

    const setupLayers = () => {
      // Add source if not exists
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: 'geojson',
          data: portsData,
        });
      } else {
        // Update existing source
        (map.getSource(SOURCE_ID) as GeoJSONSource).setData(portsData);
      }

      // Add circle layer if not exists
      if (!map.getLayer(CIRCLE_LAYER_ID)) {
        map.addLayer({
          id: CIRCLE_LAYER_ID,
          type: 'circle',
          source: SOURCE_ID,
          paint: {
            // Size based on scalerank (lower = bigger port)
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['coalesce', ['get', 'scalerank'], 5],
              1, 12,  // Major ports
              3, 10,
              5, 8,
              7, 6,
              10, 4   // Minor ports
            ],
            // Color gradient based on scalerank
            'circle-color': [
              'interpolate',
              ['linear'],
              ['coalesce', ['get', 'scalerank'], 5],
              1, '#1a365d',  // Major ports - dark blue
              5, '#2c5282',  // Medium ports
              10, '#4a5568'  // Minor ports - gray
            ],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 0.9,
          },
          layout: {
            'visibility': visible ? 'visible' : 'none',
          },
        });
      }

      // Add symbol layer for labels if not exists
      if (!map.getLayer(SYMBOL_LAYER_ID)) {
        map.addLayer({
          id: SYMBOL_LAYER_ID,
          type: 'symbol',
          source: SOURCE_ID,
          layout: {
            'text-field': ['get', 'name'],
            'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
            'text-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              6, 0,    // Hide labels at low zoom
              8, 10,
              12, 12
            ],
            'text-offset': [0, 1.5],
            'text-anchor': 'top',
            'text-optional': true,
            'visibility': visible ? 'visible' : 'none',
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-color': '#1a202c',
            'text-halo-width': 1.5,
          },
          minzoom: 7, // Only show labels at higher zoom levels
        });
      }

      layersAddedRef.current = true;
    };

    // Wait for style to load if needed
    if (map.isStyleLoaded()) {
      setupLayers();
    } else {
      map.once('style.load', setupLayers);
    }

    // Cleanup
    return () => {
      if (!map || !map.getStyle()) return;

      try {
        if (map.getLayer(SYMBOL_LAYER_ID)) {
          map.removeLayer(SYMBOL_LAYER_ID);
        }
        if (map.getLayer(CIRCLE_LAYER_ID)) {
          map.removeLayer(CIRCLE_LAYER_ID);
        }
        if (map.getSource(SOURCE_ID)) {
          map.removeSource(SOURCE_ID);
        }
      } catch (e) {
        // Ignore errors during cleanup
      }
      layersAddedRef.current = false;
    };
  }, [map, portsData]);

  // Update visibility
  useEffect(() => {
    if (!map || !layersAddedRef.current) return;

    try {
      if (map.getLayer(CIRCLE_LAYER_ID)) {
        map.setLayoutProperty(CIRCLE_LAYER_ID, 'visibility', visible ? 'visible' : 'none');
      }
      if (map.getLayer(SYMBOL_LAYER_ID)) {
        map.setLayoutProperty(SYMBOL_LAYER_ID, 'visibility', visible ? 'visible' : 'none');
      }
    } catch (e) {
      // Ignore errors if layers don't exist
    }
  }, [map, visible]);

  // Handle click events
  useEffect(() => {
    if (!map || !onPortClick) return;

    const handleClick = (e: any) => {
      if (e.features && e.features.length > 0) {
        const feature = e.features[0];
        const port: PortFeature = {
          id: feature.properties?.name || `port-${feature.id}`,
          name: feature.properties?.name || 'Unknown Port',
          coordinates: feature.geometry.coordinates as [number, number],
          properties: feature.properties || {},
        };
        onPortClick(port);
      }
    };

    const handleMouseEnter = () => {
      if (map.getCanvas()) {
        map.getCanvas().style.cursor = 'pointer';
      }
    };

    const handleMouseLeave = () => {
      if (map.getCanvas()) {
        map.getCanvas().style.cursor = '';
      }
    };

    // Wire up click + hover on both the circle and the label so a tap on the
    // text or the dot both open the rich Google-Places popup.
    const layerIds = [CIRCLE_LAYER_ID, SYMBOL_LAYER_ID];
    layerIds.forEach(id => {
      map.on('click', id, handleClick);
      map.on('mouseenter', id, handleMouseEnter);
      map.on('mouseleave', id, handleMouseLeave);
    });

    return () => {
      layerIds.forEach(id => {
        map.off('click', id, handleClick);
        map.off('mouseenter', id, handleMouseEnter);
        map.off('mouseleave', id, handleMouseLeave);
      });
    };
  }, [map, onPortClick]);

  return null;
}

export default PortsLayerML;
