/**
 * DataEncoder.ts - Open-Meteo Data → GPU Textures
 * Encodes grid data for WebGL shaders
 */

export interface GridMetadata {
  width: number;    // Number of columns in the grid
  height: number;   // Number of rows in the grid
  minLon: number;   // Western boundary (degrees)
  maxLon: number;   // Eastern boundary (degrees)
  minLat: number;   // Southern boundary (degrees)
  maxLat: number;   // Northern boundary (degrees)
  minValue: number; // Minimum data value (for normalization)
  maxValue: number; // Maximum data value (for normalization)
}

/**
 * Encode a 2D grid of scalar values (like wave height) into a Float32 RGBA texture.
 * Value is stored in R channel. G channel stores normalized 0-1 value.
 *
 * @param grid - 2D array [row][col] of values (row 0 = southernmost)
 * @returns { data, metadata } for uploading to WebGL
 */
export function encodeScalarGrid(
  grid: number[][],
  minLon: number,
  maxLon: number,
  minLat: number,
  maxLat: number
): { data: Float32Array; metadata: GridMetadata } {
  const height = grid.length;
  const width = grid[0]?.length || 0;

  if (width === 0 || height === 0) {
    return {
      data: new Float32Array(0),
      metadata: { width: 0, height: 0, minLon, maxLon, minLat, maxLat, minValue: 0, maxValue: 0 },
    };
  }

  let minValue = Infinity;
  let maxValue = -Infinity;

  // Find range for normalization
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = grid[y][x];
      if (v !== null && v !== undefined && !isNaN(v)) {
        minValue = Math.min(minValue, v);
        maxValue = Math.max(maxValue, v);
      }
    }
  }

  // Handle edge case where all values are the same or no valid values
  if (!isFinite(minValue)) minValue = 0;
  if (!isFinite(maxValue)) maxValue = 1;

  const data = new Float32Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const v = grid[y][x];

      if (v !== null && v !== undefined && !isNaN(v)) {
        // Store raw value in R channel
        data[i] = v;
        // Store normalized value in G channel (0-1 range, useful for color ramp lookup)
        data[i + 1] = maxValue > minValue ? (v - minValue) / (maxValue - minValue) : 0;
        // B channel unused
        data[i + 2] = 0;
        // A channel = 1 for valid data
        data[i + 3] = 1;
      } else {
        // No data - mark with alpha = 0
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 0;
      }
    }
  }

  return {
    data,
    metadata: { width, height, minLon, maxLon, minLat, maxLat, minValue, maxValue },
  };
}

/**
 * Encode a 2D grid of U/V velocity components into a Float32 RGBA texture.
 * R = U component (east-west velocity)
 * G = V component (north-south velocity)
 * B = Speed magnitude (precomputed)
 * A = 1.0 (valid data flag)
 *
 * @param uGrid - 2D array of U (east-west) velocity
 * @param vGrid - 2D array of V (north-south) velocity
 */
export function encodeVelocityGrid(
  uGrid: number[][],
  vGrid: number[][],
  minLon: number,
  maxLon: number,
  minLat: number,
  maxLat: number
): { data: Float32Array; metadata: GridMetadata & { maxSpeed: number } } {
  const height = uGrid.length;
  const width = uGrid[0]?.length || 0;

  if (width === 0 || height === 0) {
    return {
      data: new Float32Array(0),
      metadata: { width: 0, height: 0, minLon, maxLon, minLat, maxLat, minValue: 0, maxValue: 0, maxSpeed: 0 },
    };
  }

  let maxSpeed = 0;

  const data = new Float32Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const u = uGrid[y]?.[x] ?? 0;
      const v = vGrid[y]?.[x] ?? 0;

      // Check for invalid data
      if (isNaN(u) || isNaN(v)) {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 0; // Invalid flag
        continue;
      }

      const speed = Math.sqrt(u * u + v * v);

      data[i] = u;         // R = U velocity
      data[i + 1] = v;     // G = V velocity
      data[i + 2] = speed; // B = speed magnitude
      data[i + 3] = 1.0;   // A = valid data flag

      maxSpeed = Math.max(maxSpeed, speed);
    }
  }

  return {
    data,
    metadata: {
      width, height, minLon, maxLon, minLat, maxLat,
      minValue: 0, maxValue: maxSpeed, maxSpeed,
    },
  };
}

/**
 * Convert Open-Meteo hourly data array to 2D grid
 * Assumes data is in row-major order (lat varies faster than lon)
 */
export function arrayToGrid(
  data: number[],
  width: number,
  height: number
): number[][] {
  const grid: number[][] = [];
  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      row.push(data[y * width + x] ?? 0);
    }
    grid.push(row);
  }
  return grid;
}

/**
 * Encode a 2D grid of U/V velocity components into a Uint8 RGBA texture.
 * Used for devices without OES_texture_float support.
 *
 * Encoding scheme (simple normalized):
 * R = normalized U: (u + maxSpeed) / (2 * maxSpeed) * 255
 * G = normalized V: (v + maxSpeed) / (2 * maxSpeed) * 255
 * B = normalized speed: speed / maxSpeed * 255
 * A = 255 (valid data flag)
 *
 * @param uGrid - 2D array of U (east-west) velocity
 * @param vGrid - 2D array of V (north-south) velocity
 */
export function encodeVelocityGridUint8(
  uGrid: number[][],
  vGrid: number[][],
  minLon: number,
  maxLon: number,
  minLat: number,
  maxLat: number
): { data: Uint8Array; metadata: GridMetadata & { maxSpeed: number } } {
  const height = uGrid.length;
  const width = uGrid[0]?.length || 0;

  if (width === 0 || height === 0) {
    return {
      data: new Uint8Array(0),
      metadata: { width: 0, height: 0, minLon, maxLon, minLat, maxLat, minValue: 0, maxValue: 0, maxSpeed: 0 },
    };
  }

  // First pass: find max speed for normalization
  let maxSpeed = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = uGrid[y]?.[x] ?? 0;
      const v = vGrid[y]?.[x] ?? 0;
      if (!isNaN(u) && !isNaN(v)) {
        const speed = Math.sqrt(u * u + v * v);
        maxSpeed = Math.max(maxSpeed, speed);
      }
    }
  }

  // Ensure we have a reasonable max speed for normalization
  if (maxSpeed < 1) maxSpeed = 1;

  const data = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const u = uGrid[y]?.[x] ?? 0;
      const v = vGrid[y]?.[x] ?? 0;

      // Check for invalid data
      if (isNaN(u) || isNaN(v)) {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 0; // Invalid flag
        continue;
      }

      const speed = Math.sqrt(u * u + v * v);

      // Normalize U and V to 0-255 range (centered at 128 for zero)
      // u in [-maxSpeed, maxSpeed] -> [0, 255]
      data[i] = Math.round(((u / maxSpeed) * 0.5 + 0.5) * 255);     // R = normalized U
      data[i + 1] = Math.round(((v / maxSpeed) * 0.5 + 0.5) * 255); // G = normalized V
      data[i + 2] = Math.round((speed / maxSpeed) * 255);           // B = normalized speed
      data[i + 3] = 255;                                             // A = valid data flag
    }
  }

  return {
    data,
    metadata: {
      width, height, minLon, maxLon, minLat, maxLat,
      minValue: 0, maxValue: maxSpeed, maxSpeed,
    },
  };
}
