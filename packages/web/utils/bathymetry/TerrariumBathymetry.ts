/**
 * TerrariumBathymetry.ts — Fetch and decode Terrarium-encoded DEM tiles into a numeric depth grid.
 *
 * Endpoint: https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png
 * Encoding: depth_m = -((R * 256 + G + B / 256) - 32768)   (negative = below sea level)
 * Source:   ETOPO1 Bedrock for ocean tiles (confirmed via x-amz-meta-x-imagery-sources).
 * CORS:     Public bucket, Access-Control-Allow-Origin: * confirmed via OPTIONS preflight.
 *
 * Resolution (tile pixel = metres at equator):
 *   z8  → ~610 m/px   z10 → ~152 m/px   z12 → ~38 m/px   z14 → ~9.5 m/px
 * ETOPO1 native: ~1.85 km/px, so effective depth fidelity caps at z8-z10 for ocean.
 * Higher zoom tiles interpolate — useful for smooth per-pixel sampling, not added accuracy.
 *
 * Usage:
 *   const bathy = new TerrariumBathymetrySource();
 *   const grid = await bathy.fetchDepthGrid(bounds, cols, rows);
 *   // grid[row][col] = depth in metres (positive = below sea level, negative = above)
 */

const TERRARIUM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

/** Decode a single Terrarium RGB pixel to elevation (metres, positive = above sea level). */
export function decodeTerrariumElevation(r: number, g: number, b: number): number {
  return (r * 256 + g + b / 256) - 32768;
}

/** Convert elevation to ocean depth (positive = metres below sea level). */
export function elevationToDepth(elevation: number): number {
  return -elevation; // depth > 0 is underwater, < 0 is land/above sea level
}

/** Full decode: Terrarium RGB → ocean depth in metres (positive = underwater). */
export function decodeTerrariumDepth(r: number, g: number, b: number): number {
  return elevationToDepth(decodeTerrariumElevation(r, g, b));
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

function loadTile(z: number, x: number, y: number): Promise<ImageData | null> {
  const key = `${z}/${x}/${y}`;
  if (tileCache.has(key)) return tileCache.get(key)!;

  const url = TERRARIUM_URL.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
  const promise = new Promise<ImageData | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(null); return; }
      ctx.drawImage(img, 0, 0);
      try {
        resolve(ctx.getImageData(0, 0, img.width, img.height));
      } catch {
        resolve(null); // cross-origin read blocked
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });

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
 *     (1–20 m first choice; any ocean cell < 200 m as fallback). This makes any coastal marker
 *     work, not just ones that are already in the water.
 *  3. If no usable depth found anywhere nearby → return NaN (hook returns null, P5.2 shows nothing).
 *
 * Rule: deep-water points (d ≥ 200 m) also trigger the search, since the engine only renders
 * nearshore and a deep result means the marker is offshore of the surf zone.
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

  const SURF_MIN = 1, SURF_MAX = 20; // m — surf-zone preference window
  let shallowest: number | null = null;  // nearest surf-zone depth (1–20 m)
  let anyOcean:   number | null = null;  // any valid nearshore depth (< 200 m fallback)

  for (const row of grid) {
    for (const cell of row) {
      if (!isFinite(cell) || cell <= 0 || cell >= 200) continue;
      if (anyOcean === null || cell < anyOcean) anyOcean = cell;
      if (cell >= SURF_MIN && cell <= SURF_MAX) {
        if (shallowest === null || cell < shallowest) shallowest = cell;
      }
    }
  }
  return shallowest ?? anyOcean ?? NaN;
}

// ── Public API ──────────────────────────────────────────────────────────────

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
 * @param zoom    - Terrarium tile zoom (8 = ~610 m/px, matches ETOPO1; 10 = ~152 m/px, smooth)
 * @returns grid[row][col] = depth in metres (positive = below sea level, negative = land/above)
 *
 * ETOPO1 native resolution is ~1.85 km, so zoom 8–9 is the honest fidelity ceiling.
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

  // Step 2 — gradient grid in its own try/catch so a tile error never nulls the reading
  try {
    const ROWS = 5, COLS = 5;
    const HALF_KM   = 6;   // ±6 km — must clear the ~1.85 km ETOPO native cell + blocky coastline
    const GRAD_ZOOM = 9;   // honest fidelity ceiling; z10 upsamples one coarse cell → false precision

    const dLatSpan = HALF_KM / 110.57;
    const dLonSpan = HALF_KM / (111.32 * Math.cos(lat * Math.PI / 180));

    const bounds: DepthGridBounds = {
      minLon: lon - dLonSpan, maxLon: lon + dLonSpan,
      minLat: lat - dLatSpan, maxLat: lat + dLatSpan,
    };
    const grid = await fetchDepthGrid(bounds, COLS, ROWS, GRAD_ZOOM);

    // ~3 km between adjacent cells (5 cells over 12 km = 4 intervals)
    const colStepM = (2 * dLonSpan * Math.cos(lat * Math.PI / 180) * 111320) / (COLS - 1);
    const rowStepM = (2 * dLatSpan * 110570) / (ROWS - 1);

    // row 0 = north (maxLat) → N_m positive; col 0 = west (minLon) → E_m negative
    const cells: { E_m: number; N_m: number; depth: number }[] = [];
    let oceanCells = 0, landCells = 0, noTileCells = 0;
    let depthMin = Infinity, depthMax = -Infinity;
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const depth = grid[row][col];
        if (!isFinite(depth))      { noTileCells++; continue; }
        if (depth <= 0)            { landCells++;   continue; }
        if (depth >= 200)          { continue; }  // deep — outside nearshore band
        oceanCells++;
        if (depth < depthMin) depthMin = depth;
        if (depth > depthMax) depthMax = depth;
        cells.push({ E_m: (col - 2) * colStepM, N_m: (2 - row) * rowStepM, depth });
      }
    }

    // Cell-count diagnostic — flag-gated on ?windQualityDebug=1
    if (typeof window !== 'undefined' && window.location.search.includes('windQualityDebug=1')) {
      console.log('[GradientDiag]', {
        lat: lat.toFixed(4), lon: lon.toFixed(4), zoom: GRAD_ZOOM, halfKm: HALF_KM,
        totalCells: ROWS * COLS, oceanCells, landCells, noTileCells,
        depthMin: isFinite(depthMin) ? depthMin.toFixed(1) : '-',
        depthMax: isFinite(depthMax) ? depthMax.toFixed(1) : '-',
      });
    }

    if (cells.length < 4) {
      return { centreDepth, gradEast: NaN, gradNorth: NaN };
    }

    // Least-squares plane fit: depth ≈ a·E_m + b·N_m + c (demeaned → 2×2 normal equations)
    const n = cells.length;
    const meanE = cells.reduce((s, c) => s + c.E_m,  0) / n;
    const meanN = cells.reduce((s, c) => s + c.N_m,  0) / n;
    const meanD = cells.reduce((s, c) => s + c.depth, 0) / n;

    let sEE = 0, sEN = 0, sNN = 0, sdE = 0, sdN = 0;
    for (const { E_m, N_m, depth } of cells) {
      const e = E_m - meanE, nv = N_m - meanN, d = depth - meanD;
      sEE += e * e; sEN += e * nv; sNN += nv * nv;
      sdE += d * e; sdN += d * nv;
    }

    const det = sEE * sNN - sEN * sEN;
    if (Math.abs(det) < 1e-12) {
      return { centreDepth, gradEast: NaN, gradNorth: NaN };
    }

    const gradEast  = (sdE * sNN - sdN * sEN) / det;
    const gradNorth = (sEE * sdN - sEN * sdE) / det;

    return { centreDepth, gradEast, gradNorth };
  } catch {
    return { centreDepth, gradEast: NaN, gradNorth: NaN };
  }
}
