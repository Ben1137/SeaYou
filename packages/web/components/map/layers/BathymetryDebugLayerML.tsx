/**
 * BathymetryDebugLayerML — Debug layer that renders decoded Terrarium depth as a greyscale heatmap.
 *
 * Purpose: Phase 2 verification. Proves the Terrarium → depth grid → GenericHeatmapEngine
 * data path end-to-end BEFORE integrating with swell physics. Remove or gate behind a
 * DEV_MODE flag once Phase 3 CoastalDynamicsLayerML is working.
 *
 * What to look for on the map:
 *   - Deep ocean basins: dark navy
 *   - Continental shelves: teal/blue
 *   - Land: fully transparent (depth ≤ 0 is discarded)
 *   - Coastlines: sharp transition from teal shelf to transparent land
 *
 * Data path:
 *   MapLibre 'moveend' → fetchDepthGrid(viewport bounds, cols, rows, zoom=9)
 *     → GenericHeatmapEngine.updateData() → CanvasSource drape onto globe
 *
 * This layer does NOT share GL state with MapLibre or the ParticleEngine.
 * The GenericHeatmapEngine owns its own offscreen canvas + WebGL context.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useMap } from '../useMap';
import { createGenericHeatmapEngine, type GenericHeatmapEngine } from '../../../webgl/GenericHeatmapEngine';
import { createOffscreenCanvas, type OffscreenCanvasHandle } from '../../../webgl/OffscreenCanvasManager';
import { useCanvasSourceLayer, boundsToCorners } from '../../../hooks/useCanvasSourceLayer';
import { DEPTH_DEBUG_COLORS } from '../../../webgl/ColorRamps';
import { getMarineBeforeId } from '../../../utils/mapLayerUtils';
import { fetchDepthGrid } from '../../../utils/bathymetry/TerrariumBathymetry';

export interface BathymetryDebugLayerMLProps {
  visible: boolean;
  opacity?: number;
}

const SOURCE_ID = 'bathymetry-debug-canvas-src';
const LAYER_ID  = 'bathymetry-debug-canvas-layer';

// Grid resolution for depth sampling — coarse is fine for the debug view.
const GRID_COLS = 64;
const GRID_ROWS = 64;

// Terrarium tile zoom — z9 gives ~300 m/px smooth interpolation, honest for ETOPO1.
const TILE_ZOOM = 9;

// Max depth for color ramp normalization (matches DEPTH_DEBUG_COLORS stops, ~6000 m).
const MAX_DEPTH_M = 6000;

export function BathymetryDebugLayerML({
  visible,
  opacity = 0.7,
}: BathymetryDebugLayerMLProps) {
  const map = useMap();
  const mapRef = useRef(map);
  mapRef.current = map;

  const engineRef = useRef<GenericHeatmapEngine | null>(null);
  const canvasHandleRef = useRef<OffscreenCanvasHandle | null>(null);
  const renderRafRef = useRef<number | null>(null);
  const fetchAbortRef = useRef<{ aborted: boolean }>({ aborted: false });
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null);

  // Create engine + offscreen canvas once
  useEffect(() => {
    const handle = createOffscreenCanvas('bathymetry-debug', 1024, 1024);
    canvasHandleRef.current = handle;

    const engine = createGenericHeatmapEngine({
      logPrefix: '[BathymetryDebug]',
      colorRamp: DEPTH_DEBUG_COLORS,
      normalization: 'max-value',
      maxValue: MAX_DEPTH_M,
      discardBelow: 1,     // discard depth ≤ 1 m (land / surface)
      fadeRange: 50,       // smooth fade from 1 m → 51 m for the shelf edge
      opacity: 1.0,
      useLandMask: false,  // depth data itself encodes land (depth ≤ 0 → discarded)
    });
    engine.init(handle.canvas);
    engineRef.current = engine;
    setCanvasElement(handle.canvas);

    // Continuous render loop — keeps CanvasSource synced
    let destroyed = false;
    const animate = () => {
      if (destroyed) return;
      engineRef.current?.render();
      mapRef.current?.triggerRepaint();
      renderRafRef.current = requestAnimationFrame(animate);
    };
    renderRafRef.current = requestAnimationFrame(animate);

    return () => {
      destroyed = true;
      fetchAbortRef.current.aborted = true;
      if (renderRafRef.current !== null) {
        cancelAnimationFrame(renderRafRef.current);
        renderRafRef.current = null;
      }
      engineRef.current?.destroy();
      engineRef.current = null;
      canvasHandleRef.current?.destroy();
      canvasHandleRef.current = null;
    };
  }, []);

  const beforeId = map ? getMarineBeforeId(map) : undefined;
  const { updateCoordinates } = useCanvasSourceLayer({
    map,
    sourceId: SOURCE_ID,
    layerId: LAYER_ID,
    canvas: canvasElement,
    beforeId,
    opacity,
    visible,
  });

  const fetchAndRender = useCallback(async () => {
    const currentMap = mapRef.current;
    const engine = engineRef.current;
    if (!currentMap || !engine || !visible) return;

    const mapBounds = currentMap.getBounds();
    const bounds = {
      minLon: mapBounds.getWest(),
      maxLon: mapBounds.getEast(),
      minLat: mapBounds.getSouth(),
      maxLat: mapBounds.getNorth(),
    };

    // Guard against fetch racing with component unmount
    const token = { aborted: false };
    fetchAbortRef.current = token;

    try {
      const grid = await fetchDepthGrid(bounds, GRID_COLS, GRID_ROWS, TILE_ZOOM);
      if (token.aborted) return;

      const { minLon, maxLon, minLat, maxLat } = bounds;
      const corners = boundsToCorners(minLon, maxLon, minLat, maxLat);
      updateCoordinates(corners);

      engine.updateData(grid, minLon, maxLon, minLat, maxLat);
      engine.render();
      currentMap.triggerRepaint();

      console.log('[BathymetryDebugLayerML] Depth grid loaded:', {
        cols: GRID_COLS,
        rows: GRID_ROWS,
        zoom: TILE_ZOOM,
        bounds,
        sampleDepthCentre: grid[Math.floor(GRID_ROWS / 2)][Math.floor(GRID_COLS / 2)].toFixed(0) + ' m',
      });
    } catch (err) {
      if (!token.aborted) {
        console.error('[BathymetryDebugLayerML] Failed to fetch depth grid:', err);
      }
    }
  }, [visible, updateCoordinates]);

  // Fetch on mount + whenever the map stops moving
  useEffect(() => {
    if (!map || !visible) return;

    fetchAndRender();

    const onMoveEnd = () => fetchAndRender();
    map.on('moveend', onMoveEnd);
    return () => { map.off('moveend', onMoveEnd); };
  }, [map, visible, fetchAndRender]);

  return null;
}

export default BathymetryDebugLayerML;
