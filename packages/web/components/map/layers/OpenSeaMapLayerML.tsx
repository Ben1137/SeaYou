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
 * Zoom-Based Projection Toggle:
 *   The MapTiler Dataviz Dark style JSON declares "projection": {"type": "globe"}.
 *   OpenSeaMap raster tiles are flat Web Mercator XYZ — re-projecting them onto
 *   a sphere causes per-tile positional drift that grows with zoom level.
 *   At low zoom (< 7) the drift is imperceptible and the 3D globe looks great,
 *   so we keep globe. At zoom >= 7 we switch to mercator for pixel-perfect
 *   chart alignment. A zoom listener fires on every zoom change to update the
 *   projection dynamically while the layer is active.
 *
 *   Threshold: GLOBE_TO_MERCATOR_ZOOM = 7
 *     zoom < 7  → globe  (beautiful world view, imperceptible drift)
 *     zoom >= 7 → mercator (pixel-perfect harbour chart alignment)
 *
 * Race condition fix (critical):
 *   Previously two separate useEffect hooks shared [map, visible] deps — one for
 *   setProjection, one for addSource/addLayer. setProjection() calls
 *   tileManagers.reload() which makes isStyleLoaded() return false, causing
 *   the layer effect to defer to a style.load that never fires. Fix: single
 *   merged useEffect. Uses map.getStyle() (not isStyleLoaded()) as the
 *   style-ready guard.
 *
 * Dark mode legibility — dual-layer technique:
 *   raster-brightness-* cannot distinguish black text from red/green buoys.
 *   Dual layers sharing the same cached source (no extra HTTP cost):
 *   1. BACKING layer (below) — brightness max at 20% opacity → white glow on text
 *   2. MAIN layer (above) — zero adjustments → native PNG colours exact
 *
 * Dynamic water tint:
 *   OpenSeaMap tiles were designed for light/white chart backgrounds. On the
 *   near-black Dataviz Dark ocean, dark blue depth contours and black buoy
 *   marks are invisible. When ENC is enabled we dynamically tint all basemap
 *   water fill layers to a mid-tone nautical blue (#1a3a5c) so chart symbols
 *   achieve the contrast they were designed for. On disable, we restore the
 *   original colours. Pattern mirrors the land-contrast fix in MapContainerML.
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

/** Zoom level below which globe projection is used (drift imperceptible). */
const GLOBE_TO_MERCATOR_ZOOM = 7;

/**
 * Nautical chart blue — mid-tone so dark-blue depth contours and black ink
 * both read clearly against it, matching Admiralty Chart paper convention.
 */
const NAUTICAL_WATER_COLOR = '#1a3a5c';

const LOG = (...args: unknown[]) => console.log('[OpenSeaMap]', ...args);

// ─── Component ───

export function OpenSeaMapLayerML({
  visible,
  opacity = DEFAULT_OPACITY,
}: OpenSeaMapLayerMLProps) {
  const map = useMap();
  const addedRef = useRef(false);

  // Tracks which water fill-layers we tinted so we can restore them on teardown.
  const waterLayerIdsRef    = useRef<string[]>([]);
  const waterOrigColorsRef  = useRef<Map<string, unknown>>(new Map());

  // ── Unified lifecycle + zoom-based projection toggle ──────────────────────
  //
  // Single effect to avoid the isStyleLoaded() race: setProjection() calls
  // tileManagers.reload() → tiles enter 'reloading' → isStyleLoaded() = false →
  // a separate layer effect would defer to style.load (which never fires after
  // setProjection). Merging eliminates the race entirely.
  //
  // Zoom logic: globe at zoom < GLOBE_TO_MERCATOR_ZOOM (world view looks great),
  // mercator at zoom >= GLOBE_TO_MERCATOR_ZOOM (chart alignment required).
  useEffect(() => {
    if (!map) return;

    LOG('effect run — visible:', visible, 'styleReady:', !!map.getStyle());

    // Derives the correct projection for the current zoom level.
    const targetProjection = () =>
      map.getZoom() >= GLOBE_TO_MERCATOR_ZOOM ? 'mercator' : 'globe';

    const applyProjection = () => {
      const proj = targetProjection();
      LOG('applyProjection →', proj, '(zoom:', map.getZoom().toFixed(1), ')');
      try { map.setProjection({ type: proj }); } catch { /* map disposed */ }
    };

    // ── Water tint helpers ─────────────────────────────────────────────────

    const applyWaterTint = () => {
      const ids: string[] = [];
      const origColors = new Map<string, unknown>();
      try {
        for (const layer of (map.getStyle()?.layers ?? [])) {
          const srcLayer = (layer as { 'source-layer'?: string })['source-layer'];
          if (layer.type === 'fill' && srcLayer === 'water') {
            const orig = map.getPaintProperty(layer.id, 'fill-color');
            origColors.set(layer.id, orig);
            map.setPaintProperty(layer.id, 'fill-color', NAUTICAL_WATER_COLOR);
            ids.push(layer.id);
          }
        }
      } catch { /* non-critical — style may be mid-transition */ }
      waterLayerIdsRef.current   = ids;
      waterOrigColorsRef.current = origColors;
      if (ids.length > 0) LOG(`tinted ${ids.length} water layer(s) to ${NAUTICAL_WATER_COLOR}`);
    };

    const restoreWater = () => {
      try {
        for (const id of waterLayerIdsRef.current) {
          const orig = waterOrigColorsRef.current.get(id);
          if (map.getLayer(id) && orig !== undefined) {
            map.setPaintProperty(id, 'fill-color', orig);
          }
        }
      } catch { /* map disposed */ }
      waterLayerIdsRef.current   = [];
      waterOrigColorsRef.current = new Map();
    };

    // ── Layer add/remove ────────────────────────────────────────────────────

    const setupLayer = () => {
      LOG('setupLayer() — addedRef:', addedRef.current);

      if (!map.getSource(SOURCE_ID)) {
        LOG('addSource', SOURCE_ID);
        map.addSource(SOURCE_ID, {
          type: 'raster',
          tiles: [TILE_URL],
          tileSize: 256,
          attribution: ATTRIBUTION,
        });
      }

      // BACKING: forces all inked pixels → white at low opacity.
      // Gives black text a soft white glow on the dark basemap.
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

      // MAIN: native PNG colours, zero raster-* adjustments.
      if (!map.getLayer(LAYER_ID)) {
        LOG('addLayer', LAYER_ID);
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

      // Tint the basemap ocean to nautical blue so chart symbols are readable.
      applyWaterTint();

      addedRef.current = true;
      LOG('setupLayer() complete — source:', !!map.getSource(SOURCE_ID), 'layer:', !!map.getLayer(LAYER_ID));
    };

    const teardownLayer = () => {
      LOG('teardownLayer()');
      // Restore water colours before removing layers.
      restoreWater();
      try {
        if (map.getLayer(BACKING_LAYER_ID)) map.removeLayer(BACKING_LAYER_ID);
        if (map.getLayer(LAYER_ID))         map.removeLayer(LAYER_ID);
        if (map.getSource(SOURCE_ID))       map.removeSource(SOURCE_ID);
      } catch {
        // Map in transition / disposed
      }
      addedRef.current = false;
    };

    // Re-applies correct projection + re-adds layers after any style.load.
    const onStyleLoad = () => {
      if (visible) {
        LOG('style.load fired — re-applying projection + layers');
        applyProjection();
        setupLayer();
      }
    };

    if (visible) {
      if (map.getStyle()) {
        // Style JSON is parsed — safe to call setProjection + addLayer immediately.
        // map.getStyle() is correct here (not isStyleLoaded() which returns false
        // during tile reloads triggered by setProjection).
        LOG('style parsed — applying projection + setupLayer');
        applyProjection();
        setupLayer();
      } else {
        LOG('style not yet parsed — deferring to style.load');
        map.on('style.load', onStyleLoad);
        return () => {
          map.off('style.load', onStyleLoad);
        };
      }

      // Zoom listener: re-evaluate projection on every zoom change.
      map.on('zoom', applyProjection);
      // Re-apply after future style reloads (e.g. basemap switch).
      map.on('style.load', onStyleLoad);

      return () => {
        LOG('cleanup — removing listeners, restoring globe + water');
        map.off('zoom', applyProjection);
        map.off('style.load', onStyleLoad);
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

  return null;
}

export default OpenSeaMapLayerML;
