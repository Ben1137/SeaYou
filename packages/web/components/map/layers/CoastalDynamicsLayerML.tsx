/**
 * CoastalDynamicsLayerML — Breaking-wave height heatmap (Phase 3, GPU route).
 *
 * Single-viewport-rectangle architecture (simplified from 0911c12's two-rect remap):
 *   - The offscreen canvas, the swell texture, and the depth texture ALL cover
 *     the same geographic rectangle: the current MAP VIEWPORT.
 *   - v_texcoord in the shader maps directly to both textures — no remap, no
 *     out-of-rect discard, no u_swell_bounds / u_depth_bounds uniforms needed.
 *   - Row 0 = maxLat (north) in both textures (matching fetchDepthGrid convention).
 *   - CanvasSource is draped at the viewport bounds.
 *
 * Why: the prior two-rect remap (swell on swell-grid bounds, depth on viewport bounds)
 * produced a mis-located depth sample confirmed by the 947cfc0 depth-viz probe
 * (point@32.08N read 38.5m instead of ~12m; gradient inverted coast↔offshore).
 *
 * Data pipeline:
 *   sharedGridData (MarineGridData) → bilinear resample onto viewport 64×64 → TEXTURE0
 *   MapLibre 'moveend'              → fetchDepthGrid() → TEXTURE4
 *   Both textures: row 0 = maxLat (north), row N-1 = minLat (south)
 *   CanvasSource draped at viewport bounds
 *
 * Honest caveat: physics-based estimate, NOT spot-calibrated.
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

// Both textures use the same 64×64 viewport grid.
const GRID_COLS = 64;
const GRID_ROWS = 64;

// ── Bilinear interpolation helper ───────────────────────────────────────────
// Interpolates a value from a coarse grid at a given lon/lat.
// The coarse grid is defined by sorted arrays of lats and lons, with
// row i = lat[i] (ascending, south-first) and col j = lon[j] (ascending, west-first).
function bilinearInterp(
  grid: number[][],       // grid[latIdx][lonIdx], row 0 = minLat (south)
  lats: number[],         // ascending latitudes
  lons: number[],         // ascending longitudes
  targetLat: number,
  targetLon: number,
): number {
  const nLat = lats.length;
  const nLon = lons.length;
  if (nLat === 0 || nLon === 0) return NaN;

  // Clamp to grid extent
  const clampedLat = Math.max(lats[0], Math.min(lats[nLat - 1], targetLat));
  const clampedLon = Math.max(lons[0], Math.min(lons[nLon - 1], targetLon));

  // Find bounding indices
  let latLo = 0;
  for (let i = 0; i < nLat - 1; i++) {
    if (lats[i + 1] >= clampedLat) { latLo = i; break; }
    latLo = nLat - 2;
  }
  let lonLo = 0;
  for (let j = 0; j < nLon - 1; j++) {
    if (lons[j + 1] >= clampedLon) { lonLo = j; break; }
    lonLo = nLon - 2;
  }
  const latHi = Math.min(latLo + 1, nLat - 1);
  const lonHi = Math.min(lonLo + 1, nLon - 1);

  const dLat = lats[latHi] - lats[latLo];
  const dLon = lons[lonHi] - lons[lonLo];
  const tLat = dLat > 0 ? (clampedLat - lats[latLo]) / dLat : 0;
  const tLon = dLon > 0 ? (clampedLon - lons[lonLo]) / dLon : 0;

  const v00 = grid[latLo]?.[lonLo] ?? NaN;
  const v01 = grid[latLo]?.[lonHi] ?? NaN;
  const v10 = grid[latHi]?.[lonLo] ?? NaN;
  const v11 = grid[latHi]?.[lonHi] ?? NaN;

  // If any corner is invalid, fall back to nearest valid
  if (!isFinite(v00) || !isFinite(v01) || !isFinite(v10) || !isFinite(v11)) {
    const candidates = [v00, v01, v10, v11].filter(isFinite);
    return candidates.length > 0 ? candidates[0] : NaN;
  }

  return v00 * (1 - tLat) * (1 - tLon)
       + v01 * (1 - tLat) * tLon
       + v10 * tLat * (1 - tLon)
       + v11 * tLat * tLon;
}

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

  // Latest swell data — kept so moveend can resample onto the new viewport
  const swellDataRef = useRef<MarineGridData | null>(null);

  // Create engine + offscreen canvas once on mount
  useEffect(() => {
    const handle = createOffscreenCanvas('coastal-dynamics', 1024, 1024);
    canvasHandleRef.current = handle;

    const engine = createCoastalDynamicsEngine({
      colorRamp: BREAKING_WAVE_COLORS,
      maxBreakingHeight: 1.0,  // Eastern Med: wave_height 0.3–0.8m; 3.0 used only 10–27% of ramp
      opacity: 1.0,
      logPrefix: '[CoastalDynamics]',
    });
    engine.init(handle.canvas);
    engineRef.current = engine;
    setCanvasElement(handle.canvas);

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

  // ── Build and upload everything for the current viewport ─────────────────
  // Both swell (resampled) and depth are aligned to the viewport rectangle,
  // with row 0 = maxLat (north). CanvasSource is draped at viewport bounds.
  const buildViewport = useCallback(async () => {
    const currentMap = mapRef.current;
    const engine = engineRef.current;
    if (!currentMap || !engine || !visible) return;

    const mapBounds = currentMap.getBounds();
    if (!mapBounds) return;

    const vb = {
      minLon: mapBounds.getWest(),
      maxLon: mapBounds.getEast(),
      minLat: mapBounds.getSouth(),
      maxLat: mapBounds.getNorth(),
    };

    const mapZoom = currentMap.getZoom();
    // tileZoom capped at 10: Terrarium ocean tiles at z11 return ~0 nearshore depth
    // (confirmed aa25968: 34.70E reads 0m@z11 vs +40m@z10). z10 ≈ 150m bathymetry.
    const tileZoom = mapZoom >= 8 ? 10 : 9;

    const token = { aborted: false };
    fetchAbortRef.current = token;

    // ── Swell: resample coarse grid onto viewport 64×64 ─────────────────────
    const gridData = swellDataRef.current;
    if (gridData?.points?.length) {
      const lats = [...new Set(gridData.points.map(p => p.lat))].sort((a, b) => a - b);
      const lons = [...new Set(gridData.points.map(p => p.lng))].sort((a, b) => a - b);

      const H0CoarseGrid: number[][] = [];
      const TCoarseGrid:  number[][] = [];
      const H0Map = new Map<string, number>();
      const TMap  = new Map<string, number>();
      gridData.points.forEach(pt => {
        const key = `${pt.lat.toFixed(4)},${pt.lng.toFixed(4)}`;
        H0Map.set(key, pt.isOcean ? (pt.waveHeight ?? NaN) : NaN);
        TMap.set(key,  pt.isOcean ? (pt.wavePeriod ?? NaN) : NaN);
      });
      for (let li = 0; li < lats.length; li++) {
        const H0Row: number[] = [];
        const TRow:  number[] = [];
        for (let lo = 0; lo < lons.length; lo++) {
          const key = `${lats[li].toFixed(4)},${lons[lo].toFixed(4)}`;
          H0Row.push(H0Map.get(key) ?? NaN);
          TRow.push(TMap.get(key)   ?? NaN);
        }
        H0CoarseGrid.push(H0Row);
        TCoarseGrid.push(TRow);
      }

      // Resample onto viewport 64×64 with row 0 = maxLat (north), matching depth
      const H0Grid: number[][] = [];
      const TGrid:  number[][] = [];
      for (let row = 0; row < GRID_ROWS; row++) {
        // row 0 = maxLat (north), row GRID_ROWS-1 = minLat (south)
        const lat = vb.maxLat - (row / (GRID_ROWS - 1)) * (vb.maxLat - vb.minLat);
        const H0Row: number[] = [];
        const TRow:  number[] = [];
        for (let col = 0; col < GRID_COLS; col++) {
          const lon = vb.minLon + (col / (GRID_COLS - 1)) * (vb.maxLon - vb.minLon);
          H0Row.push(bilinearInterp(H0CoarseGrid, lats, lons, lat, lon));
          TRow.push(bilinearInterp(TCoarseGrid,  lats, lons, lat, lon));
        }
        H0Grid.push(H0Row);
        TGrid.push(TRow);
      }

      const tideM = gridData.points.find(p => p.isOcean)?.seaLevelHeight ?? 0;
      engine.setTideOffset(tideM);
      engine.updateSwellData(H0Grid, TGrid, vb.minLon, vb.maxLon, vb.minLat, vb.maxLat);
    }

    // ── Depth: fetch at viewport ─────────────────────────────────────────────
    try {
      const depthGrid = await fetchDepthGrid(vb, GRID_COLS, GRID_ROWS, tileZoom);
      if (token.aborted) return;

      engine.updateBathymetryData(depthGrid, vb.minLon, vb.maxLon, vb.minLat, vb.maxLat);

      // Drape the CanvasSource at the viewport bounds
      updateCoordinates(boundsToCorners(vb.minLon, vb.maxLon, vb.minLat, vb.maxLat));

      engine.render();
      currentMap.triggerRepaint();
    } catch (err) {
      if (!token.aborted) {
        console.error('[CoastalDynamicsLayerML] buildViewport failed:', err);
      }
    }
  }, [visible, updateCoordinates]);

  // ── Respond to new swell data ────────────────────────────────────────────
  useEffect(() => {
    if (!visible || !sharedGridData) return;
    swellDataRef.current = sharedGridData;
    buildViewport();
  }, [sharedGridData, visible, buildViewport]);

  // ── Rebuild on map move ──────────────────────────────────────────────────
  useEffect(() => {
    if (!map || !visible) return;

    buildViewport();

    const onMoveEnd = () => buildViewport();
    map.on('moveend', onMoveEnd);
    return () => { map.off('moveend', onMoveEnd); };
  }, [map, visible, buildViewport]);

  return null;
}

export default CoastalDynamicsLayerML;
