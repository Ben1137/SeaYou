/**
 * TerrariumBathymetry.ts — Fetch and decode GEBCO 2026 Mapbox Terrain-RGB DEM tiles into a numeric depth grid.
 *
 * Source:   GEBCO 2026 (Global Bathymetric and Topographic Data, 15 arc-second resolution)
 * Archive:  R2 PMTiles at https://pub-9402052a478244fcba35637fe8298abe.r2.dev/gebco_2026_terrain_rgb.pmtiles
 * Format:   PMTiles v3, z0–10 pyramid, WebP-encoded tiles (lossless)
 * Encoding: **Mapbox Terrain-RGB** (NOT Terrarium)
 *           elevation_m = −10000 + (R*65536 + G*256 + B) * 0.1
 *           depth_m = −elevation_m (positive = below sea level)
 * CORS:     Cloudflare R2 bucket allows Range requests, Access-Control-Allow-Origin: * confirmed.
 *
 * Resolution at equator:
 *   z8  → ~610 m/px   z9  → ~305 m/px   z10 → ~152 m/px
 * GEBCO native (15 arc-second) ≈ 450 m at equator — effective fidelity ceiling is z9–z10.
 * Higher zoom tiles interpolate — smooth sampling, not added bathymetric truth.
 *
 * Usage:
 *   const grid = await fetchDepthGrid(bounds, cols, rows, 9);
 *   // grid[row][col] = depth in metres (positive = below sea level, negative = above)
 */

import { PMTiles } from 'pmtiles';

const GEBCO_URL = 'https://pub-9402052a478244fcba35637fe8298abe.r2.dev/gebco_2026_terrain_rgb.pmtiles';
const pmtiles = new PMTiles(GEBCO_URL);

/** Decode a single GEBCO Mapbox Terrain-RGB pixel to elevation (metres, negative = underwater). */
function decodeMapboxElevation(r: number, g: number, b: number): number {
  return -10000 + (r * 65536 + g * 256 + b) * 0.1;
}

/** Full decode: GEBCO Mapbox Terrain-RGB → ocean depth in metres (positive = underwater).
 *  Legacy name kept for callers; the implementation now uses Mapbox decoder.
 */
export function decodeTerrariumDepth(r: number, g: number, b: number): number {
  if (r === 0 && g === 0 && b === 0) return NaN; // nodata sentinel → transparent, not +10000 m
  return -decodeMapboxElevation(r, g, b); // Gordon (1,134,60) → +10 m
}


// ── Tile maths ─────────────────────────────────────────────────────────────

function lonToTileX(lon: number, zoom: number): number {
  return Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
}

function latToTileY(lat: number, zoom: number): number {
  const rad = lat * Math.PI / 180;
  return Math.floor(
    (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * Math.pow(2, zoom)
  );
}

function tileToLon(x: number, zoom: number): number {
  return x / Math.pow(2, zoom) * 360 - 180;
}

function tileToLat(y: number, zoom: number): number {
  const n = Math.PI - 2 * Math.PI * y / Math.pow(2, zoom);
  return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/** Sample a Terrarium tile image at a specific lon/lat → depth metres. */
function sampleTileAtLonLat(
  imageData: ImageData,
  tileLon0: number,
  tileLon1: number,
  tileLat0: number, // north
  tileLat1: number, // south
  lon: number,
  lat: number,
): number {
  const { width, height, data } = imageData;
  // Bilinear: map lon/lat to pixel coordinate within the tile
  const u = (lon - tileLon0) / (tileLon1 - tileLon0);
  // Latitude within Mercator tile: y increases downward
  const latRad = lat * Math.PI / 180;
  const lat0Rad = tileLat0 * Math.PI / 180;
  const lat1Rad = tileLat1 * Math.PI / 180;
  const yMerc = Math.log(Math.tan(latRad) + 1 / Math.cos(latRad));
  const y0Merc = Math.log(Math.tan(lat0Rad) + 1 / Math.cos(lat0Rad));
  const y1Merc = Math.log(Math.tan(lat1Rad) + 1 / Math.cos(lat1Rad));
  // v=0 at north (lat0), v=1 at south (lat1)
  const v = (y0Merc - yMerc) / (y0Merc - y1Merc);

  const px = Math.max(0, Math.min(width - 1, u * width));
  const py = Math.max(0, Math.min(height - 1, v * height));

  // Nearest-neighbour (sufficient given ETOPO1 ~1.85 km native resolution)
  const ix = Math.round(px);
  const iy = Math.round(py);
  const base = (iy * width + ix) * 4;
  return decodeTerrariumDepth(data[base], data[base + 1], data[base + 2]);
}

// ── Tile image cache (in-memory, session-scoped) ────────────────────────────

const tileCache = new Map<string, Promise<ImageData | null>>();

async function loadTile(z: number, x: number, y: number): Promise<ImageData | null> {
  const key = `${z}/${x}/${y}`;
  if (tileCache.has(key)) return tileCache.get(key)!;

  const promise = (async () => {
    try {
      const tileData = await pmtiles.getZxy(z, x, y);
      if (!tileData) return null; // Tile missing (404)

      // Decode WebP blob to ImageBitmap, then to ImageData
      const bmp = await createImageBitmap(new Blob([tileData.data], { type: 'image/webp' }));
      const canvas = document.createElement('canvas');
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(bmp, 0, 0);
      return ctx.getImageData(0, 0, bmp.width, bmp.height);
    } catch {
      return null; // Decode error, network error, etc.
    }
  })();

  tileCache.set(key, promise);
  return promise;
}

/** Evict all cached tiles (call on map bounds change if desired). */
export function clearBathymetryCache(): void {
  tileCache.clear();
}

/**
 * Fetch depth at a single lat/lon point. Returns depth in metres (+ve = below sea level,
 * negative = land / above). Uses zoom 10 by default (same as the map at nearshore zoom).
 * Reuses the tile cache — repeated calls near the same point are cheap.
 *
 * NOTE: does NOT delegate to fetchDepthGrid(bounds, 1, 1) — that path has a 0/0 NaN when
 * rows=1 or cols=1 (row/(rows-1) and col/(cols-1) both evaluate to 0/0). Instead we
 * directly load the single tile and call sampleTileAtLonLat, matching fetchDepthGrid's
 * inner loop exactly.
 */
export async function fetchDepthAtPoint(lat: number, lon: number, zoom = 10): Promise<number> {
  const tx = lonToTileX(lon, zoom);
  const ty = latToTileY(lat, zoom);
  const imageData = await loadTile(zoom, tx, ty);
  if (!imageData) return NaN;
  const lon0 = tileToLon(tx, zoom);
  const lon1 = tileToLon(tx + 1, zoom);
  const lat0 = tileToLat(ty, zoom);      // north edge
  const lat1 = tileToLat(ty + 1, zoom);  // south edge
  return sampleTileAtLonLat(imageData, lon0, lon1, lat0, lat1, lon, lat);
}

/**
 * Fetch nearshore depth for a spot. Returns the depth (m, +down) best representing the
 * breaking zone at this location.
 *
 * Behaviour:
 *  1. Sample the exact point. If depth is in a usable nearshore range (0 < d < 200 m) return it.
 *  2. If the exact point is on land / waterline (d ≤ 0) or has no tile data (NaN), the marker
 *     may sit on the beach. Search a ~2 km box (5×5 grid) for the shallowest surf-zone cell
 *     (3–20 m first choice; any ocean cell < 200 m as fallback).
 *  3. Bearing guard: compute the seaward normal from the depth gradient (zoom 9, ±6 km LS
 *     plane fit — same method as fetchNearshoreDepthWithGradient). If the bearing from the
 *     pin to the winning box-search cell is more than BEARING_GUARD_DEG off the seaward
 *     normal, the search has crossed land or found water on the wrong side of a headland.
 *     In that case return NaN so the hook falls back to K-G (which needs no depth).
 *     Threshold: 90°. Rationale: ±90° is exactly one quadrant — any cell within a right
 *     angle of the seaward direction is genuinely offshore. Cells beyond ±90° are either
 *     perpendicular to the coast (ambiguous) or pointing inland.
 *     Note: this catches Uluwatu (delta=154°, ocean found NNW = inland Bali) but NOT
 *     Pipeline (delta=72°, ocean found NNE = just inside the right angle even though it
 *     is the Haleiwa shelf rather than the break). Pipeline requires a coordinate move.
 *  4. SURF_MIN floor: 3 m minimum avoids swash-zone pixels (γ·d would clip all realistic
 *     swell).
 *  5. If no usable depth found anywhere nearby → return NaN.
 */
export async function fetchNearshoreDepth(lat: number, lon: number, zoom = 10): Promise<number> {
  const d = await fetchDepthAtPoint(lat, lon, zoom);
  if (isFinite(d) && d > 0 && d < 200) return d;

  // Exact point is on land, waterline, no-data, or deep water — search nearby.
  const BOX_DEG = 2 / 111; // ~2 km in degrees (conservative; 111 km/degree at equator)
  const bounds: DepthGridBounds = {
    minLon: lon - BOX_DEG, maxLon: lon + BOX_DEG,
    minLat: lat - BOX_DEG, maxLat: lat + BOX_DEG,
  };
  const grid = await fetchDepthGrid(bounds, 5, 5, zoom);

  // SURF_MIN floor: 3 m minimum. 1-2 m cells are swash-zone pixels — they resolve
  // to γ·d = 0.78-1.56 m, which clips any realistic swell and produces wildly
  // inaccurate labels at world-class breaks (e.g. Jeffreys Bay returned 1.1 m).
  const SURF_MIN = 3, SURF_MAX = 20; // m — surf-zone preference window

  // Track winning cell position for bearing guard below.
  let shallowest: number | null = null;
  let shallowestLat: number | null = null;
  let shallowestLon: number | null = null;
  let anyOcean:   number | null = null;
  let anyOceanLat: number | null = null;
  let anyOceanLon: number | null = null;

  const ROWS = 5, COLS = 5;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = grid[row]?.[col];
      if (!isFinite(cell) || cell <= 0 || cell >= 200) continue;
      // Reconstruct the lat/lon of this grid cell (matching fetchDepthGrid's sampling)
      const cellLat = (lat + BOX_DEG) - (row / (ROWS - 1)) * (2 * BOX_DEG);
      const cellLon = (lon - BOX_DEG) + (col / (COLS - 1)) * (2 * BOX_DEG);
      if (anyOcean === null || cell < anyOcean) {
        anyOcean = cell; anyOceanLat = cellLat; anyOceanLon = cellLon;
      }
      if (cell >= SURF_MIN && cell <= SURF_MAX) {
        if (shallowest === null || cell < shallowest) {
          shallowest = cell; shallowestLat = cellLat; shallowestLon = cellLon;
        }
      }
    }
  }

  // Reject swash-zone-only result (same logic as before).
  if (shallowest === null && anyOcean !== null && anyOcean < SURF_MIN) {
    return NaN;
  }

  // Winning cell and its depth.
  const winDepth = shallowest ?? anyOcean ?? null;
  const winLat   = shallowest !== null ? shallowestLat : anyOceanLat;
  const winLon   = shallowest !== null ? shallowestLon : anyOceanLon;

  if (winDepth === null || winLat === null || winLon === null) return NaN;

  // ── Bearing guard ────────────────────────────────────────────────────────
  // Guard threshold: 90°. A cell within ±90° of the seaward normal is
  // genuinely offshore. Beyond ±90° it is on the wrong side of the coast.
  // Strict `>` means exactly 90° passes (perpendicular = ambiguous, not wrong).
  const BEARING_GUARD_DEG = 90;
  const gradient = await computeDepthGradient(lat, lon);

  if (isFinite(gradient.seawardNormal)) {
    // Bearing from pin to winning box-search cell
    const dLon = Math.atan2(
      Math.sin((winLon - lon) * Math.PI / 180) * Math.cos(winLat * Math.PI / 180),
      Math.cos(lat * Math.PI / 180) * Math.sin(winLat * Math.PI / 180) -
      Math.sin(lat * Math.PI / 180) * Math.cos(winLat * Math.PI / 180) *
        Math.cos((winLon - lon) * Math.PI / 180),
    ) * 180 / Math.PI;
    const cellBearing = (dLon + 360) % 360;

    // Arc difference (smallest angle between the two bearings)
    const rawDiff = Math.abs(gradient.seawardNormal - cellBearing) % 360;
    const delta = Math.min(rawDiff, 360 - rawDiff);

    // Always log so the diagnostic stays visible in production.
    if (typeof window !== 'undefined') {
      console.log('[BearingGuard]', {
        lat: lat.toFixed(4), lon: lon.toFixed(4),
        seawardNormal: gradient.seawardNormal.toFixed(1),
        cellBearing: cellBearing.toFixed(1),
        delta: delta.toFixed(1),
        winDepth: winDepth.toFixed(1),
        result: delta > BEARING_GUARD_DEG ? 'REJECTED' : 'ACCEPTED',
      });
    }

    if (delta > BEARING_GUARD_DEG) {
      return NaN; // Cell is more than 90° off the seaward direction → wrong water body
    }
  }
  // If gradient unavailable (< 4 ocean cells or tile error): skip guard, return depth as-is.
  // Conservative: prefer a possibly-wrong cell over suppressing a valid reading on a tile error.

  return winDepth;
}

// ── Public API ──────────────────────────────────────────────────────────────

// ─── Gradient constants — single source of truth ─────────────────────────────
// Both the bearing guard (fetchNearshoreDepth) and the gradient output
// (fetchNearshoreDepthWithGradient) use identical parameters. Defined once here.
const GRADIENT_HALF_KM  = 6;   // ±6 km — clears the ~1.85 km ETOPO native cell
const GRADIENT_ZOOM     = 9;   // honest fidelity ceiling; z10 upsamples → false precision
const GRADIENT_ROWS     = 5;
const GRADIENT_COLS     = 5;

/** Result of a least-squares depth-gradient plane fit. */
interface DepthGradientResult {
  /** Eastward depth gradient (m/m), cos(lat)-corrected. NaN if fit failed. */
  gradEast: number;
  /** Northward depth gradient (m/m). NaN if fit failed. */
  gradNorth: number;
  /** Seaward compass bearing (°, [0,360)) from the gradient. NaN if fit failed. */
  seawardNormal: number;
  /** Number of ocean cells that entered the fit. */
  cellsUsed: number;
}

/**
 * Compute the depth gradient and seaward normal for a given lat/lon.
 *
 * Fetches a 5×5 grid at zoom 9, ±6 km (GRADIENT_* constants), keeps ocean-only
 * cells (0 < d < 200 m), and fits a plane depth ≈ a·E_m + b·N_m + c via
 * least-squares. Returns the gradient components, the seaward bearing
 * (direction of increasing depth = toward open sea), and the cell count.
 *
 * Returns NaN values when fewer than 4 ocean cells are available or the fit
 * is degenerate. The caller must guard on isFinite(seawardNormal) before use.
 *
 * Tile fetches are deduped via tileCache — concurrent or sequential calls for
 * nearby points with the same z9 tile are free after the first.
 */
async function computeDepthGradient(lat: number, lon: number): Promise<DepthGradientResult> {
  const NaN_RESULT: DepthGradientResult = { gradEast: NaN, gradNorth: NaN, seawardNormal: NaN, cellsUsed: 0 };
  try {
    const dLatSpan = GRADIENT_HALF_KM / 110.57;
    const dLonSpan = GRADIENT_HALF_KM / (111.32 * Math.cos(lat * Math.PI / 180));
    const bounds: DepthGridBounds = {
      minLon: lon - dLonSpan, maxLon: lon + dLonSpan,
      minLat: lat - dLatSpan, maxLat: lat + dLatSpan,
    };
    const grid = await fetchDepthGrid(bounds, GRADIENT_COLS, GRADIENT_ROWS, GRADIENT_ZOOM);
    const colStepM = (2 * dLonSpan * Math.cos(lat * Math.PI / 180) * 111320) / (GRADIENT_COLS - 1);
    const rowStepM = (2 * dLatSpan * 110570) / (GRADIENT_ROWS - 1);

    const cells: { E_m: number; N_m: number; depth: number }[] = [];
    for (let row = 0; row < GRADIENT_ROWS; row++) {
      for (let col = 0; col < GRADIENT_COLS; col++) {
        const depth = grid[row]?.[col];
        if (!isFinite(depth) || depth <= 0 || depth >= 200) continue;
        cells.push({ E_m: (col - 2) * colStepM, N_m: (2 - row) * rowStepM, depth });
      }
    }

    if (cells.length < 4) return { ...NaN_RESULT, cellsUsed: cells.length };

    const n = cells.length;
    const meanE = cells.reduce((s, c) => s + c.E_m,  0) / n;
    const meanN = cells.reduce((s, c) => s + c.N_m,  0) / n;
    const meanD = cells.reduce((s, c) => s + c.depth, 0) / n;
    let sEE = 0, sEN = 0, sNN = 0, sdE = 0, sdN = 0;
    for (const { E_m, N_m, depth } of cells) {
      const e = E_m - meanE, nv = N_m - meanN, dv = depth - meanD;
      sEE += e * e; sEN += e * nv; sNN += nv * nv;
      sdE += dv * e; sdN += dv * nv;
    }
    const det = sEE * sNN - sEN * sEN;
    if (Math.abs(det) < 1e-12) return { ...NaN_RESULT, cellsUsed: n };

    const gradEast  = (sdE * sNN - sdN * sEN) / det;
    const gradNorth = (sEE * sdN - sEN * sdE) / det;
    const mag = Math.hypot(gradEast, gradNorth);
    if (mag < 1e-4) return { ...NaN_RESULT, cellsUsed: n };

    const seawardNormal = (Math.atan2(gradEast, gradNorth) * 180 / Math.PI + 360) % 360;
    return { gradEast, gradNorth, seawardNormal, cellsUsed: n };
  } catch {
    return NaN_RESULT;
  }
}

export interface DepthGridBounds {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

/**
 * Fetch a numeric depth grid for the given bounds at the given tile zoom.
 *
 * @param bounds  - Geographic bounding box
 * @param cols    - Number of output columns (should match marine grid cols)
 * @param rows    - Number of output rows (should match marine grid rows)
 * @param zoom    - GEBCO 2026 tile zoom (8 = ~610 m/px; 9 = ~305 m/px; 10 = ~152 m/px, smooth)
 * @returns grid[row][col] = depth in metres (positive = below sea level, negative = land/above)
 *
 * GEBCO 2026 native resolution is ~450 m (15 arc-second), so zoom 9–10 is the honest fidelity ceiling.
 * We default to z9 for smooth interpolation across a typical viewport.
 */
export async function fetchDepthGrid(
  bounds: DepthGridBounds,
  cols: number,
  rows: number,
  zoom = 9,
): Promise<number[][]> {
  const { minLon, maxLon, minLat, maxLat } = bounds;

  // Determine tile range covering the bounds
  const tileXMin = lonToTileX(minLon, zoom);
  const tileXMax = lonToTileX(maxLon, zoom);
  const tileYMin = latToTileY(maxLat, zoom); // north → lower Y index
  const tileYMax = latToTileY(minLat, zoom); // south → higher Y index

  // Fetch all required tiles in parallel
  const tilePromises: Array<{ tx: number; ty: number; promise: Promise<ImageData | null> }> = [];
  for (let ty = tileYMin; ty <= tileYMax; ty++) {
    for (let tx = tileXMin; tx <= tileXMax; tx++) {
      tilePromises.push({ tx, ty, promise: loadTile(zoom, tx, ty) });
    }
  }

  // Resolve tile images, keyed by tx/ty. Count missing tiles for a single batch warning.
  const tileImages = new Map<string, ImageData | null>();
  let missingTileCount = 0;
  await Promise.all(
    tilePromises.map(async ({ tx, ty, promise }) => {
      const imageData = await promise;
      tileImages.set(`${tx},${ty}`, imageData);
      if (imageData === null) missingTileCount++;
    })
  );
  if (missingTileCount > 0) {
    console.warn(
      `[TerrariumBathymetry] ${missingTileCount} tile(s) unavailable (404/error) at z${zoom}` +
      ` — rendering as transparent (no breaking signal).`
    );
  }

  // Sample depth at each output grid point
  const grid: number[][] = [];
  for (let row = 0; row < rows; row++) {
    // row 0 = maxLat (north), row rows-1 = minLat (south)
    const lat = maxLat - (row / (rows - 1)) * (maxLat - minLat);
    const gridRow: number[] = [];

    for (let col = 0; col < cols; col++) {
      const lon = minLon + (col / (cols - 1)) * (maxLon - minLon);

      // Which tile does this point fall in?
      const tx = lonToTileX(lon, zoom);
      const ty = latToTileY(lat, zoom);
      const imageData = tileImages.get(`${tx},${ty}`);

      if (!imageData) {
        // NaN sentinel → engine's `!isNaN(d) && d > 0` guard → A=0 → shader discards (transparent).
        // This means missing tiles render as no-data transparent, not false shallow/breaking signal.
        gridRow.push(NaN);
        continue;
      }

      // Tile geo bounds
      const lon0 = tileToLon(tx, zoom);
      const lon1 = tileToLon(tx + 1, zoom);
      const lat0 = tileToLat(ty, zoom);     // north edge
      const lat1 = tileToLat(ty + 1, zoom); // south edge

      gridRow.push(sampleTileAtLonLat(imageData, lon0, lon1, lat0, lat1, lon, lat));
    }

    grid.push(gridRow);
  }

  return grid;
}

/** Gradient result type for shore-normal calculation. */
export interface NearshoreDepthWithGradient {
  /** Centre depth at the spot (m, +down). NaN if no usable depth found. */
  centreDepth: number;
  /**
   * Eastward component of the depth gradient (m/m), cos(lat)-corrected.
   * Computed by central difference over ~1 km E/W pair, projected to metres.
   * Positive = depth increases eastward (open sea is to the east).
   * NaN when gradient is unavailable.
   */
  gradEast: number;
  /**
   * Northward component of the depth gradient (m/m).
   * Computed by central difference over ~1 km N/S pair, projected to metres.
   * Positive = depth increases northward (open sea is to the north).
   * NaN when gradient is unavailable.
   */
  gradNorth: number;
}

/**
 * Fetch nearshore depth AND a least-squares depth-gradient for the offshore bearing.
 *
 * Algorithm:
 *   1. Fetch centre depth via fetchNearshoreDepth (proven path; handles land fallback).
 *   2. Fetch a 5×5 ~4km grid via fetchDepthGrid; keep only ocean cells (0 < d < 200 m).
 *      A two-point central difference dies at the coast (inland neighbour = land/NaN).
 *      A plane fit over ocean-only cells is robust: the land half is simply absent.
 *   3. Least-squares plane fit: depth ≈ a·E_m + b·N_m + c (demeaned, 2×2 normal equations).
 *      gradEast = a, gradNorth = b (m/m). atan2(E,N) → offshore compass bearing.
 *   4. Grid fetch is in its own try/catch — failure → NaN gradients; reading still renders.
 *
 * Row/col convention (from fetchDepthGrid): row 0 = north (maxLat), col 0 = west (minLon).
 * cos(lat) correction applied so atan2(gradEast, gradNorth) gives a true compass bearing.
 */
export async function fetchNearshoreDepthWithGradient(
  lat: number,
  lon: number,
  zoom = 10,
): Promise<NearshoreDepthWithGradient> {
  // Step 1 — centre depth (proven path; never fails the reading)
  const centreDepth = await fetchNearshoreDepth(lat, lon, zoom);

  // Step 2 — gradient via shared helper (same constants as bearing guard)
  const gradient = await computeDepthGradient(lat, lon);

  // Cell-count diagnostic — flag-gated on ?windQualityDebug=1
  if (typeof window !== 'undefined' && window.location.search.includes('windQualityDebug=1')) {
    console.log('[GradientDiag]', {
      lat: lat.toFixed(4), lon: lon.toFixed(4),
      zoom: GRADIENT_ZOOM, halfKm: GRADIENT_HALF_KM,
      cellsUsed: gradient.cellsUsed,
      seawardNormal: isFinite(gradient.seawardNormal) ? gradient.seawardNormal.toFixed(1) : 'NaN',
    });
  }

  return { centreDepth, gradEast: gradient.gradEast, gradNorth: gradient.gradNorth };
}
