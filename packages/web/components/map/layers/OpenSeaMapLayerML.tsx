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
 *   sphere causes per-tile positional drift that worsens with zoom.
 *
 *   CRITICAL BUG THAT WAS FIXED HERE:
 *   Previously this component had two separate useEffect hooks sharing [map, visible]
 *   deps — one for setProjection, one for addSource/addLayer. React runs them in
 *   declaration order. setProjection() calls tileManagers[key].reload() on every
 *   basemap source, putting tiles into 'reloading' state. This makes isStyleLoaded()
 *   return false (style.loaded() iterates tileManagers and returns false for any
 *   tile in 'reloading' state). The layer lifecycle effect then deferred setupLayer()
 *   to a style.load listener that NEVER fires (style.load only fires on full style
 *   JSON reload, never after setProjection). Silent failure: source/layers never added.
 *
 *   Fix: single useEffect merges both operations. setProjection() is called first
 *   (synchronous), then setupLayer() immediately after — no isStyleLoaded() check
 *   needed because setProjection() itself only works when the style IS loaded.
 *   Uses !!map.getStyle() for the fallback gate instead of isStyleLoaded(), because
 *   getStyle() returns the parsed style object regardless of tile reload state.
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

const SOURCE_ID        = 'openseamap-source';
const LAYER_ID         = 'openseamap-layer';
const BACKING_LAYER_ID = 'openseamap-backing';
const TILE_URL         = 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png';
const ATTRIBUTION      =
  '&copy; <a href="https://www.openseamap.org" target="_blank" rel="noopener">OpenSeaMap</a> contributors';
const DEFAULT_OPACITY  = 0.85;

const LOG = (...args: unknown[]) =>
  console.log('[OpenSeaMap]', ...args);

// ─── Component ───

export function OpenSeaMapLayerML({
  visible,
  opacity = DEFAULT_OPACITY,
}: OpenSeaMapLayerMLProps) {
  const map = useMap();
  const addedRef = useRef(false);

  // ── Unified lifecycle: projection + layer setup in one effect ─────────────
  //
  // WHY SINGLE EFFECT: setProjection() calls tileManagers.reload() which
  // transitions basemap tiles to 'reloading', making isStyleLoaded() return
  // false. If projection and layer setup are in separate effects, the layer
  // effect sees isStyleLoaded()=false and defers to style.load — which never
  // fires after setProjection. Merging into one effect eliminates this race.
  useEffect(() => {
    if (!map) return;

    LOG('effect run — visible:', visible, 'styleReady:', !!map.getStyle());

    const setupLayer = () => {
      LOG('setupLayer() called — addedRef:', addedRef.current);

      if (!map.getSource(SOURCE_ID)) {
        LOG('addSource', SOURCE_ID);
        map.addSource(SOURCE_ID, {
          type: 'raster',
          tiles: [TILE_URL],
          tileSize: 256,
          attribution: ATTRIBUTION,
        });
      } else {
        LOG('source already exists, skipping addSource');
      }

      // BACKING: forces all inked pixels → white at low opacity.
      // Gives black text a soft white glow on the dark basemap.
      // Same cached source — no extra HTTP requests.
      if (!map.getLayer(BACKING_LAYER_ID)) {
        LOG('addLayer', BACKING_LAYER_ID);
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
        LOG('addLayer', LAYER_ID);
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
      LOG('setupLayer() complete — source:', !!map.getSource(SOURCE_ID), 'layer:', !!map.getLayer(LAYER_ID));
    };

    const teardownLayer = () => {
      LOG('teardownLayer()');
      try {
        if (map.getLayer(BACKING_LAYER_ID)) map.removeLayer(BACKING_LAYER_ID);
        if (map.getLayer(LAYER_ID))         map.removeLayer(LAYER_ID);
        if (map.getSource(SOURCE_ID))       map.removeSource(SOURCE_ID);
      } catch {
        // Map may be in transition / disposed — safe to ignore
      }
      addedRef.current = false;
    };

    // Called after any style.load — re-applies projection and re-adds layers.
    // Needed if a future setStyle() reloads the JSON (which declares globe).
    const onStyleLoad = () => {
      LOG('style.load fired while visible — re-applying projection + layers');
      if (visible) {
        map.setProjection({ type: 'mercator' });
        setupLayer();
      }
    };

    if (visible) {
      if (map.getStyle()) {
        // Style JSON is parsed — safe to setProjection + addSource + addLayer
        // immediately, regardless of tile reload state (isStyleLoaded() may be
        // false here due to setProjection's tileManagers.reload() side effect,
        // but that does NOT block addSource/addLayer).
        LOG('style already parsed — setting projection + calling setupLayer immediately');
        map.setProjection({ type: 'mercator' });
        setupLayer();
      } else {
        // Style JSON not yet parsed (early mount) — wait for it
        LOG('style not yet parsed — deferring to style.load');
        map.on('style.load', onStyleLoad);
        return () => {
          LOG('cleanup: removing style.load listener (pre-load case)');
          map.off('style.load', onStyleLoad);
        };
      }

      // Listen for future style reloads (e.g. setStyle() call) while ENC is on
      map.on('style.load', onStyleLoad);

      return () => {
        LOG('cleanup: visible was true — removing listener, restoring globe');
        map.off('style.load', onStyleLoad);
        // Restore the style's native projection (globe) on teardown
        try { map.setProjection({ type: 'globe' }); } catch { /* map disposed */ }
        if (addedRef.current) teardownLayer();
      };
    } else if (addedRef.current) {
      teardownLayer();
    }

    return () => {
      if (addedRef.current) teardownLayer();
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
