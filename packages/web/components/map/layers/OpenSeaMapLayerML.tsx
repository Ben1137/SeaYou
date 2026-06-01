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
 * Globe projection fix:
 *   The MapTiler Dataviz Dark style JSON declares "projection": {"type": "globe"}.
 *   OpenSeaMap tiles are flat Web Mercator XYZ — re-projecting them onto a
 *   sphere causes per-tile positional drift that worsens with zoom. While the
 *   ENC layer is active, we force the map to mercator projection so tile
 *   coordinates align exactly with the basemap. A style.load listener re-applies
 *   mercator if a style reload ever reverts the setting. On teardown, globe is
 *   restored so GPGPU particle layers (wind/current) continue draping correctly.
 *
 * Dark mode legibility — dual-layer technique:
 *   OpenSeaMap tiles use black text and colored symbols on a transparent
 *   background. On a dark basemap, black text becomes invisible.
 *   raster-brightness-* cannot distinguish black text from red/green buoys —
 *   any uniform brightness boost washes out the navigation marker colors.
 *
 *   Solution: two layers sharing the same cached source (no extra HTTP cost).
 *   1. BACKING layer (below) — brightness forced to max, opacity 20%.
 *      Forces all inked pixels to pure white at low opacity, giving black text
 *      a soft white glow. Transparent pixels remain transparent (alpha is
 *      unaffected by brightness properties).
 *   2. MAIN layer (above) — zero raster-* adjustments, native PNG colors.
 *      Red stays red, green stays green. This is the authoritative render.
 *
 * raster-fade-duration is set to 0 on both layers to suppress the black
 * compositing artifact in MapLibre GL JS 5.0 where newly-added raster layers
 * briefly appear as a solid black rectangle before tiles arrive.
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

const SOURCE_ID      = 'openseamap-source';
const LAYER_ID       = 'openseamap-layer';
const BACKING_LAYER_ID = 'openseamap-backing';
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

  // ── Projection toggle ──────────────────────────────────────────────────────
  // The MapTiler Dataviz Dark style declares "projection": {"type": "globe"}.
  // We must override this to mercator while ENC is active so XYZ tiles align.
  // The style.load listener re-applies mercator if a style reload reverts it.
  useEffect(() => {
    if (!map || !visible) return;

    const forceProjection = () => {
      map.setProjection({ type: 'mercator' });
    };

    forceProjection();
    map.on('style.load', forceProjection);

    return () => {
      map.off('style.load', forceProjection);
      // Restore globe — the MapTiler style's native projection
      map.setProjection({ type: 'globe' });
    };
  }, [map, visible]);

  // ── Layer lifecycle ────────────────────────────────────────────────────────
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

      // BACKING: forces all inked pixels → white at low opacity.
      // Gives black text a soft white glow on the dark basemap.
      // Same cached source — no extra HTTP requests.
      if (!map.getLayer(BACKING_LAYER_ID)) {
        map.addLayer({
          id: BACKING_LAYER_ID,
          type: 'raster',
          source: SOURCE_ID,
          paint: {
            'raster-opacity': opacity * 0.24,
            'raster-fade-duration': 0,
            'raster-brightness-min': 1,
            'raster-brightness-max': 1,
          },
          layout: { visibility: 'visible' },
        });
      } else {
        map.setLayoutProperty(BACKING_LAYER_ID, 'visibility', 'visible');
        map.setPaintProperty(BACKING_LAYER_ID, 'raster-opacity', opacity * 0.24);
      }

      // MAIN: native PNG colors, zero raster-* adjustments.
      // This is the authoritative render — red/green markers are exact.
      if (!map.getLayer(LAYER_ID)) {
        // NOTE: intentionally no `beforeId` — navigational marks must render
        // ABOVE everything else (including base-map symbol layers).
        map.addLayer({
          id: LAYER_ID,
          type: 'raster',
          source: SOURCE_ID,
          paint: {
            'raster-opacity': opacity,
            'raster-fade-duration': 0,
          },
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
        if (map.getLayer(BACKING_LAYER_ID)) map.removeLayer(BACKING_LAYER_ID);
        if (map.getLayer(LAYER_ID))         map.removeLayer(LAYER_ID);
        if (map.getSource(SOURCE_ID))       map.removeSource(SOURCE_ID);
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

  // ── Opacity sync ───────────────────────────────────────────────────────────
  // Update opacity in-place when it changes (without recreating the layers)
  useEffect(() => {
    if (!map || !visible || !addedRef.current) return;
    try {
      if (map.getLayer(LAYER_ID))
        map.setPaintProperty(LAYER_ID, 'raster-opacity', opacity);
      if (map.getLayer(BACKING_LAYER_ID))
        map.setPaintProperty(BACKING_LAYER_ID, 'raster-opacity', opacity * 0.24);
    } catch {
      // Ignore — layer might be transitioning
    }
  }, [map, visible, opacity]);

  // This component renders no DOM — only side effects on the map
  return null;
}

export default OpenSeaMapLayerML;
