/**
 * ColorRamps.ts - Windy-Style Color Gradients as WebGL Textures
 * Creates 1D color ramp textures for fragment shader lookup
 */

/**
 * Create a 1D color ramp texture (256x1 RGBA) from an array of color stops.
 * Used by fragment shaders to look up color based on normalized data value.
 */
export function createColorRampTexture(
  gl: WebGLRenderingContext,
  colors: [number, number, number, number][] // Array of [r, g, b, a] in 0-255
): WebGLTexture {
  const width = 256;
  const data = new Uint8Array(width * 4);

  for (let i = 0; i < width; i++) {
    const t = i / (width - 1); // 0 to 1
    const colorIndex = t * (colors.length - 1);
    const lower = Math.floor(colorIndex);
    const upper = Math.min(lower + 1, colors.length - 1);
    const frac = colorIndex - lower;

    // Linear interpolation between adjacent color stops
    data[i * 4 + 0] = Math.round(colors[lower][0] * (1 - frac) + colors[upper][0] * frac);
    data[i * 4 + 1] = Math.round(colors[lower][1] * (1 - frac) + colors[upper][1] * frac);
    data[i * 4 + 2] = Math.round(colors[lower][2] * (1 - frac) + colors[upper][2] * frac);
    data[i * 4 + 3] = Math.round(colors[lower][3] * (1 - frac) + colors[upper][3] * frac);
  }

  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return texture;
}

// Windy-style wave height color ramp (purple → fuchsia → pink)
export const WAVE_COLORS: [number, number, number, number][] = [
  [20,  20,  80,  0],     // Transparent deep blue (near zero)
  [60,  30, 140, 140],    // Deep purple
  [147, 51, 234, 200],    // Purple-600
  [168, 85, 247, 210],    // Purple-500
  [192, 132, 252, 220],   // Purple-400
  [232, 121, 249, 230],   // Fuchsia-400
  [240, 171, 252, 240],   // Fuchsia-300
  [251, 207, 232, 250],   // Pink-200
  [255, 255, 255, 255],   // White (extreme values)
];

// Windy.com-style wind speed color ramp — matches original Windy/earth.nullschool.net visual:
// calm (transparent) → light breeze (pale icy blue) → moderate (vivid cyan/green) → strong (neon yellow/orange) → storm (hot red/magenta)
// Enhanced for maximum visual impact on dark map backgrounds
export const WIND_COLORS: [number, number, number, number][] = [
  [  0,   0,   0,   0],    //  0.0 m/s  - Fully transparent (calm, invisible)
  [170, 230, 255,  60],    //  1.0 m/s  - Very pale icy blue (hint of breeze)
  [100, 215, 255, 130],    //  2.5 m/s  - Bright ice blue
  [ 40, 195, 240, 185],    //  4.0 m/s  - Vivid cyan
  [ 40, 210, 170, 210],    //  6.0 m/s  - Cyan-green transition
  [ 60, 225, 100, 228],    //  8.0 m/s  - Vivid aqua-green (Windy signature)
  [170, 245,  45, 238],    // 10.0 m/s  - Neon yellow-green
  [255, 215,   0, 246],    // 12.0 m/s  - Pure golden yellow
  [255, 140,   0, 251],    // 15.0 m/s  - Vivid orange
  [255,  40,  40, 254],    // 18.0 m/s  - Bright red
  [230,   0, 120, 255],    // 22.0+ m/s - Hot magenta/crimson (storm)
];

// Ocean current color ramp — teal/cyan palette matching Windy's ocean current style:
// still (transparent) → slow drift (sapphire blue) → moderate (vivid teal) → strong (cyan-white glow)
// Uses a cool blue-to-cyan palette distinct from wind, maximizing contrast when both layers are visible
export const CURRENT_COLORS: [number, number, number, number][] = [
  [  0,   0,   0,   0],    // 0.00 m/s - Fully transparent
  [  0, 100, 200,  55],    // 0.05 m/s - Deep sapphire blue (barely moving)
  [  0, 160, 220,  120],   // 0.15 m/s - Ocean blue
  [ 10, 195, 210, 175],    // 0.30 m/s - Cyan-blue
  [ 20, 225, 200, 210],    // 0.50 m/s - Vivid teal
  [ 60, 240, 215, 230],    // 0.75 m/s - Bright teal
  [120, 250, 235, 245],    // 1.00 m/s - Light teal approaching white
  [190, 255, 250, 252],    // 1.30 m/s - Near-white cyan
  [230, 255, 255, 255],    // 1.60+ m/s - Pure white-cyan glow (strong current)
];

// Wave particle whitecap ramp — designed to contrast against the blue/purple wave heatmap.
// When rendered ON TOP of WaveHeatmapLayerML these particles look like whitecaps / foam:
// flat-calm = invisible  →  moderate swell = translucent white foam  →  heavy swell = solid white.
// All stops are pure white [255,255,255] varying only in alpha so they read clearly over any heatmap color.
export const WAVE_PARTICLE_COLORS: [number, number, number, number][] = [
  [255, 255, 255,   0],    // 0.0m   — fully transparent (flat calm, no particles visible)
  [255, 255, 255,  35],    // 0.4m   — barely-there foam hint
  [255, 255, 255,  90],    // 0.8m   — light sea-foam shimmer
  [255, 255, 255, 145],    // 1.5m   — moderate whitecaps
  [255, 255, 255, 190],    // 2.5m   — strong whitecaps
  [255, 255, 255, 220],    // 3.5m   — heavy breaking foam
  [255, 255, 255, 242],    // 4.5m   — near-solid white spray
  [255, 255, 255, 255],    // 5.5m+  — pure solid white (storm swell)
];

// Sea temperature color ramp (cold blue → warm red)
export const TEMPERATURE_COLORS: [number, number, number, number][] = [
  [20,  30, 100, 200],    // Cold deep blue
  [59, 130, 246, 210],    // Blue-500
  [34, 211, 238, 220],    // Cyan-400
  [74, 222, 128, 225],    // Green-400
  [250, 204,  21, 230],   // Yellow-400
  [251, 146,  60, 235],   // Orange-400
  [239,  68,  68, 240],   // Red-500
  [220,  38,  38, 245],   // Red-600
  [255, 255, 255, 255],   // White (extreme)
];
