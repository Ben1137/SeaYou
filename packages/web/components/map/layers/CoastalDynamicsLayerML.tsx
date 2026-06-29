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
import { nearshoreTransform } from '@seame/core';

// ── Coastal diagnostics — flag-gated (?coastalDiag=1) ────────────────────────
// CPU mirror of coastal-dynamics.frag.glsl. Zero render-path changes.
// Enable: add ?coastalDiag=1 to URL and reload.
const COASTAL_DIAG =
  typeof window !== 'undefined' && window.location.search.includes('coastalDiag=1');

// R2 exposure feature flag — enable with ?coastalExposure=1
const COASTAL_EXPOSURE =
  typeof window !== 'undefined' && window.location.search.includes('coastalExposure=1');

// Shader constants — must stay in sync with coastal-dynamics.frag.glsl
const _D_H0_QUIET       = 0.55;
const _D_H0_FULL        = 1.50;
const _D_DEEP           = 200.0;
const _D_MAX_H          = 4.0;
const _D_MIN_H0         = 0.05;
const _D_FLOOR          = 0.01;
const _D_NEARSHORE_FULL = 30.0;
const _D_NEARSHORE_FADE = 200.0;
const _D_PRESENCE_CAP   = 0.50;   // must match PRESENCE_CAP in coastal-dynamics.frag.glsl
const _D_EXP_STEPS      = 14;
const _D_EXP_STEP_MAG   = 0.04;   // UV units per step (~half-viewport over 14 steps)
const _D_EXP_DEEP_OK    = 200.0;
const _D_EXP_LAND_D     = 0.5;

function _ss(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// CPU mirror of computeExposure() in the shader. Must stay byte-identical.
function _computeExposure(
  row: number, col: number,          // origin cell
  dirDeg: number,                    // swell "from" direction
  depthGrid: number[][],             // depthGrid[row][col] (row 0 = maxLat)
  rows: number, cols: number,
): number {
  const PI = Math.PI;
  const rad = dirDeg * PI / 180;
  const du =  Math.sin(rad);         // +east in UV
  const dv = -Math.cos(rad);         // -north in UV (row 0 = north)
  // Convert cell indices to UV [0,1]
  const u0 = col / (cols - 1);
  const v0 = row / (rows - 1);
  let blockedAt = _D_EXP_STEPS;
  for (let i = 1; i <= _D_EXP_STEPS; i++) {
    const su = Math.max(0, Math.min(1, u0 + i * du * _D_EXP_STEP_MAG));
    const sv = Math.max(0, Math.min(1, v0 + i * dv * _D_EXP_STEP_MAG));
    const sc = Math.round(su * (cols - 1));
    const sr = Math.round(sv * (rows - 1));
    const d = depthGrid[sr]?.[sc] ?? NaN;
    if (!isFinite(d)) { blockedAt = i; break; }            // no data → land (conservative)
    if (d <= _D_EXP_LAND_D) { blockedAt = i; break; }     // land / very shallow
    if (d >= _D_EXP_DEEP_OK) return 1.0;                  // open ocean
  }
  return Math.min(1, Math.max(0, blockedAt / _D_EXP_STEPS));
}

function _ramp(norm: number, c: [number, number, number, number][]): string {
  const t = Math.max(0, Math.min(1, norm)) * (c.length - 1);
  const lo = Math.floor(t), hi = Math.min(lo + 1, c.length - 1), f = t - lo;
  const l = (a: number, b: number) => Math.round(a + f * (b - a));
  return `rgba(${l(c[lo][0], c[hi][0])},${l(c[lo][1], c[hi][1])},${l(c[lo][2], c[hi][2])},${(l(c[lo][3], c[hi][3]) / 255).toFixed(2)})`;
}

interface _DiagRow {
  H0: number; T: number; dir: number; d: number; Ks: number; H_final: number;
  isBreaking: boolean; energyGate: number; nearshoreMask: number; exposure: number;
  presence: number; breakingBonus: number; effectAlpha: number; rampIndex: number;
  rampRGBA: string; gate: string;
}

function _diagPixel(
  H0: number, T: number, dir: number, d: number,
  row: number, col: number, depthGrid: number[][], rows: number, cols: number,
): _DiagRow {
  const nan: _DiagRow = {
    H0, T, dir, d, Ks: NaN, H_final: NaN, isBreaking: false,
    energyGate: NaN, nearshoreMask: NaN, exposure: NaN, presence: NaN,
    breakingBonus: NaN, effectAlpha: NaN,
    rampIndex: NaN, rampRGBA: 'discard', gate: '',
  };
  if (!isFinite(H0) || !isFinite(T) || H0 < _D_MIN_H0 || T < 1) return { ...nan, gate: 'MIN_H0/T' };
  if (!isFinite(d) || d <= 0) return { ...nan, gate: 'land' };
  if (d >= _D_DEEP)           return { ...nan, gate: 'deep≥200m' };

  const { H: H_final, Ks, breaking } = nearshoreTransform(H0, T, d);
  const eg  = _ss(_D_H0_QUIET, _D_H0_FULL, H0);
  const nm  = 1 - _ss(_D_NEARSHORE_FULL, _D_NEARSHORE_FADE, d);
  const bb  = breaking ? 0.2 * eg : 0;

  const exp_val = COASTAL_EXPOSURE
    ? _computeExposure(row, col, dir, depthGrid, rows, cols)
    : 1.0;
  const ps  = COASTAL_EXPOSURE ? exp_val * nm * _ss(0.25, 0.45, H0) * _D_PRESENCE_CAP : 0;
  const ea  = Math.min(1, Math.max(0, Math.max(eg * nm, ps) + bb));
  const ri  = Math.min(1, H_final / _D_MAX_H);
  return {
    H0, T, dir: +dir.toFixed(0), d: +d.toFixed(1), Ks: +Ks.toFixed(3), H_final: +H_final.toFixed(2),
    isBreaking: breaking, energyGate: +eg.toFixed(3), nearshoreMask: +nm.toFixed(3),
    exposure: +exp_val.toFixed(3), presence: +ps.toFixed(3),
    breakingBonus: +bb.toFixed(3), effectAlpha: +ea.toFixed(3),
    rampIndex: +ri.toFixed(3),
    rampRGBA: ea < _D_FLOOR ? 'discard' : _ramp(ri, BREAKING_WAVE_COLORS),
    gate: ea < _D_FLOOR ? 'effectAlpha<floor' : 'VISIBLE',
  };
}

// GPU readback: sample the engine canvas framebuffer at a grid cell position.
// Returns alpha in [0,1] — this is color.a * effectAlpha * u_opacity (premultipliedAlpha:false).
// The engine canvas is 1024×1024; row 0 of the 64×64 grid = canvas top = maxLat.
// GL readPixels y=0 is at canvas BOTTOM, so we flip: gl_y = canvasH-1 - canvas_y.
function _gpuAlpha(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  row: number, col: number, rows: number, cols: number,
): number {
  const cW = (gl.canvas as HTMLCanvasElement).width;
  const cH = (gl.canvas as HTMLCanvasElement).height;
  const cx = Math.round((col / (cols - 1)) * (cW - 1));
  const cy = Math.round((row / (rows - 1)) * (cH - 1));
  const gl_y = cH - 1 - cy;
  const buf = new Uint8Array(4);
  gl.readPixels(cx, gl_y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  return +(buf[3] / 255).toFixed(3);
}

function runCoastalDiag(
  vb: { minLon: number; maxLon: number; minLat: number; maxLat: number },
  H0Grid: number[][] | null,
  TGrid:  number[][] | null,
  depthGrid: number[][],
  DirGrid?: number[][] | null,
  canvas?: HTMLCanvasElement | null,
): void {
  if (!H0Grid || !TGrid) { console.warn('[CoastalDiag] No swell data yet'); return; }
  const rows = depthGrid.length, cols = depthGrid[0]?.length ?? 0;
  if (!rows || !cols) return;

  // Grab GL context for readback (same context the engine already owns)
  const gl = canvas
    ? (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null
    : null;

  // One representative cell per depth band (walk every 4th cell)
  type Pick = { row: number; col: number; d: number; H0: number; T: number; dir: number };
  const bands = [
    { name: 'shallow  (d  0–10 m)',  lo: 0,  hi: 10,  pick: null as Pick | null },
    { name: 'mid-shelf(d 10–50 m)',  lo: 10, hi: 50,  pick: null as Pick | null },
    { name: 'deep-shelf(d 50–200 m)',lo: 50, hi: 200, pick: null as Pick | null },
  ];
  outer: for (let r = 0; r < rows; r += 4) {
    for (let c = 0; c < cols; c += 4) {
      const d   = depthGrid[r]?.[c] ?? NaN;
      const H0  = H0Grid[r]?.[c]   ?? NaN;
      const T   = TGrid[r]?.[c]    ?? NaN;
      const dir = DirGrid?.[r]?.[c] ?? 0;
      if (!isFinite(d) || d <= 0 || !isFinite(H0) || !isFinite(T)) continue;
      for (const b of bands) {
        if (!b.pick && d >= b.lo && d < b.hi) b.pick = { row: r, col: c, d, H0, T, dir };
      }
      if (bands.every(b => b.pick)) break outer;
    }
  }

  // GPU sanity: find one deep cell (should read 0) and one strong cell if possible
  if (gl) {
    let deepPx = null as Pick | null, strongPx = null as Pick | null;
    for (let r = 0; r < rows && (!deepPx || !strongPx); r += 8) {
      for (let c = 0; c < cols && (!deepPx || !strongPx); c += 8) {
        const d = depthGrid[r]?.[c] ?? NaN;
        const H0 = H0Grid[r]?.[c] ?? NaN;
        if (!isFinite(d) || !isFinite(H0)) continue;
        if (!deepPx  && d >= 200)         deepPx  = { row: r, col: c, d, H0, T: 0, dir: 0 };
        if (!strongPx && H0 >= 1.2 && d < 30) strongPx = { row: r, col: c, d, H0, T: 0, dir: 0 };
      }
    }
    if (deepPx)   console.log('[CoastalDiag][GPU sentinel] deep (d≥200, expect≈0):',   _gpuAlpha(gl, deepPx.row,   deepPx.col,   rows, cols), 'H0='+deepPx.H0.toFixed(2));
    if (strongPx) console.log('[CoastalDiag][GPU sentinel] strong (H0≥1.2, expect>0):', _gpuAlpha(gl, strongPx.row, strongPx.col, rows, cols), 'H0='+strongPx.H0.toFixed(2));
  }

  const vbLbl = `${vb.minLat.toFixed(2)}..${vb.maxLat.toFixed(2)}N / ${vb.minLon.toFixed(2)}..${vb.maxLon.toFixed(2)}E`;
  const expFlag = COASTAL_EXPOSURE ? ' [R2 exposure ON]' : ' [R1 only]';
  console.group(`%c[CoastalDiag] Per-pixel — ${vbLbl}${expFlag}`, 'color:#0af;font-weight:bold');
  for (const b of bands) {
    if (!b.pick) { console.log(`  ${b.name}: no cells in this viewport`); continue; }
    const p = b.pick;
    const mirror = _diagPixel(p.H0, p.T, p.dir, p.d, p.row, p.col, depthGrid, rows, cols);
    const gpuAlpha = gl ? _gpuAlpha(gl, p.row, p.col, rows, cols) : null;
    // gpuAlpha = ramp.color.a * effectAlpha * u_opacity (linear after blend fix).
    // gpuExposureInferred: when presence dominates (R2 on, low energyGate), we can
    // back out the GPU's exposure from gpuAlpha ÷ (nm * presenceShape * CAP * rampA).
    // rampA ≈ gpuAlpha / mirror.effectAlpha when available (self-calibrating).
    let gpuExposureInferred: number | null = null;
    if (COASTAL_EXPOSURE && gpuAlpha != null && mirror.nearshoreMask > 0.1) {
      const presenceShape = _ss(0.25, 0.45, p.H0);
      const denominator   = mirror.nearshoreMask * presenceShape * _D_PRESENCE_CAP;
      // rampAlpha ≈ 0.85–0.95 for most cells; use measured ratio if mirror.effectAlpha > 0
      const rampAlphaEst  = mirror.effectAlpha > 0.02 ? gpuAlpha / mirror.effectAlpha : 0.90;
      if (denominator > 0.01 && rampAlphaEst > 0.1) {
        gpuExposureInferred = +Math.min(1, Math.max(0, gpuAlpha / (denominator * rampAlphaEst))).toFixed(3);
      }
    }
    const R2check = COASTAL_EXPOSURE
      ? (gpuAlpha != null ? (gpuAlpha < 0.08 ? 'SHELTERED✓' : gpuAlpha < 0.20 ? 'faint' : 'EXPOSED') : '—')
      : null;
    console.log(`  ${b.name}:`, { ...mirror, gpuAlpha, gpuExposureInferred, R2check,
      gpuVsMirrorDelta: gpuAlpha != null ? +(gpuAlpha - mirror.effectAlpha).toFixed(3) : null });
  }
  console.groupEnd();

  // AREA stats — iterate full 64×64 grid (R1 + optional R2 formula)
  let water = 0, band30 = 0, lit = 0, sumEa = 0, maxEa = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const d = depthGrid[r]?.[c] ?? NaN;
      if (!isFinite(d) || d <= 0) continue;
      water++;
      if (d < 30) band30++;
      if (d >= _D_DEEP) continue;
      const H0  = H0Grid[r]?.[c]   ?? NaN;
      const T   = TGrid[r]?.[c]    ?? NaN;
      const dir = DirGrid?.[r]?.[c] ?? 0;
      if (!isFinite(H0) || !isFinite(T) || H0 < _D_MIN_H0 || T < 1) continue;
      const { breaking } = nearshoreTransform(H0, T, d);
      const eg = _ss(_D_H0_QUIET, _D_H0_FULL, H0);
      const nm = 1 - _ss(_D_NEARSHORE_FULL, _D_NEARSHORE_FADE, d);
      const bb = breaking ? 0.2 * eg : 0;
      const exp_val = COASTAL_EXPOSURE ? _computeExposure(r, c, dir, depthGrid, rows, cols) : 1.0;
      const ps  = COASTAL_EXPOSURE ? exp_val * nm * _ss(0.25, 0.45, H0) * _D_PRESENCE_CAP : 0;
      const ea  = Math.min(1, Math.max(0, Math.max(eg * nm, ps) + bb));
      if (ea >= 0.08) lit++;
      sumEa += ea;
      if (ea > maxEa) maxEa = ea;
    }
  }
  console.log(
    `%c[AREA] ${vbLbl}: water=${water} band<30m=${band30} shallowFrac=${water ? (band30 / water).toFixed(3) : '—'} litCells(α≥0.08)=${lit} meanα=${water ? (sumEa / water).toFixed(3) : '—'} maxα=${maxEa.toFixed(3)}`,
    'color:#fa0;font-weight:bold',
  );
}

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
      maxBreakingHeight: 4.0,  // Matches BREAKING_WAVE_COLORS labels (0–4m); honest global ceiling
      opacity: 1.0,
      logPrefix: '[CoastalDynamics]',
    });
    engine.init(handle.canvas);
    engine.setExposureEnabled(COASTAL_EXPOSURE);
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

    // Diag: capture resampled grids so runCoastalDiag can access them after depth arrives
    let _diagH0Grid:  number[][] | null = null;
    let _diagTGrid:   number[][] | null = null;
    let _diagDirGrid: number[][] | null = null;

    // ── Swell: resample coarse grid onto viewport 64×64 ─────────────────────
    const gridData = swellDataRef.current;
    if (gridData?.points?.length) {
      const lats = [...new Set(gridData.points.map(p => p.lat))].sort((a, b) => a - b);
      const lons = [...new Set(gridData.points.map(p => p.lng))].sort((a, b) => a - b);

      const H0CoarseGrid:  number[][] = [];
      const TCoarseGrid:   number[][] = [];
      const DirCoarseGrid: number[][] = [];
      const H0Map  = new Map<string, number>();
      const TMap   = new Map<string, number>();
      const DirMap = new Map<string, number>();
      gridData.points.forEach(pt => {
        const key = `${pt.lat.toFixed(4)},${pt.lng.toFixed(4)}`;
        // Swell-primary H0 policy: use swell_wave_height where meaningful (open-ocean
        // swell carries shoaling/refraction structure); fall back to total wave_height
        // where swell≈0 (enclosed seas like Eastern Med in summer).
        const SWELL_FLOOR = 0.1;
        const swH = pt.swellHeight ?? 0;
        const swP = pt.swellPeriod ?? 0;
        const swD = pt.swellDirection ?? pt.waveDirection ?? 0;
        const wD  = pt.waveDirection ?? 0;
        const h0 = pt.isOcean ? ((swH > SWELL_FLOOR ? swH : (pt.waveHeight ?? 0)) || NaN) : NaN;
        const t  = pt.isOcean ? ((swH > SWELL_FLOOR ? (swP > 0 ? swP : (pt.wavePeriod ?? 0)) : (pt.wavePeriod ?? 0)) || NaN) : NaN;
        const d  = pt.isOcean ? (swH > SWELL_FLOOR ? swD : wD) : 0;
        H0Map.set(key, h0);
        TMap.set(key,  t);
        DirMap.set(key, d);
      });
      for (let li = 0; li < lats.length; li++) {
        const H0Row:  number[] = [];
        const TRow:   number[] = [];
        const DirRow: number[] = [];
        for (let lo = 0; lo < lons.length; lo++) {
          const key = `${lats[li].toFixed(4)},${lons[lo].toFixed(4)}`;
          H0Row.push(H0Map.get(key)   ?? NaN);
          TRow.push(TMap.get(key)     ?? NaN);
          DirRow.push(DirMap.get(key) ?? 0);
        }
        H0CoarseGrid.push(H0Row);
        TCoarseGrid.push(TRow);
        DirCoarseGrid.push(DirRow);
      }

      // Resample onto viewport 64×64 with row 0 = maxLat (north), matching depth
      const H0Grid:  number[][] = [];
      const TGrid:   number[][] = [];
      const DirGrid: number[][] = [];
      for (let row = 0; row < GRID_ROWS; row++) {
        // row 0 = maxLat (north), row GRID_ROWS-1 = minLat (south)
        const lat = vb.maxLat - (row / (GRID_ROWS - 1)) * (vb.maxLat - vb.minLat);
        const H0Row:  number[] = [];
        const TRow:   number[] = [];
        const DirRow: number[] = [];
        for (let col = 0; col < GRID_COLS; col++) {
          const lon = vb.minLon + (col / (GRID_COLS - 1)) * (vb.maxLon - vb.minLon);
          H0Row.push(bilinearInterp(H0CoarseGrid,  lats, lons, lat, lon));
          TRow.push(bilinearInterp(TCoarseGrid,    lats, lons, lat, lon));
          DirRow.push(bilinearInterp(DirCoarseGrid, lats, lons, lat, lon));
        }
        H0Grid.push(H0Row);
        TGrid.push(TRow);
        DirGrid.push(DirRow);
      }

      const tideM = gridData.points.find(p => p.isOcean)?.seaLevelHeight ?? 0;
      engine.setTideOffset(tideM);
      engine.updateSwellData(H0Grid, TGrid, vb.minLon, vb.maxLon, vb.minLat, vb.maxLat, DirGrid);
      _diagH0Grid  = H0Grid;
      _diagTGrid   = TGrid;
      _diagDirGrid = DirGrid;
    }

    // ── Depth: fetch at viewport ─────────────────────────────────────────────
    try {
      const depthGrid = await fetchDepthGrid(vb, GRID_COLS, GRID_ROWS, tileZoom);
      if (token.aborted) return;

      engine.updateBathymetryData(depthGrid, vb.minLon, vb.maxLon, vb.minLat, vb.maxLat);

      if (COASTAL_DIAG) runCoastalDiag(vb, _diagH0Grid, _diagTGrid, depthGrid, _diagDirGrid, canvasHandleRef.current?.canvas);

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
