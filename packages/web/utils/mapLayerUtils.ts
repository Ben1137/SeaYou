/**
 * mapLayerUtils.ts — MapLibre layer-ordering helpers
 *
 * Strategy: insert custom ocean layers AFTER the water fill but BEFORE buildings/roads.
 *
 * Carto Dark Matter actual layer order (verified from style.json):
 *   #1  background
 *   #2  landcover       ← land parks/green areas (NOT a masking layer)
 *   #3-6 park_*, landuse_*, landuse
 *   #7  water           ← OCEAN fill
 *   #8  water_shadow
 *   #9  building        ← CORRECT insertion point (first solid fill after water)
 *   #10 building-top
 *   #11 waterway        ← river/stream lines (also acceptable insertion point)
 *   ...roads, boundaries, labels...
 *
 * CRITICAL: 'landcover' (#2) is BEFORE 'water' (#7) in this style!
 * Inserting before 'landcover' places us UNDER the water fill → invisible over sea.
 * We must insert AFTER water fills to be visible.
 *
 * Land masking is achieved by two cooperating mechanisms:
 *   1. Layer ordering: insert AFTER water → visible over ocean AND over bare land
 *   2. Data encoding: isOcean NaN → alpha=0 → shader discards land pixels
 *      (this is the primary land-mask; without it, the layer bleeds over land)
 */

import type maplibregl from 'maplibre-gl';

/**
 * Find the id of the best insertion layer for custom ocean overlays.
 *
 * Returns the id of the first non-water layer that follows a water layer
 * in the style stack, so our custom layer is inserted:
 *   AFTER:  water/ocean fills (visible over the ocean surface)
 *   BEFORE: buildings, roads, labels (they render on top, providing visual depth)
 *
 * Returns `undefined` when no candidate is found → caller should call
 * `map.addLayer(layer)` with no beforeId (layer goes on top of everything).
 *
 * IMPORTANT: This function checks the style *spec* (map.getStyle().layers), not runtime
 * layer existence. At the call site always validate with map.getLayer(beforeId) before
 * passing to map.addLayer(), because a layer in the spec may not yet be instantiated
 * during fast zoom/pan tile-loading:
 *
 *   const beforeId = getSafeBeforeId(map);
 *   map.addLayer(layer, beforeId && map.getLayer(beforeId) ? beforeId : undefined);
 */
export function getSafeBeforeId(map: maplibregl.Map): string | undefined {
  const styleLayers = map.getStyle()?.layers ?? [];
  const ids = new Set(styleLayers.map(l => l.id));

  // ── Tier 1: Stable named layers that sit immediately after water fills ─────
  //
  // Verified for Carto Dark Matter:   'building' is #9, right after water_shadow #8
  // Works for Mapbox Outdoors:        'building' similarly appears post-water
  // Works for OpenMapTiles:           'building' or 'waterway'
  const tier1 = [
    'building',           // Carto Dark Matter (#9), Mapbox, OpenMapTiles
    'waterway',           // River/stream lines — appear after water fill area
    'boundary_county',    // Carto DM admin line after water fills
    'boundary_state',
    'aeroway-runway',     // Carto DM: after water, before roads
    'road_path',          // First road in some styles
    'tunnel_path',
  ];
  for (const id of tier1) {
    if (ids.has(id)) return id;
  }

  // ── Tier 2: Dynamic scan — insert before first non-water layer after water ─
  //
  // Works for any style with any water layer naming convention.
  // Scan the full layer list; once we've seen a water-like layer, the very next
  // non-water layer is our insertion target.
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
      // First layer after water group → perfect insertion point
      return layer.id;
    }
  }

  // ── Tier 3: Last resort ────────────────────────────────────────────────────
  // Find the first road or symbol layer. At minimum we're below labels/roads,
  // preventing the worst visual artefacts even if we're above land areas.
  const fallback = styleLayers.find(
    l =>
      l.type === 'symbol' ||
      (l.type === 'line' && typeof l.id === 'string' && l.id.toLowerCase().includes('road'))
  );

  return fallback?.id;
}
