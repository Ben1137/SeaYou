/**
 * CoastalDynamicsLayerML — Breaking-wave height heatmap (Phase 3, GPU route).
 *
 * Combines two data streams per-pixel on the GPU:
 *   1. Swell grid (H0, T from Open-Meteo marine API via sharedGridData)
 *   2. Bathymetry grid (depth in m from AWS Terrarium tiles via fetchDepthGrid)
 *
 * The CoastalDynamicsEngine runs Fenton-McKee dispersion → shoaling coefficient
 * → depth-limited breaking (γ=0.78) entirely in coastal-dynamics.frag.glsl.
 * No refraction yet (Kr=1 in Phase 3; Snell's law added in Phase 4).
 *
 * PREMIUM TIER — gated by isFreeUser in MapContainerML (trySetAdvancedLayer).
 *
 * Data pipeline:
 *   sharedGridData (MarineGridData) → swell H0/T grids → CoastalDynamicsEngine TEXTURE0
 *   MapLibre 'moveend'             → fetchDepthGrid()   → CoastalDynamicsEngine TEXTURE4
 *   sea_level_height_msl           → engine.setTideOffset()
 *   CanvasSource drapes offscreen canvas onto MapLibre globe
 *
 * Honest caveat (displayed in legend): physics-based estimate, NOT spot-calibrated.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useMap } from '../useMap';
import {
  createCoastalDynamicsEngine,
  type CoastalDynamicsEngine,
} from '../../../webgl/CoastalDynamicsEngine';
import { createOffscreenCanvas, type OffscreenCanvasHandle } from '../../../webgl/OffscreenCanvasManager';
import { useCanvasSourceLayer, boundsToCorners } from '../../../hooks/useCanvasSourceLayer';
import { BREAKING_WAVE_COLORS } from '../../../webgl/ColorRamps';
import { getMarineBeforeId } from '../../../utils/mapLayerUtils';
import { fetchDepthGrid } from '../../../utils/bathymetry/TerrariumBathymetry';
import type { MarineGridData } from '@seame/core';

export interface CoastalDynamicsLayerMLProps {
  visible: boolean;
  opacity?: number;
  sharedGridData?: MarineGridData | null;
}

const SOURCE_ID = 'coastal-dynamics-canvas-src';
const LAYER_ID  = 'coastal-dynamics-canvas-layer';

// Depth grid resolution: finer than swell (swell is 6–12 pts, depth at 64 gives crisp coast hugging)
const DEPTH_COLS = 64;
const DEPTH_ROWS = 64;
const TILE_ZOOM  = 9;   // ~300 m/px, honest for ETOPO1

export function CoastalDynamicsLayerML({
  visible,
  opacity = 0.75,
  sharedGridData,
}: CoastalDynamicsLayerMLProps) {
  const map = useMap();
  const mapRef = useRef(map);
  mapRef.current = map;

  const engineRef       = useRef<CoastalDynamicsEngine | null>(null);
  const canvasHandleRef = useRef<OffscreenCanvasHandle | null>(null);
  const renderRafRef    = useRef<number | null>(null);
  const fetchAbortRef   = useRef<{ aborted: boolean }>({ aborted: false });
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null);

  // Create engine + offscreen canvas once on mount
  useEffect(() => {
    const handle = createOffscreenCanvas('coastal-dynamics', 1024, 1024);
    canvasHandleRef.current = handle;

    const engine = createCoastalDynamicsEngine({
      colorRamp: BREAKING_WAVE_COLORS,
      maxBreakingHeight: 3.0,  // Eastern Med typical max 1–2m; 4.0 on Phase 3.5 effectAlpha
      opacity: 1.0,
      logPrefix: '[CoastalDynamics]',
    });
    engine.init(handle.canvas);
    engineRef.current = engine;
    setCanvasElement(handle.canvas);

    // Continuous render loop — keeps CanvasSource pixel-synced with engine state
    let alive = true;
    const animate = () => {
      if (!alive) return;
      engineRef.current?.render();
      mapRef.current?.triggerRepaint();
      renderRafRef.current = requestAnimationFrame(animate);
    };
    renderRafRef.current = requestAnimationFrame(animate);

    return () => {
      alive = false;
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

  // Canonical swell rectangle — depth MUST always be fetched for this same rect.
  const processBounds = useRef<{
    minLon: number; maxLon: number; minLat: number; maxLat: number;
  } | null>(null);

  // ── Fetch depth grid for a specific bounds rectangle ────────────────────
  // Declared BEFORE processSwellData to avoid TDZ ("Cannot access before init").
  // Always called with swell bounds so both textures share one geographic rect.
  const fetchDepth = useCallback(async (
    bounds: { minLon: number; maxLon: number; minLat: number; maxLat: number },
  ) => {
    const currentMap = mapRef.current;
    const engine = engineRef.current;
    if (!currentMap || !engine || !visible) return;

    const token = { aborted: false };
    fetchAbortRef.current = token;

    try {
      const grid = await fetchDepthGrid(bounds, DEPTH_COLS, DEPTH_ROWS, TILE_ZOOM);
      if (token.aborted) return;

      // Debug: log depth range to verify grid covers ocean (positive = below sea level)
      const flat = grid.flat().filter(d => isFinite(d));
      if (flat.length > 0) {
        const minD = Math.min(...flat);
        const maxD = Math.max(...flat);
        const midRow = Math.floor(grid.length / 2);
        const midCol = Math.floor((grid[midRow]?.length ?? 0) / 2);
        const centre = grid[midRow]?.[midCol] ?? NaN;
        console.log(
          `[CoastalDynamics] Depth grid: min=${minD.toFixed(1)}m max=${maxD.toFixed(1)}m centre=${centre.toFixed(1)}m` +
          ` (positive=ocean, negative=land)`
        );
      }

      engine.updateBathymetryData(
        grid,
        bounds.minLon, bounds.maxLon,
        bounds.minLat, bounds.maxLat,
      );
      engine.render();
      currentMap.triggerRepaint();
    } catch (err) {
      if (!token.aborted) {
        console.error('[CoastalDynamicsLayerML] Depth fetch failed:', err);
      }
    }
  }, [visible]);

  // Re-fetch depth using the stored swell bounds (used by moveend handler).
  const fetchDepthForSwellBounds = useCallback(() => {
    if (processBounds.current) fetchDepth(processBounds.current);
  }, [fetchDepth]);

  // ── Process swell grid data from Open-Meteo ─────────────────────────────
  const processSwellData = useCallback((gridData: MarineGridData) => {
    if (!gridData?.points?.length || !engineRef.current) return;

    const lats = [...new Set(gridData.points.map(p => p.lat))].sort((a, b) => a - b);
    const lons = [...new Set(gridData.points.map(p => p.lng))].sort((a, b) => a - b);
    if (lats.length === 0 || lons.length === 0) return;

    const H0Map = new Map<string, number>();
    const TMap  = new Map<string, number>();

    gridData.points.forEach(pt => {
      const key = `${pt.lat.toFixed(4)},${pt.lng.toFixed(4)}`;
      H0Map.set(key, pt.isOcean ? (pt.swellHeight ?? NaN) : NaN);
      TMap.set(key,  pt.isOcean ? (pt.swellPeriod ?? NaN) : NaN);
    });

    const H0Grid: number[][] = [];
    const TGrid:  number[][] = [];

    for (let latIdx = 0; latIdx < lats.length; latIdx++) {
      const H0Row: number[] = [];
      const TRow:  number[] = [];
      for (let lonIdx = 0; lonIdx < lons.length; lonIdx++) {
        const key = `${lats[latIdx].toFixed(4)},${lons[lonIdx].toFixed(4)}`;
        H0Row.push(H0Map.get(key) ?? NaN);
        TRow.push(TMap.get(key)   ?? NaN);
      }
      H0Grid.push(H0Row);
      TGrid.push(TRow);
    }

    const minLon = lons[0];
    const maxLon = lons[lons.length - 1];
    const minLat = lats[0];
    const maxLat = lats[lats.length - 1];

    processBounds.current = { minLon, maxLon, minLat, maxLat };

    const tideM = gridData.points.find(p => p.isOcean)?.seaLevelHeight ?? 0;
    engineRef.current.setTideOffset(tideM);
    engineRef.current.updateSwellData(H0Grid, TGrid, minLon, maxLon, minLat, maxLat);

    updateCoordinates(boundsToCorners(minLon, maxLon, minLat, maxLat));

    // Fetch depth for the SAME rectangle so both textures are co-registered.
    fetchDepth({ minLon, maxLon, minLat, maxLat });
  }, [updateCoordinates, fetchDepth]);

  // ── Respond to incoming swell data ───────────────────────────────────────
  useEffect(() => {
    if (!visible || !sharedGridData) return;
    processSwellData(sharedGridData);
  }, [sharedGridData, visible, processSwellData]);

  useEffect(() => {
    if (!map || !visible) return;

    fetchDepthForSwellBounds();

    const onMoveEnd = () => fetchDepthForSwellBounds();
    map.on('moveend', onMoveEnd);
    return () => { map.off('moveend', onMoveEnd); };
  }, [map, visible, fetchDepthForSwellBounds]);

  return null;
}

export default CoastalDynamicsLayerML;
