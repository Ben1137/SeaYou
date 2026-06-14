/**
 * mapLayerUtils.ts — MapLibre layer-ordering helpers
 *
 * Two insertion strategies:
 *
 * 1. getMarineBeforeId() — "MVT Z-Index Sandwich" (PREFERRED)
 *    For marine/atmospheric WebGL layers. Inserts BEFORE the first land polygon
 *    fill that appears after water fills, so vector-tile land geometry naturally
 *    clips marine data at the coastline. Falls back to "first layer after water"
 *    for styles (like Carto Dark Matter) that lack a post-water land fill.
 *
 * 2. getSafeBeforeId() — DEPRECATED, same logic as getMarineBeforeId Phase B.
 *    Retained for backward compatibility. New code should use getMarineBeforeId().
 *
 * Carto Dark Matter actual layer order (verified from style.json):
 *   #1  background
 *   #2  landcover       ← land parks/green areas (BEFORE water — not a mask)
 *   #3-6 park_*, landuse_*, landuse
 *   #7  water           ← OCEAN fill
 *   #8  water_shadow
 *   #9  building        ← Carto DM insertion point (Phase B)
 *   #10 building-top
 *   #11 waterway
 *   ...roads, boundaries, labels...
 *
 * OpenMapTiles / Protomaps layer order:
 *   background → water → earth/land → landcover → building → roads → labels
 *   Phase A targets "earth"/"land" so marine layers sit BELOW the land fill.
 */

import type maplibregl from 'maplibre-gl';

/**
 * Find the best insertion point for marine/atmospheric WebGL custom layers.
 *
 * Uses a two-phase scan of the style layer stack:
 *
 * **Phase A — OMT pattern:** Scan for a land polygon fill layer that appears
 * AFTER all water fills. Common in OpenMapTiles / Protomaps styles where
 * `earth` or `land` fills render above water. Marine layers inserted before
 * this land fill are naturally clipped by the high-res MVT coastline geometry.
 *
 * **Phase B — Carto DM pattern:** If no post-water land fill exists, fall back
 * to inserting before the first non-water layer after the last water fill.
 * This handles Carto Dark Matter (where land comes from background color +
 * pre-water landcover, and `building` is the first fill above water).
 *
 * Returns `undefined` when no candidate is found → layer goes on top.
 *
 * Call-site pattern (double-guard):
 * ```ts
 *   const beforeId = getMarineBeforeId(map);
 *   map.addLayer(layer, beforeId && map.getLayer(beforeId) ? beforeId : undefined);
 * ```
 */
export function getMarineBeforeId(map: maplibregl.Map): string | undefined {
  const styleLayers = map.getStyle()?.layers ?? [];

  // ── Phase A0: Insert immediately AFTER the last water/ocean fill ───────────
  // Most reliable for MapTiler Ocean style — finds the last fill layer whose id
  // contains a water keyword, then returns the layer immediately after it.
  // Guarantees: [water fill] → [marine layer] → [land fill] regardless of style.
  let lastWaterLayerId: string | undefined;
  for (const layer of styleLayers) {
    const lId = layer.id.toLowerCase();
    const srcLyr = ((layer as any)['source-layer'] ?? '').toLowerCase();
    if (
      (layer.type === 'fill' || layer.type === 'background') &&
      (lId.includes('water') || lId.includes('ocean') || lId.includes('sea') || lId.includes('lake') ||
       srcLyr.includes('water') || srcLyr.includes('ocean') || srcLyr.includes('marine'))
    ) {
      lastWaterLayerId = layer.id;
    }
  }
  if (lastWaterLayerId) {
    const lastWaterIdx = styleLayers.findIndex(l => l.id === lastWaterLayerId);
    if (lastWaterIdx >= 0 && lastWaterIdx + 1 < styleLayers.length) {
      return styleLayers[lastWaterIdx + 1].id;
    }
  }

  // ── Phase A: Find land polygon fill AFTER all water fills (OMT/Protomaps) ──
  //
  // First, locate the index of the LAST water-like layer in the stack.
  let lastWaterIndex = -1;
  for (let i = 0; i < styleLayers.length; i++) {
    const lId = styleLayers[i].id.toLowerCase();
    if (
      lId.includes('water') ||
      lId.includes('ocean') ||
      lId.includes('sea') ||
      lId.includes('lake')
    ) {
      lastWaterIndex = i;
    }
  }

  // Scan layers AFTER the last water layer for a land polygon fill.
  // Well-known land fill layer IDs from various OMT-compatible styles:
  const landFillNames = new Set([
    'landcover-mask', // SeaYou custom OMT Dark
    'earth',          // Protomaps
    'land',           // Generic OMT
    'land-polygon',   // Common OMT variant
    'landcover',      // Some OMT styles place this after water
    'land_cover',     // Alternate naming
  ]);

  // Well-known MVT source-layer identifiers used by MapTiler and OMT tilesets.
  // The `source-layer` property is stable even when MapTiler's style editor lets
  // users rename the display layer id (e.g. to "Polygon"). Checking source-layer
  // is therefore more reliable than checking layer.id for MapTiler styles.
  const landSourceLayers = new Set([
    'land',       // MapTiler Ocean / Streets / Topo styles
    'landcover',  // MapTiler vegetation/parks layer
    'earth',      // Protomaps MVT source-layer
    'land_area',  // Some OMT tileset variants
    'landuse',    // Generic OMT landuse polygon source
  ]);

  if (lastWaterIndex >= 0) {
    for (let i = lastWaterIndex + 1; i < styleLayers.length; i++) {
      const layer = styleLayers[i];
      if (layer.type !== 'fill') continue;
      const lId = layer.id.toLowerCase();

      // Exact match against well-known display IDs
      if (landFillNames.has(lId)) return layer.id;

      // Source-layer match: MapTiler uses standardised MVT source-layer names
      // (e.g. 'land', 'landcover') even when the display layer id is custom.
      // Cast needed because MapLibre's TypeScript types put source-layer on
      // per-type layer specs; the runtime value is always accessible.
      const srcLayer = (layer as any)['source-layer'] as string | undefined;
      if (srcLayer && landSourceLayers.has(srcLayer)) return layer.id;

      // Heuristic: any fill layer whose id contains 'land' or 'earth'
      if (lId.includes('land') || lId.includes('earth')) return layer.id;
    }
  }

  // ── Phase B: Carto DM pattern — no post-water land fill found ─────────
  //
  // Fall back to "first non-water layer after water". Insert before
  // buildings/roads so marine layers are above water but below everything else.
  const ids = new Set(styleLayers.map(l => l.id));

  // Tier B1: Stable named layers that sit immediately after water fills
  const tierB1 = [
    'building',           // Carto Dark Matter (#9), Mapbox, OpenMapTiles
    'waterway',           // River/stream lines — appear after water fill area
    'boundary_county',    // Carto DM admin line after water fills
    'boundary_state',
    'aeroway-runway',     // Carto DM: after water, before roads
    'road_path',          // First road in some styles
    'tunnel_path',
  ];
  for (const id of tierB1) {
    if (ids.has(id)) return id;
  }

  // Tier B2: Dynamic scan — first non-water layer after water
  let seenWater = false;
  for (const layer of styleLayers) {
    const lId = layer.id.toLowerCase();
    const isWaterLike =
      lId.includes('water') ||
      lId.includes('ocean') ||
      lId.includes('sea') ||
      lId.includes('lake');

    if (!seenWater) {
      if (isWaterLike) seenWater = true;
    } else if (!isWaterLike) {
      return layer.id;
    }
  }

  // Tier B3: Last resort — first road or symbol layer
  const fallback = styleLayers.find(
    l =>
      l.type === 'symbol' ||
      (l.type === 'line' && typeof l.id === 'string' && l.id.toLowerCase().includes('road'))
  );
  if (fallback) return fallback.id;

  // ── INDEX-BASED FINAL FALLBACK ─────────────────────────────────────────────
  // In every MapTiler / OpenMapTiles / Protomaps style the layer stack is:
  //   [0] background  [1] land/earth fill  [2..] roads, labels
  // Inserting BEFORE index 1 always places the marine layer below the land fill,
  // regardless of what that layer is called. This handles custom-named land
  // layers in MapTiler's style editor (e.g. "Polygon") that the name-scan misses.
  if (styleLayers.length > 1) return styleLayers[1].id;

  return undefined;
}

/**
 * Find the best insertion point for **atmospheric** WebGL layers (air temperature,
 * precipitation, cloud cover).
 *
 * Atmospheric data is valid over both land AND ocean, so it must render ABOVE
 * the land polygon fill — unlike marine layers which sit underneath it.
 * However it should still sit BELOW text labels, road names, and border lines
 * so the map stays legible.
 *
 * Strategy (MapTiler / OpenMapTiles styles):
 *   1. Skip all fill layers (background, water, land, landcover, buildings).
 *   2. Return the FIRST `line` or `symbol` layer — typically the first
 *      border / road line, or "Aviation line" in MapTiler styles.
 *      This ensures: background → water → land → atmosphere → roads/labels.
 *
 * Falls back to `undefined` (top of stack) if no such layer exists, which is
 * acceptable for atmospheric data (it will just render over everything).
 *
 * Z-index sandwich result:
 *   ... fill layers (water, land) ...
 *   ← atmosphere inserted here →
 *   ... line layers (roads, borders) ...
 *   ... symbol layers (labels) ...
 *
 * Call-site pattern (double-guard):
 * ```ts
 *   const beforeId = getAtmosphereBeforeId(map);
 *   map.addLayer(layer, beforeId && map.getLayer(beforeId) ? beforeId : undefined);
 * ```
 */
export function getAtmosphereBeforeId(map: maplibregl.Map): string | undefined {
  const styleLayers = map.getStyle()?.layers ?? [];

  // ── Primary strategy: insert AFTER the last fill layer ─────────────────────
  // Atmospheric data (air temp, precipitation, cloud cover, wind) is valid over
  // both land AND ocean, so it must render ABOVE all fill layers — including
  // custom land polygons that might sit after water fills (e.g. MapTiler dataviz
  // styles with a post-water coastline fill). Find the last fill layer, then
  // return the first layer after it (typically a line or symbol layer).
  let lastFillIdx = -1;
  for (let i = 0; i < styleLayers.length; i++) {
    if (styleLayers[i].type === 'fill') lastFillIdx = i;
  }
  if (lastFillIdx >= 0 && lastFillIdx + 1 < styleLayers.length) {
    return styleLayers[lastFillIdx + 1].id;
  }

  // Fallback: first symbol layer (labels)
  const firstSymbol = styleLayers.find(l => l.type === 'symbol');
  if (firstSymbol) return firstSymbol.id;

  return undefined;
}

/**
 * @deprecated Use `getMarineBeforeId()` instead.
 *
 * Find the id of the best insertion layer for custom ocean overlays.
 * Equivalent to Phase B of getMarineBeforeId (Carto DM pattern).
 */
export function getSafeBeforeId(map: maplibregl.Map): string | undefined {
  return getMarineBeforeId(map);
}
