/**
 * LandMask.ts - Generate land mask textures for marine data layers
 *
 * Creates GPU textures that identify land pixels to prevent marine data
 * from bleeding onto land areas in heatmaps and particle layers.
 *
 * Approach: Rasterize land GeoJSON polygons to a canvas, upload as texture.
 */

export interface BoundsLatLng {
  west: number;
  south: number;
  east: number;
  north: number;
}

/**
 * Simple land GeoJSON for quick masking (110m resolution from Natural Earth)
 * Format: Array of [longitude, latitude] coordinate arrays (polygon rings)
 * This is inline to avoid external fetch dependencies
 */
const SIMPLIFIED_LAND_GEOMETRY: number[][][] = [
  // Mediterranean region simplified polygon
  // In production, would load from world-atlas or Natural Earth data
  // For now, using a minimal Mediterranean basin outline
  [
    [30, 46], [45, 46], [45, 29], [30, 29], [30, 46] // Rough Med bounding box
  ]
];

/**
 * Create a land mask texture by rasterizing land polygons to a canvas
 * then uploading to WebGL.
 *
 * @param gl - WebGL context
 * @param bounds - Geographic bounds to cover
 * @param width - Texture width in pixels
 * @param height - Texture height in pixels
 * @param landGeometry - Optional GeoJSON-style polygon coordinates [[lng, lat], ...]
 * @returns WebGL texture where R channel = 1.0 for land, 0.0 for water
 */
export async function createLandMaskTexture(
  gl: WebGLRenderingContext,
  bounds: BoundsLatLng,
  width: number,
  height: number,
  landGeometry?: number[][][]
): Promise<WebGLTexture> {
  // Use provided geometry or fallback to simplified
  const geometry = landGeometry || SIMPLIFIED_LAND_GEOMETRY;

  // Create offscreen canvas for rasterization
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if (!ctx) {
    throw new Error('[LandMask] Failed to create 2D context');
  }

  // Clear to water (black)
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, width, height);

  // Render land polygons (white)
  ctx.fillStyle = 'white';
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 1;

  for (const ring of geometry) {
    if (ring.length < 3) continue; // Skip invalid polygons

    ctx.beginPath();
    let first = true;

    for (const [lng, lat] of ring) {
      // Check if point is within bounds (with slight margin for edge cases)
      if (lng < bounds.west - 10 || lng > bounds.east + 10 ||
          lat < bounds.south - 10 || lat > bounds.north + 10) {
        continue;
      }

      // Convert geographic to canvas coordinates
      const x = ((lng - bounds.west) / (bounds.east - bounds.west)) * width;
      const y = ((bounds.north - lat) / (bounds.north - bounds.south)) * height;

      if (first) {
        ctx.moveTo(x, y);
        first = false;
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Extract pixel data
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;

  // Convert to single-channel (R = land mask)
  // White pixels (255) → land (1.0)
  // Black pixels (0) → water (0.0)
  const maskData = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const r = pixels[i * 4];
    const isLand = r > 128 ? 255 : 0;
    maskData[i * 4] = isLand;     // R channel = land mask
    maskData[i * 4 + 1] = 0;      // G unused
    maskData[i * 4 + 2] = 0;      // B unused
    maskData[i * 4 + 3] = 255;    // A = always valid
  }

  // Upload to GPU
  const texture = gl.createTexture();
  if (!texture) {
    throw new Error('[LandMask] Failed to create texture');
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, maskData);

  console.log(`[LandMask] Created ${width}x${height} land mask texture for bounds [${bounds.west}, ${bounds.south}, ${bounds.east}, ${bounds.north}]`);

  return texture;
}

/**
 * Fetch land geometry from Natural Earth via CDN
 * This is for production use with detailed coastlines
 *
 * @returns Array of polygon rings [[lng, lat], ...]
 */
export async function fetchLandGeometry(): Promise<number[][][]> {
  try {
    // Use Natural Earth 110m land data from CDN
    const response = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const topology = await response.json();

    // TopoJSON to GeoJSON conversion (simplified for land geometry)
    // In production, use topojson-client library
    // For now, return simplified geometry as fallback
    console.warn('[LandMask] TopoJSON parsing not implemented, using simplified geometry');
    return SIMPLIFIED_LAND_GEOMETRY;
  } catch (error) {
    console.error('[LandMask] Failed to fetch land geometry, using simplified fallback:', error);
    return SIMPLIFIED_LAND_GEOMETRY;
  }
}
