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
  [20,  20,  80, 100],    // Faint deep blue baseline (~0.39 opacity) — calm 0.1-0.3m waves visible
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

// Monochrome particle ramp — light gray/white for compound layers (e.g. wind over heatmap).
// Same pattern as WAVE_PARTICLE_COLORS but neutral gray instead of white, for subtle overlay.
export const MONOCHROME_COLORS: [number, number, number, number][] = [
  [220, 220, 220,   0],    // Calm — fully transparent
  [220, 220, 220,  40],    // Light breeze — barely visible
  [220, 220, 220,  95],    // Moderate — soft gray shimmer
  [225, 225, 225, 150],    // Strong — clear gray streaks
  [230, 230, 230, 195],    // Very strong — bright gray
  [235, 235, 235, 225],    // Gale — near-solid
  [240, 240, 240, 245],    // Storm — almost white
  [245, 245, 245, 255],    // Extreme — solid light gray-white
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

// Air temperature color ramp (-20°C → 50°C) — Windy-style meteorological palette
// Deep blue/purple (arctic) → blue (cold) → cyan (cool) → green (mild) → yellow → orange → red (hot)
export const AIR_TEMPERATURE_COLORS: [number, number, number, number][] = [
  [  0,   0, 120, 210],   // -20°C — Arctic deep blue
  [ 30,  60, 200, 215],   // -10°C — Cold blue
  [ 80, 160, 220, 220],   // 0°C   — Blue-white (freezing)
  [  0, 200, 220, 220],   // 10°C  — Cyan (cool)
  [ 80, 210, 100, 225],   // 20°C  — Green (mild)
  [220, 210,  40, 230],   // 30°C  — Yellow (warm)
  [255, 130,  20, 240],   // 40°C  — Orange (hot)
  [255,  50,  20, 248],   // 50°C  — Bright red (extreme heat)
];

// Precipitation color ramp (0 → 15 mm/h) — standard meteorological radar
// Transparent (dry) → light blue (drizzle) → green → yellow → orange → red → purple (extreme)
export const PRECIPITATION_COLORS: [number, number, number, number][] = [
  [  0,   0,   0,   0],   // 0.0 mm/h  — Fully transparent (dry)
  [  0,   0,   0,   0],   // 0.05 mm/h — Still transparent (trace moisture)
  [120, 180, 255,  80],   // 0.1 mm/h  — Very faint blue (light drizzle)
  [ 80, 210, 255, 140],   // 0.5 mm/h  — Cyan-blue (drizzle)
  [ 50, 200,  50, 180],   // 1.0 mm/h  — Green (moderate rain)
  [255, 255,   0, 210],   // 2.5 mm/h  — Yellow (heavy rain)
  [255, 165,   0, 230],   // 5.0 mm/h  — Orange (very heavy)
  [255,  30,  30, 240],   // 8.0 mm/h  — Red (intense)
  [180,   0, 200, 245],   // 12.0 mm/h — Purple (extreme)
  [255, 255, 255, 255],   // 15.0+ mm/h — White (extreme+)
];

// Pressure color ramp (960 → 1050 hPa) — MapTiler-style isobaric palette
// Deep purple/blue (low pressure, storms) → teal → green → yellow → orange → red (high pressure, fair weather)
export const PRESSURE_COLORS: [number, number, number, number][] = [
  [ 80,  20, 160, 210],   //  960 hPa — Deep purple (extreme low)
  [ 60,  60, 200, 215],   //  975 hPa — Blue-purple (low pressure)
  [ 40, 120, 210, 220],   //  990 hPa — Ocean blue
  [ 30, 180, 200, 225],   // 1000 hPa — Teal
  [ 60, 200, 140, 225],   // 1010 hPa — Teal-green (standard)
  [140, 220,  80, 225],   // 1020 hPa — Yellow-green
  [220, 200,  40, 230],   // 1030 hPa — Yellow
  [255, 140,  30, 235],   // 1040 hPa — Orange
  [230,  50,  30, 240],   // 1050 hPa — Red (extreme high)
];

// Swell particle ramp — teal/aqua palette for swell direction visualization
// Distinct from wind (cyan-yellow-red) and currents (sapphire-teal) to avoid confusion
export const SWELL_PARTICLE_COLORS: [number, number, number, number][] = [
  [  0,   0,   0,   0],    // 0.0m   — fully transparent (no swell)
  [ 80, 180, 230,  50],    // 0.3m   — faint sky blue hint
  [100, 200, 240, 110],    // 0.6m   — light teal-blue
  [120, 220, 220, 165],    // 1.0m   — medium teal
  [140, 235, 200, 200],    // 1.5m   — bright teal-aqua
  [170, 245, 180, 225],    // 2.5m   — vivid aqua-green
  [200, 250, 160, 240],    // 3.5m   — bright yellow-green
  [240, 255, 140, 255],    // 5.0m+  — neon lime (extreme swell)
];

// Dive suitability ramp — green (excellent) → yellow → orange → red (dangerous)
// Computed from wave height, current speed, sea temp — higher value = better diving
export const DIVE_SUITABILITY_COLORS: [number, number, number, number][] = [
  [220,  30,  30, 180],    //   0 — Dangerous: red (high waves, strong currents)
  [255, 100,  30, 195],    //  25 — Poor: orange
  [255, 200,  40, 210],    //  50 — Fair: yellow
  [140, 220,  80, 220],    //  65 — Moderate: yellow-green
  [ 50, 210, 100, 230],    //  80 — Good: green
  [ 30, 190, 180, 235],    //  90 — Very good: teal-green
  [ 40, 170, 220, 240],    // 100 — Excellent: cyan-blue (calm & clear)
];

// Chop index ramp — blue (clean swell) → purple → red (pure wind chop)
// 0 = all swell (clean), 1 = all wind waves (choppy)
export const CHOP_LEVEL_COLORS: [number, number, number, number][] = [
  [ 40, 170, 225, 150],    // 0.0 — Clean swell: calm blue
  [ 80, 140, 230, 170],    // 0.2 — Mostly swell: blue-purple
  [130, 110, 220, 190],    // 0.4 — Mixed: purple
  [180,  80, 200, 205],    // 0.5 — Even mix: magenta-purple
  [220,  60, 150, 215],    // 0.6 — Mostly chop: pink-magenta
  [240,  70,  80, 225],    // 0.8 — Heavy chop: red-pink
  [255,  40,  40, 240],    // 1.0 — Pure wind chop: bright red
];

// Wind gust delta ramp — calm green → warning yellow → danger red
// Represents gusts - sustained (km/h): higher = more gusty = more dangerous
export const GUST_DELTA_COLORS: [number, number, number, number][] = [
  [  0,   0,   0,   0],    //  0 km/h — No gusts, transparent
  [ 60, 200, 120,  80],    //  3 km/h — Light gusts: faint green
  [120, 220,  80, 140],    //  6 km/h — Moderate: green-yellow
  [220, 220,  40, 190],    // 10 km/h — Noticeable: yellow
  [255, 170,  30, 215],    // 15 km/h — Strong: orange
  [255,  80,  30, 235],    // 20 km/h — Very strong: red-orange
  [230,  30,  30, 248],    // 25 km/h — Dangerous: red
  [200,  20, 120, 255],    // 35+ km/h — Extreme: magenta
];

// Cloud cover color ramp (0% → 100%) — satellite-style: transparent → soft white clouds
// Mimics real satellite infrared imagery: clear sky = invisible, clouds = bright white
export const CLOUD_COVER_COLORS: [number, number, number, number][] = [
  [  0,   0,   0,   0],   //   0% — Fully transparent (clear sky)
  [220, 225, 230,  25],   //  10% — Barely visible wisp
  [235, 238, 242,  60],   //  25% — Thin cirrus (few clouds)
  [240, 242, 248,  95],   //  40% — Scattered clouds
  [245, 247, 252, 140],   //  60% — Broken cloud layer
  [248, 250, 255, 185],   //  80% — Mostly overcast
  [252, 253, 255, 220],   //  90% — Heavy overcast
  [255, 255, 255, 245],   // 100% — Full white overcast
];
