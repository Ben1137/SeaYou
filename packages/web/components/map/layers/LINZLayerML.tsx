/**
 * LINZLayerML — Official New Zealand marine charts (NZMariner, Layer 50772).
 *
 * Sourced from the LINZ Data Service via the Koordinates tile CDN. Covers
 * New Zealand territorial waters and approaches. Outside NZ the CDN simply
 * serves empty/transparent tiles, so the layer is harmless globally.
 *
 * Tile URL:
 *   https://tiles-cdn.koordinates.com/services;key=<KEY>/tiles/v4/layer=50772/EPSG:3857/{z}/{x}/{y}.png
 *
 * Attribution: Land Information New Zealand (LINZ), CC BY 4.0
 *
 * Free tier — no paywall (open government data).
 */

import { useEffect, useRef } from 'react';
import { useMap } from '../useMap';

export interface LINZLayerMLProps {
  visible: boolean;
  /** 0..1 — defaults to 0.85 */
  opacity?: number;
}

const SOURCE_ID = 'linz-nzmariner-source';
const LAYER_ID = 'linz-nzmariner-layer';

// New Zealand bounding box — MapLibre won't request tiles outside this area
const NZ_BOUNDS: [number, number, number, number] = [165, -48, 178.6, -34];

const ATTRIBUTION =
  '&copy; <a href="https://www.linz.govt.nz" target="_blank" rel="noopener">LINZ</a> (CC BY 4.0)';

// Resolved at bundle time by Vite's static import.meta.env replacement.
// Must be at module scope — inside a component function the substitution
// can silently produce undefined in some Vite/HMR configurations.
const TILE_URL =
  `https://tiles-cdn.koordinates.com/services;key=${import.meta.env.VITE_LINZ_API_KEY}` +
  `/tiles/v4/layer=50772/EPSG:3857/{z}/{x}/{y}.png`;

export function LINZLayerML({ visible, opacity = 0.85 }: LINZLayerMLProps) {
  const map = useMap();
  const addedRef = useRef(false);

  useEffect(() => {
    if (!map) return;

    const setupLayer = () => {
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: 'raster',
          tiles: [TILE_URL],
          tileSize: 256,
          minzoom: 5,
          maxzoom: 18,
          bounds: NZ_BOUNDS,
          attribution: ATTRIBUTION,
        });
      }

      if (!map.getLayer(LAYER_ID)) {
        // No beforeId — chart marks must render above base-map symbols
        map.addLayer({
          id: LAYER_ID,
          type: 'raster',
          source: SOURCE_ID,
          paint: { 'raster-opacity': opacity },
          layout: { visibility: 'visible' },
        });
      } else {
        map.setLayoutProperty(LAYER_ID, 'visibility', 'visible');
        map.setPaintProperty(LAYER_ID, 'raster-opacity', opacity);
      }

      addedRef.current = true;
    };

    const teardownLayer = () => {
      try {
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch {
        // Map may be transitioning / disposed — safe to ignore
      }
      addedRef.current = false;
    };

    if (visible) {
      if (map.isStyleLoaded()) {
        setupLayer();
      } else {
        const onLoad = () => {
          setupLayer();
          map.off('style.load', onLoad);
        };
        map.on('style.load', onLoad);
        return () => map.off('style.load', onLoad);
      }
    } else if (addedRef.current) {
      teardownLayer();
    }

    return () => {
      if (addedRef.current) teardownLayer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, visible]);

  useEffect(() => {
    if (!map || !visible || !addedRef.current) return;
    try {
      if (map.getLayer(LAYER_ID)) {
        map.setPaintProperty(LAYER_ID, 'raster-opacity', opacity);
      }
    } catch {
      // Ignore
    }
  }, [map, visible, opacity]);

  return null;
}

export default LINZLayerML;
