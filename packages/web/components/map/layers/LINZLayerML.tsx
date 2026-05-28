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
 * Dark-mode legibility: NZMariner tiles have transparent backgrounds — black
 * linework is invisible on SeaYou's dark basemap. A paper-coloured fill layer
 * (linz-bg-layer) is inserted beneath the raster layer so chart lines render
 * on a light backdrop. Both layers share the same opacity value.
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
const LAYER_ID  = 'linz-nzmariner-layer';
const BG_SOURCE_ID = 'linz-bg-source';
const BG_LAYER_ID  = 'linz-bg-layer';

// Paper backdrop colour — warm off-white mimicking traditional chart paper.
const PAPER_COLOR = '#f4f1ea';

// New Zealand bounding box — MapLibre won't request tiles outside this area.
const NZ_BOUNDS: [number, number, number, number] = [165, -48, 178.6, -34];

// GeoJSON polygon matching NZ_BOUNDS, used for the paper backdrop fill layer.
const NZ_BBOX_GEOJSON: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        // [minLng, minLat] → [maxLng, minLat] → [maxLng, maxLat] → [minLng, maxLat] → close
        coordinates: [
          [
            [165,   -48],
            [178.6, -48],
            [178.6, -34],
            [165,   -34],
            [165,   -48],
          ],
        ],
      },
    },
  ],
};

const ATTRIBUTION =
  '&copy; <a href="https://www.linz.govt.nz" target="_blank" rel="noopener">LINZ</a> (CC BY 4.0)';

// Resolved at bundle time by Vite's static import.meta.env replacement.
// Must be at module scope — inside a component function the substitution
// can silently produce undefined in some Vite/HMR configurations.
const LINZ_API_KEY = import.meta.env.VITE_LINZ_API_KEY;

// True only when the key is a non-empty string that isn't the literal
// "undefined" (which Vite produces when the env var is absent at build time).
const LINZ_KEY_VALID =
  typeof LINZ_API_KEY === 'string' &&
  LINZ_API_KEY.length > 0 &&
  LINZ_API_KEY !== 'undefined';

const TILE_URL = LINZ_KEY_VALID
  ? `https://tiles-cdn.koordinates.com/services;key=${LINZ_API_KEY}` +
    `/tiles/v4/layer=50772/EPSG:3857/{z}/{x}/{y}.png`
  : '';

export function LINZLayerML({ visible, opacity = 0.85 }: LINZLayerMLProps) {
  const map = useMap();
  const addedRef = useRef(false);

  useEffect(() => {
    if (!map) return;

    const setupLayer = () => {
      if (!LINZ_KEY_VALID) {
        console.warn(
          '[LINZLayerML] VITE_LINZ_API_KEY is missing or invalid. ' +
          'The New Zealand marine chart layer will be disabled. ' +
          'Add the key to your .env file (local) or environment variables (production).'
        );
        return;
      }

      // ── 1. Paper backdrop (fill) — added FIRST so raster renders on top ──
      if (!map.getSource(BG_SOURCE_ID)) {
        map.addSource(BG_SOURCE_ID, {
          type: 'geojson',
          data: NZ_BBOX_GEOJSON,
        });
      }
      if (!map.getLayer(BG_LAYER_ID)) {
        map.addLayer({
          id: BG_LAYER_ID,
          type: 'fill',
          source: BG_SOURCE_ID,
          paint: {
            'fill-color': PAPER_COLOR,
            'fill-opacity': opacity,
          },
        });
      } else {
        map.setPaintProperty(BG_LAYER_ID, 'fill-opacity', opacity);
      }

      // ── 2. Chart raster — added AFTER backdrop so lines appear on top ──
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
        if (map.getLayer(LAYER_ID))  map.removeLayer(LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
        if (map.getLayer(BG_LAYER_ID))  map.removeLayer(BG_LAYER_ID);
        if (map.getSource(BG_SOURCE_ID)) map.removeSource(BG_SOURCE_ID);
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

  // Update opacity on both layers in-place without recreating them
  useEffect(() => {
    if (!map || !visible || !addedRef.current) return;
    try {
      if (map.getLayer(LAYER_ID))   map.setPaintProperty(LAYER_ID,   'raster-opacity', opacity);
      if (map.getLayer(BG_LAYER_ID)) map.setPaintProperty(BG_LAYER_ID, 'fill-opacity',   opacity);
    } catch {
      // Ignore — layers may be transitioning
    }
  }, [map, visible, opacity]);

  return null;
}

export default LINZLayerML;
