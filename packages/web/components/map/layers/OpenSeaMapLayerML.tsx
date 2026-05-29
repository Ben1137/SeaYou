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
 * Dark-mode legibility: OpenSeaMap seamark tiles are sparse transparent overlays
 * (404 where no symbol exists — expected) baked for a LIGHT background — dark ink
 * symbols on transparent PNG. On the near-black MapTiler ocean they are invisible.
 *
 * MapLibre GL JS 5.x has no raster-color/per-pixel remap (that is a Mapbox-
 * proprietary extension not ported to MapLibre). The raster shader applies:
 *   output = mix(vec3(brightness_min), vec3(brightness_max), rgb_channel)
 * Setting brightness_min=0.60 maps near-black ink pixels (value ~0) to
 * medium grey (~0.60) — clearly visible against the dark ocean. Saturated buoy
 * colors (red/green lateral marks, yellow special marks) retain their IALA hue
 * identity and just become lighter, which is correct for dark-mode display.
 * Full inversion (brightness_min=1, brightness_max=0) would flip red→cyan and
 * break the IALA color system — so it is NOT used here.
 *
 * raster-fade-duration is set to 0 to suppress the black compositing artifact in
 * MapLibre GL JS 5.0 where newly-added raster layers briefly appear as a solid
 * black rectangle before tiles arrive.
 *
 * Long-term note: the raster overlay will always fight a dark base because tiles
 * are baked for a light background. The robust fix is vector seamark tiles +
 * sprites styled for dark mode (as used by prozessor13/seamap). Consider as a
 * future epic if legibility remains insufficient.
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

const SOURCE_ID = 'openseamap-source';
const LAYER_ID  = 'openseamap-layer';
const TILE_URL  = 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png';
const ATTRIBUTION =
  '&copy; <a href="https://www.openseamap.org" target="_blank" rel="noopener">OpenSeaMap</a> contributors';
const DEFAULT_OPACITY = 0.85;

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
            // Lift dark seamark ink to a visible grey against the near-black ocean.
            // Shader: output = mix(vec3(brightness_min), vec3(brightness_max), rgb)
            // → input black (ink, ~0) maps to 0.60 (visible medium grey)
            // → input white (paper halo, ~1) maps to 1.0 (bright highlight)
            // Saturated IALA colors (red/green/yellow marks) keep their hue and
            // just become lighter. NOT using inversion (min=1,max=0) which would
            // flip red→cyan and break the IALA color system.
            'raster-brightness-min': 0.60,
            'raster-brightness-max': 1.0,
            // Boost contrast to sharpen symbol edges on the lifted-brightness canvas.
            'raster-contrast': 0.2,
            // Suppress the MapLibre GL JS 5.0 black-rectangle loading artifact:
            // without this the layer fades in from a WebGL-transparent (black)
            // state, making it briefly appear as a solid dark rectangle.
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
        if (map.getLayer(LAYER_ID))   map.removeLayer(LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch {
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
