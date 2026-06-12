/**
 * useCanvasSourceLayer — React hook for registering an offscreen canvas as a
 * MapLibre CanvasSource + raster layer.
 *
 * MapLibre's CanvasSource reads pixel data from an HTMLCanvasElement every frame
 * (when animate=true) and projects the texture onto the globe surface using
 * geographic coordinates. This hook handles source/layer lifecycle, visibility,
 * opacity, coordinate updates, and cleanup.
 *
 * KEY DESIGN DECISIONS:
 * - `beforeId` stored in a ref (not in effect deps) to prevent infinite re-trigger
 *   when the layer stack changes
 * - Uses polling retry instead of `map.once('style.load', ...)` to avoid the race
 *   condition where style.load already fired before the listener was registered
 * - `cancelled` flag prevents stale closures from modifying map state
 * - `isLayerReady` is STATE (not a ref) so the visibility effect re-fires when
 *   the async layer creation completes
 * - `visible`/`opacity` stored in refs so tryAdd reads current values, not stale
 *   closure values
 * - `pendingCoordsRef` stores coordinates set before the source exists, so they
 *   can be applied immediately when the source is created (fixes the race where
 *   data arrives before CanvasSource is registered — all 3 heatmap/particle
 *   invisibility bugs)
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import type { Map as MaplibreMap } from 'maplibre-gl';

/** Geographic corners in [lng, lat] order: [NW, NE, SE, SW] */
export type CanvasCorners = [
  [number, number], // NW (top-left)
  [number, number], // NE (top-right)
  [number, number], // SE (bottom-right)
  [number, number], // SW (bottom-left)
];

export interface UseCanvasSourceLayerOptions {
  map: MaplibreMap | null;
  sourceId: string;
  layerId: string;
  canvas: HTMLCanvasElement | null;
  beforeId?: string;
  opacity?: number;
  visible?: boolean;
}

/**
 * Compute CanvasSource corners from geographic bounds.
 * Returns [NW, NE, SE, SW] in [lng, lat] format.
 */
export function boundsToCorners(
  minLon: number,
  maxLon: number,
  minLat: number,
  maxLat: number
): CanvasCorners {
  return [
    [minLon, maxLat], // NW (top-left)
    [maxLon, maxLat], // NE (top-right)
    [maxLon, minLat], // SE (bottom-right)
    [minLon, minLat], // SW (bottom-left)
  ];
}

/** Default world-extent coordinates — used until real data bounds arrive. */
const DEFAULT_COORDINATES: CanvasCorners = [
  [-180, 85],  // NW
  [180, 85],   // NE
  [180, -85],  // SE
  [-180, -85], // SW
];

export function useCanvasSourceLayer({
  map,
  sourceId,
  layerId,
  canvas,
  beforeId,
  opacity = 0.7,
  visible = true,
}: UseCanvasSourceLayerOptions) {
  // Store beforeId in a ref so it doesn't trigger effect re-runs.
  const beforeIdRef = useRef(beforeId);
  beforeIdRef.current = beforeId;

  // Store visible/opacity in refs so the async tryAdd callback can read
  // CURRENT values instead of stale closure values.
  const visibleRef = useRef(visible);
  const opacityRef = useRef(opacity);
  visibleRef.current = visible;
  opacityRef.current = opacity;

  // Pending coordinates — stored when updateCoordinates is called before the
  // source exists. Applied immediately when the source is created in tryAdd.
  const pendingCoordsRef = useRef<CanvasCorners | null>(null);

  // Track whether this hook instance owns the source/layer.
  // Using STATE (not ref) so the visibility effect re-fires when layer is created.
  const [isLayerReady, setIsLayerReady] = useState(false);

  // Create source + layer ONCE when map and canvas are both available.
  // Uses a retry loop to handle the case where style isn't loaded yet,
  // avoiding the race condition with map.once('style.load', ...).
  useEffect(() => {
    console.log(`[CanvasSourceLayer] Effect for ${layerId}: map=${!!map}, canvas=${!!canvas}`);
    if (!map || !canvas) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const MAX_ATTEMPTS = 20; // 20 x 200ms = 4 seconds max

    const tryAdd = () => {
      if (cancelled) return;
      attempts++;

      // Check if style is loaded — if not, retry after a short delay
      if (!map.isStyleLoaded()) {
        console.log(`[CanvasSourceLayer] ${layerId}: style not loaded (attempt ${attempts}/${MAX_ATTEMPTS})`);
        if (attempts < MAX_ATTEMPTS) {
          retryTimer = setTimeout(tryAdd, 200);
        } else {
          console.error(`[CanvasSourceLayer] ${layerId}: gave up after ${MAX_ATTEMPTS} attempts`);
        }
        return;
      }

      try {
        // Use pending coordinates if data arrived before source creation,
        // otherwise fall back to default world-extent coordinates.
        const initialCoords = pendingCoordsRef.current || DEFAULT_COORDINATES;

        // Add canvas source
        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, {
            type: 'canvas',
            canvas,
            animate: true,
            coordinates: initialCoords,
          } as any);
          console.log(`[CanvasSourceLayer] ${layerId}: source created (coords=${pendingCoordsRef.current ? 'from-data' : 'default'})`);
        } else if (pendingCoordsRef.current) {
          // Source already exists but we have pending coords — apply them now
          try {
            const source = map.getSource(sourceId);
            if (source && 'setCoordinates' in source) {
              (source as any).setCoordinates(pendingCoordsRef.current);
            }
          } catch {}
        }

        // Add raster layer — read CURRENT visible/opacity from refs
        if (!map.getLayer(layerId)) {
          const bid = beforeIdRef.current;
          const safeBeforeId = bid && map.getLayer(bid) ? bid : undefined;
          const currentVisible = visibleRef.current;
          const currentOpacity = opacityRef.current;
          map.addLayer(
            {
              id: layerId,
              type: 'raster',
              source: sourceId,
              paint: {
                'raster-opacity': currentVisible ? currentOpacity : 0,
                'raster-fade-duration': 0,
              },
            },
            safeBeforeId
          );
          console.log(`[CanvasSourceLayer] ${layerId}: layer created (visible=${currentVisible}, opacity=${currentOpacity})`);
        }

        // Use setState so the visibility effect re-fires
        setIsLayerReady(true);
        console.log(`[CanvasSourceLayer] ${layerId} added (source: ${sourceId})`);
        map.triggerRepaint();
        // Pulse two extra repaints so MapLibre flushes the CanvasSource texture on the very first frame
        setTimeout(() => { if (!cancelled) map.triggerRepaint(); }, 50);
        setTimeout(() => { if (!cancelled) map.triggerRepaint(); }, 200);
      } catch (err) {
        console.error(`[CanvasSourceLayer] FAILED to add ${layerId}:`, err);
        // Retry on failure (e.g., if style is in a transitional state)
        if (attempts < MAX_ATTEMPTS) {
          retryTimer = setTimeout(tryAdd, 200);
        }
      }
    };

    // Start immediately
    tryAdd();

    return () => {
      cancelled = true;
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
      }
      // Remove our source and layer
      try {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      } catch {
        // Style may have been removed already
      }
      setIsLayerReady(false);
    };
  }, [map, canvas, sourceId, layerId]);

  // Update visibility and opacity.
  // Depends on `isLayerReady` (state) so it re-fires when async creation completes.
  useEffect(() => {
    if (!map || !isLayerReady) return;
    try {
      if (map.getLayer(layerId)) {
        map.setPaintProperty(layerId, 'raster-opacity', visible ? opacity : 0);
        map.triggerRepaint();
        console.log(`[CanvasSourceLayer] ${layerId}: opacity set to ${visible ? opacity : 0} (visible=${visible})`);
      }
    } catch {
      // Layer may not exist yet
    }
  }, [map, layerId, visible, opacity, isLayerReady]);

  // Update coordinates when data bounds change.
  // Always stores in pendingCoordsRef so tryAdd can use them if source doesn't exist yet.
  const updateCoordinates = useCallback(
    (newCoords: CanvasCorners) => {
      // Always store the latest coordinates — even if source doesn't exist yet.
      // tryAdd() will read pendingCoordsRef when creating the source.
      pendingCoordsRef.current = newCoords;

      if (!map) return;
      try {
        const source = map.getSource(sourceId);
        if (source && 'setCoordinates' in source) {
          (source as any).setCoordinates(newCoords);
          map.triggerRepaint();
        }
      } catch {
        // Source may not exist yet — coordinates are stored in pendingCoordsRef
        // and will be applied when tryAdd creates the source.
      }
    },
    [map, sourceId]
  );

  return { updateCoordinates, isLayerReady };
}
