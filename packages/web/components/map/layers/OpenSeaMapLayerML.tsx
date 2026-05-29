/**
 * OpenSeaMapLayerML — MapLibre GL JS raster overlay for OpenSeaMap
 *
 * Renders the OpenSeaMap "seamark" tile layer on top of the base map. This is
 * the same data set used by professional ENC (Electronic Navigational Chart)
 * viewers and includes:
 *   - Buoys, beacons, lighthouses
 *   - Channel markers and lateral marks
 *   - Harbour boundaries, anchorages, mooring areas
 *   - Light sectors, fog signals, depth contours (where surveyed)
 *
 * Tile URL: https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png
 * Tile size: 256 (NOT 512 like RainViewer)
 * Attribution: OpenSeaMap (OpenStreetMap-derived data, ODbL)
 *
 * Rendering rules:
 *   - The layer is added with NO `beforeId` so navigational marks render
 *     ABOVE the base map (including labels). Skippers need the marks visible
 *     even when zoomed in tight to a coastline.
 *   - Source/layer are torn down on unmount AND when `visible` becomes false
 *     so the browser stops fetching tiles entirely when toggled off.
 *
 * Dark-mode legibility: OpenSeaMap seamark tiles have transparent backgrounds
 * with dark-outlined symbols.  On SeaYou's dark basemap the symbols are nearly
 * invisible and a MapLibre GL JS 5.0 rendering artifact causes the raster layer
 * to initially appear as a solid-black rectangle while tiles are loading.
 * A global paper-coloured fill layer (osm-bg-layer) is inserted beneath the
 * raster layer at low opacity so:
 *   a) The black loading-state artifact is masked.
 *   b) Seamark symbols render against a slightly lighter backdrop and are legible.
 * raster-fade-duration is set to 0 to additionally suppress the black fade-in
 * that MapLibre uses when tiles are first composited.
 *
 * Phase 8 — Pro Navigation Engine (ENC overlay)
 */

import { useEffect, useRef } from 'react';
import { useMap } from '../useMap';

// ─── Types ───

export interface OpenSeaMapLayerMLProps {
  visible: boolean;
  /** 0..1 — defaults to 0.85 so marks remain crisp without overpowering the base map */
  opacity?: number;
}

// ─── Constants ───

const SOURCE_ID    = 'openseamap-source';
const LAYER_ID     = 'openseamap-layer';
const BG_SOURCE_ID = 'osm-bg-source';
const BG_LAYER_ID  = 'osm-bg-layer';

const TILE_URL = 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png';
const ATTRIBUTION =
  '&copy; <a href="https://www.openseamap.org" target="_blank" rel="noopener">OpenSeaMap</a> contributors';
const DEFAULT_OPACITY = 0.85;

// Warm off-white that mimics traditional nautical chart paper.
// Used at low opacity so it only slightly brightens the ocean without
// destroying the dark-mode aesthetic.
const PAPER_COLOR = '#f4f1ea';
// Fraction of PAPER_COLOR blended over the basemap — keep this low so dark
// mode is preserved while seamark symbols remain legible.
const BG_OPACITY = 0.20;

// GeoJSON covering the entire world — used as the backdrop fill geometry.
const WORLD_BBOX_GEOJSON: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-180, -90],
            [ 180, -90],
            [ 180,  90],
            [-180,  90],
            [-180, -90],
          ],
        ],
      },
    },
  ],
};

// ─── Component ───

export function OpenSeaMapLayerML({
  visible,
  opacity = DEFAULT_OPACITY,
}: OpenSeaMapLayerMLProps) {
  const map = useMap();
  const addedRef = useRef(false);

  // Add / remove the layer when `visible` changes
  useEffect(() => {
    if (!map) return;

    const setupLayer = () => {
      // ── 1. Paper backdrop (fill) — added FIRST so raster renders on top ──
      if (!map.getSource(BG_SOURCE_ID)) {
        map.addSource(BG_SOURCE_ID, {
          type: 'geojson',
          data: WORLD_BBOX_GEOJSON,
        });
      }
      if (!map.getLayer(BG_LAYER_ID)) {
        map.addLayer({
          id: BG_LAYER_ID,
          type: 'fill',
          source: BG_SOURCE_ID,
          paint: {
            'fill-color': PAPER_COLOR,
            'fill-opacity': BG_OPACITY,
          },
        });
      } else {
        map.setLayoutProperty(BG_LAYER_ID, 'visibility', 'visible');
      }

      // ── 2. Seamark raster — added AFTER backdrop so symbols appear on top ──
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: 'raster',
          tiles: [TILE_URL],
          tileSize: 256,
          attribution: ATTRIBUTION,
        });
      }

      if (!map.getLayer(LAYER_ID)) {
        // NOTE: intentionally no `beforeId` — navigational marks must render
        // ABOVE everything else (including base-map symbol layers).
        map.addLayer({
          id: LAYER_ID,
          type: 'raster',
          source: SOURCE_ID,
          paint: {
            'raster-opacity': opacity,
            // Suppress the black-rectangle artifact in MapLibre GL JS 5.0:
            // without this, the raster layer starts fully transparent (black
            // in WebGL) and fades in, making tiles appear as a solid-black
            // overlay on slow CDN responses.
            'raster-fade-duration': 0,
          },
          layout: {
            visibility: 'visible',
          },
        });
      } else {
        // Already exists — just toggle visibility / opacity
        map.setLayoutProperty(LAYER_ID, 'visibility', 'visible');
        map.setPaintProperty(LAYER_ID, 'raster-opacity', opacity);
      }

      addedRef.current = true;
    };

    const teardownLayer = () => {
      try {
        if (map.getLayer(LAYER_ID))     map.removeLayer(LAYER_ID);
        if (map.getSource(SOURCE_ID))   map.removeSource(SOURCE_ID);
        if (map.getLayer(BG_LAYER_ID))  map.removeLayer(BG_LAYER_ID);
        if (map.getSource(BG_SOURCE_ID)) map.removeSource(BG_SOURCE_ID);
      } catch (e) {
        // Map may be in transition / disposed — safe to ignore
      }
      addedRef.current = false;
    };

    if (visible) {
      // Style may not be loaded yet on first mount
      if (map.isStyleLoaded()) {
        setupLayer();
      } else {
        const onLoad = () => {
          setupLayer();
          map.off('style.load', onLoad);
        };
        map.on('style.load', onLoad);
        return () => {
          map.off('style.load', onLoad);
        };
      }
    } else if (addedRef.current) {
      teardownLayer();
    }

    // Cleanup on unmount: always tear down so the browser stops fetching tiles
    return () => {
      if (addedRef.current) {
        teardownLayer();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, visible]);

  // Update opacity in-place when it changes (without recreating the layer)
  useEffect(() => {
    if (!map || !visible || !addedRef.current) return;
    try {
      if (map.getLayer(LAYER_ID)) {
        map.setPaintProperty(LAYER_ID, 'raster-opacity', opacity);
      }
    } catch {
      // Ignore — layer might be transitioning
    }
  }, [map, visible, opacity]);

  // This component renders no DOM — only side effects on the map
  return null;
}

export default OpenSeaMapLayerML;
