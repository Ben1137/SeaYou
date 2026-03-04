/**
 * Color scale utilities for marine weather data visualization
 * Uses chroma-js for smooth color interpolation
 *
 * Note: Requires chroma-js to be installed:
 * npm install chroma-js @types/chroma-js
 */

import chroma from 'chroma-js';

/**
 * Wind speed color scale (0-50 km/h)
 * Progression: Light blue -> Blue -> Green -> Yellow -> Orange -> Red
 */
const WIND_SCALE = chroma
  .scale([
    '#E0F2FE', // 0 km/h - Very light blue (calm)
    '#38BDF8', // 10 km/h - Sky blue (light breeze)
    '#0EA5E9', // 15 km/h - Bright blue (gentle breeze)
    '#06B6D4', // 20 km/h - Cyan (moderate breeze)
    '#10B981', // 25 km/h - Green (fresh breeze)
    '#FDE047', // 30 km/h - Yellow (strong breeze)
    '#FACC15', // 35 km/h - Golden yellow
    '#FB923C', // 40 km/h - Orange (near gale)
    '#F97316', // 45 km/h - Deep orange (gale)
    '#EF4444', // 50+ km/h - Red (strong gale)
  ])
  .domain([0, 10, 15, 20, 25, 30, 35, 40, 45, 50]);

/**
 * Wave height color scale (0-5m)
 * Progression: Light blue -> Medium blue -> Dark blue -> Purple -> Magenta
 */
const WAVE_SCALE = chroma
  .scale([
    '#DBEAFE', // 0m - Very light blue (calm)
    '#93C5FD', // 0.5m - Light blue (smooth)
    '#60A5FA', // 1m - Sky blue (slight)
    '#3B82F6', // 1.5m - Blue (moderate)
    '#2563EB', // 2m - Royal blue
    '#1E40AF', // 2.5m - Deep blue (rough)
    '#1E3A8A', // 3m - Navy blue
    '#6366F1', // 3.5m - Indigo (very rough)
    '#8B5CF6', // 4m - Purple (high)
    '#A855F7', // 4.5m - Violet
    '#C026D3', // 5m+ - Magenta (very high)
  ])
  .domain([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]);

/**
 * Windy-style wave height color scale (0-6m+)
 * Vibrant smooth gradient matching Windy.com aesthetic:
 * - 0.0m - 0.5m: Bright Cyan (calm, more visible)
 * - 0.5m - 1.5m: Electric Blue to Vibrant Purple transition
 * - 1.5m - 2.5m: Purple to Deep Magenta/Hot Pink
 * - 2.5m - 4.0m: Magenta to Bright Pink
 * - 4.0m+: Bright Pink to Yellow (extreme, highly visible)
 */
const WINDY_WAVE_SCALE = chroma
  .scale([
    '#00E5FF', // 0.0m - Bright Cyan (very calm, more visible)
    '#00D4FF', // 0.2m - Bright Cyan
    '#00BFFF', // 0.4m - Deep Sky Blue (calm)
    '#0099FF', // 0.6m - Vivid Blue
    '#0080FF', // 0.8m - Electric Blue
    '#0066FF', // 1.0m - Royal Blue (light)
    '#3366FF', // 1.2m - Bright Blue
    '#6666FF', // 1.4m - Blue-Violet (moderate)
    '#9933FF', // 1.6m - Vivid Purple
    '#BB00FF', // 1.8m - Electric Purple
    '#DD00DD', // 2.0m - Magenta (rough)
    '#EE00AA', // 2.2m - Hot Magenta
    '#FF0088', // 2.4m - Deep Pink (very rough)
    '#FF0066', // 2.6m - Hot Pink
    '#FF3366', // 2.8m - Bright Pink
    '#FF5588', // 3.0m - Light Hot Pink (high)
    '#FF77AA', // 3.5m - Salmon Pink
    '#FF99CC', // 4.0m - Light Pink
    '#FFAADD', // 4.5m - Pastel Pink
    '#FFDDBB', // 5.0m - Peach
    '#FFFFAA', // 6.0m+ - Bright Yellow (extreme, most visible)
  ])
  .domain([0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.2, 2.4, 2.6, 2.8, 3.0, 3.5, 4.0, 4.5, 5.0, 6.0])
  .mode('lch'); // Use LCH color space for more vibrant interpolation

/**
 * Current speed color scale (0-2 m/s)
 * Progression: Light cyan -> Cyan -> Teal -> Green -> Yellow-green -> Yellow
 */
const CURRENT_SCALE = chroma
  .scale([
    '#CFFAFE', // 0 m/s - Very light cyan (slack)
    '#67E8F9', // 0.25 m/s - Light cyan
    '#22D3EE', // 0.5 m/s - Cyan (weak)
    '#06B6D4', // 0.75 m/s - Dark cyan
    '#0891B2', // 1 m/s - Teal (moderate)
    '#14B8A6', // 1.25 m/s - Turquoise
    '#10B981', // 1.5 m/s - Green (strong)
    '#84CC16', // 1.75 m/s - Yellow-green
    '#EAB308', // 2 m/s+ - Yellow (very strong)
  ])
  .domain([0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);

/**
 * Sea surface temperature color scale (10-30°C)
 * Progression: Blue -> Cyan -> Green -> Yellow -> Orange -> Red
 */
const TEMPERATURE_SCALE = chroma
  .scale([
    '#1E3A8A', // 10°C - Navy blue (very cold)
    '#3B82F6', // 12°C - Blue (cold)
    '#06B6D4', // 14°C - Cyan (cool)
    '#14B8A6', // 16°C - Teal
    '#10B981', // 18°C - Green (moderate)
    '#84CC16', // 20°C - Yellow-green
    '#EAB308', // 22°C - Yellow (warm)
    '#F59E0B', // 24°C - Amber
    '#FB923C', // 26°C - Orange (hot)
    '#F97316', // 28°C - Deep orange
    '#EF4444', // 30°C+ - Red (very hot)
  ])
  .domain([10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30]);

/**
 * Get color for wind speed
 * @param speed Wind speed in km/h (0-50+)
 * @returns Hex color string
 */
export function getWindColor(speed: number): string {
  const clampedSpeed = Math.max(0, Math.min(50, speed));
  return WIND_SCALE(clampedSpeed).hex();
}

/**
 * Get color for wave height
 * @param height Wave height in meters (0-5+)
 * @returns Hex color string
 */
export function getWaveColor(height: number): string {
  const clampedHeight = Math.max(0, Math.min(5, height));
  return WAVE_SCALE(clampedHeight).hex();
}

/**
 * Get Windy-style color for wave height (continuous smooth gradient)
 * Optimized for smooth heatmap visualization
 * @param height Wave height in meters (0-6+)
 * @returns Hex color string
 */
export function getWindyWaveColor(height: number): string {
  const clampedHeight = Math.max(0, Math.min(6, height));
  return WINDY_WAVE_SCALE(clampedHeight).hex();
}

/**
 * Get Windy-style RGBA color for wave height
 * Returns an array [r, g, b, a] for direct canvas manipulation
 * @param height Wave height in meters (0-6+)
 * @param alpha Optional alpha value (0-255), defaults to 255
 * @returns Array of [r, g, b, a] values
 */
export function getWindyWaveRGBA(height: number, alpha: number = 255): [number, number, number, number] {
  const clampedHeight = Math.max(0, Math.min(6, height));
  const color = WINDY_WAVE_SCALE(clampedHeight);
  const [r, g, b] = color.rgb();
  return [Math.round(r), Math.round(g), Math.round(b), alpha];
}

/**
 * Get color for current speed
 * @param speed Current speed in m/s (0-2+)
 * @returns Hex color string
 */
export function getCurrentColor(speed: number): string {
  const clampedSpeed = Math.max(0, Math.min(2, speed));
  return CURRENT_SCALE(clampedSpeed).hex();
}

/**
 * Get color for sea surface temperature
 * @param temp Temperature in Celsius (10-30+)
 * @returns Hex color string
 */
export function getTemperatureColor(temp: number): string {
  const clampedTemp = Math.max(10, Math.min(30, temp));
  return TEMPERATURE_SCALE(clampedTemp).hex();
}

/**
 * Color scale configuration type
 */
export interface ColorScalePoint {
  value: number;
  color: string;
  label: string;
}

/**
 * Generate a complete color scale with labels for visualization
 * @param type Type of scale to generate
 * @returns Array of color scale points with values, colors, and labels
 */
export function generateColorScale(
  type: 'wind' | 'wave' | 'current' | 'temp'
): ColorScalePoint[] {
  switch (type) {
    case 'wind':
      return [
        { value: 0, color: getWindColor(0), label: '0 km/h' },
        { value: 5, color: getWindColor(5), label: '5' },
        { value: 10, color: getWindColor(10), label: '10' },
        { value: 15, color: getWindColor(15), label: '15' },
        { value: 20, color: getWindColor(20), label: '20' },
        { value: 25, color: getWindColor(25), label: '25' },
        { value: 30, color: getWindColor(30), label: '30' },
        { value: 35, color: getWindColor(35), label: '35' },
        { value: 40, color: getWindColor(40), label: '40' },
        { value: 45, color: getWindColor(45), label: '45' },
        { value: 50, color: getWindColor(50), label: '50+' },
      ];

    case 'wave':
      return [
        { value: 0, color: getWaveColor(0), label: '0m' },
        { value: 0.5, color: getWaveColor(0.5), label: '0.5' },
        { value: 1, color: getWaveColor(1), label: '1' },
        { value: 1.5, color: getWaveColor(1.5), label: '1.5' },
        { value: 2, color: getWaveColor(2), label: '2' },
        { value: 2.5, color: getWaveColor(2.5), label: '2.5' },
        { value: 3, color: getWaveColor(3), label: '3' },
        { value: 3.5, color: getWaveColor(3.5), label: '3.5' },
        { value: 4, color: getWaveColor(4), label: '4' },
        { value: 4.5, color: getWaveColor(4.5), label: '4.5' },
        { value: 5, color: getWaveColor(5), label: '5+' },
      ];

    case 'current':
      return [
        { value: 0, color: getCurrentColor(0), label: '0 m/s' },
        { value: 0.25, color: getCurrentColor(0.25), label: '0.25' },
        { value: 0.5, color: getCurrentColor(0.5), label: '0.5' },
        { value: 0.75, color: getCurrentColor(0.75), label: '0.75' },
        { value: 1, color: getCurrentColor(1), label: '1' },
        { value: 1.25, color: getCurrentColor(1.25), label: '1.25' },
        { value: 1.5, color: getCurrentColor(1.5), label: '1.5' },
        { value: 1.75, color: getCurrentColor(1.75), label: '1.75' },
        { value: 2, color: getCurrentColor(2), label: '2+' },
      ];

    case 'temp':
      return [
        { value: 10, color: getTemperatureColor(10), label: '10°C' },
        { value: 12, color: getTemperatureColor(12), label: '12' },
        { value: 14, color: getTemperatureColor(14), label: '14' },
        { value: 16, color: getTemperatureColor(16), label: '16' },
        { value: 18, color: getTemperatureColor(18), label: '18' },
        { value: 20, color: getTemperatureColor(20), label: '20' },
        { value: 22, color: getTemperatureColor(22), label: '22' },
        { value: 24, color: getTemperatureColor(24), label: '24' },
        { value: 26, color: getTemperatureColor(26), label: '26' },
        { value: 28, color: getTemperatureColor(28), label: '28' },
        { value: 30, color: getTemperatureColor(30), label: '30+' },
      ];

    default:
      throw new Error(`Unknown scale type: ${type}`);
  }
}

/**
 * Generate Windy-style wave color scale for legend
 * Simplified to 6 key values for better readability
 */
function generateWindyWaveColorScale(): ColorScalePoint[] {
  return [
    { value: 0, color: getWindyWaveColor(0), label: '0m' },
    { value: 1, color: getWindyWaveColor(1), label: '1' },
    { value: 2, color: getWindyWaveColor(2), label: '2' },
    { value: 3, color: getWindyWaveColor(3), label: '3' },
    { value: 4, color: getWindyWaveColor(4), label: '4' },
    { value: 5, color: getWindyWaveColor(5), label: '5+' },
  ];
}

/**
 * Bathymetry depth color scale
 * Progression: Light blue (shallow) -> Dark blue (deep)
 */
function generateBathymetryColorScale(): ColorScalePoint[] {
  return [
    { value: 0, color: '#e6f2ff', label: '0m' },
    { value: 200, color: '#cce5ff', label: '200m' },
    { value: 1000, color: '#99ccff', label: '1000m' },
    { value: 2000, color: '#6699cc', label: '2000m' },
    { value: 3000, color: '#4d88b8', label: '3000m' },
    { value: 4000, color: '#336699', label: '4000m' },
    { value: 6000, color: '#1a4d80', label: '6000m+' },
  ];
}

/**
 * Marine Areas color scale (single color indicator)
 */
function generateMarineAreasColorScale(): ColorScalePoint[] {
  return [
    { value: 1, color: '#6ba3e0', label: 'Marine Area' },
  ];
}

/**
 * Wind particle color scale matching the WIND_COLORS WebGL ramp exactly.
 * ColorRamps.ts WIND_COLORS:
 *   0 m/s  → transparent
 *   1 m/s  → pale icy blue  (≈ 4 kt / 7 km/h)
 *   4 m/s  → vivid cyan     (≈ 8 kt / 14 km/h)
 *   6 m/s  → cyan-green     (≈ 12 kt / 22 km/h)
 *   8 m/s  → aqua-green     (≈ 16 kt / 29 km/h)
 *  10 m/s  → neon yellow    (≈ 19 kt / 36 km/h)
 *  12 m/s  → golden yellow  (≈ 23 kt / 43 km/h)
 *  15 m/s  → vivid orange   (≈ 29 kt / 54 km/h)
 *  18 m/s  → bright red     (≈ 35 kt / 65 km/h)
 *  22+ m/s → hot magenta    (≈ 43+ kt / 79+ km/h)
 * Labels use km/h for consistency with the existing wind UI.
 * Note: the GPGPU encoder normalises by maxSpeed found in the viewport,
 * so these absolute values are representative, not exact.
 */
function generateWindParticlesColorScale(): ColorScalePoint[] {
  return [
    { value: 0,   color: 'rgba(0,0,0,0)',       label: '0 km/h' }, // calm — transparent
    { value: 10,  color: 'rgb(170,230,255)',     label: '10'     }, // ≈1 m/s  pale icy blue
    { value: 25,  color: 'rgb(100,215,255)',     label: '25'     }, // ≈2.5 m/s bright ice blue
    { value: 40,  color: 'rgb(40,195,240)',      label: '40'     }, // ≈4 m/s  vivid cyan
    { value: 55,  color: 'rgb(40,210,170)',      label: '55'     }, // ≈6 m/s  cyan-green
    { value: 70,  color: 'rgb(60,225,100)',      label: '70'     }, // ≈8 m/s  aqua-green
    { value: 90,  color: 'rgb(170,245,45)',      label: '90'     }, // ≈10 m/s neon yellow-green
    { value: 110, color: 'rgb(255,140,0)',       label: '110'    }, // ≈15 m/s vivid orange
    { value: 130, color: 'rgb(255,40,40)',       label: '130'    }, // ≈18 m/s bright red
    { value: 160, color: 'rgb(230,0,120)',       label: '160+'   }, // ≈22+ m/s hot magenta
  ];
}

/**
 * Wave heatmap color scale matching the WAVE_COLORS WebGL ramp exactly.
 * ColorRamps.ts WAVE_COLORS (deep blue → purple → fuchsia → pink → white):
 *   0m   → transparent deep blue
 *   0.5m → deep purple
 *   1.5m → Purple-600 (#9333EA)
 *   2m   → Purple-500 (#A855F7)
 *   3m   → Purple-400 (#C084FC)
 *   4m   → Fuchsia-400 (#E879F9)
 *   5m   → Fuchsia-300 (#F0ABFC)
 *   5.5m → Pink-200 (#FBCFE8)
 *   6m+  → white
 */
function generateWaveHeatmapColorScale(): ColorScalePoint[] {
  return [
    { value: 0,   color: 'rgba(20,20,80,0)',     label: '0 m'   }, // transparent (calm)
    { value: 0.5, color: 'rgb(60,30,140)',        label: '0.5'   }, // deep purple
    { value: 1,   color: 'rgb(147,51,234)',       label: '1'     }, // purple-600
    { value: 1.5, color: 'rgb(168,85,247)',       label: '1.5'   }, // purple-500
    { value: 2.5, color: 'rgb(192,132,252)',      label: '2.5'   }, // purple-400
    { value: 3.5, color: 'rgb(232,121,249)',      label: '3.5'   }, // fuchsia-400
    { value: 4.5, color: 'rgb(240,171,252)',      label: '4.5'   }, // fuchsia-300
    { value: 5.5, color: 'rgb(251,207,232)',      label: '5.5'   }, // pink-200
    { value: 6,   color: 'rgb(255,255,255)',      label: '6+ m'  }, // white (extreme)
  ];
}

/**
 * Sea temperature color scale matching the TEMPERATURE_COLORS WebGL ramp, 0–35 °C.
 * ColorRamps.ts TEMPERATURE_COLORS:
 *   cold  → deep blue [20,30,100] → Blue-500 → Cyan-400
 *   warm  → Green-400 → Yellow-400 → Orange-400
 *   hot   → Red-500 → Red-600 → White (extreme)
 */
function generateSeaTemperatureColorScale(): ColorScalePoint[] {
  return [
    { value: 0,  color: 'rgb(20,30,100)',        label: '0°C'  }, // deep blue (freezing)
    { value: 5,  color: 'rgb(30,60,150)',         label: '5'    }, // dark blue (very cold)
    { value: 10, color: 'rgb(59,130,246)',        label: '10'   }, // Blue-500
    { value: 15, color: 'rgb(34,211,238)',        label: '15'   }, // Cyan-400
    { value: 20, color: 'rgb(74,222,128)',        label: '20'   }, // Green-400
    { value: 25, color: 'rgb(250,204,21)',        label: '25'   }, // Yellow-400
    { value: 30, color: 'rgb(251,146,60)',        label: '30'   }, // Orange-400
    { value: 35, color: 'rgb(239,68,68)',         label: '35+'  }, // Red-500 (very hot)
  ];
}

/**
 * Current particle color scale matching the CURRENT_COLORS WebGL ramp exactly.
 * Deep sapphire blue → ocean blue → teal → near-white cyan glow (0 – 3+ m/s).
 * Note: the GPGPU encoder normalises by maxSpeed, so labels are representative.
 */
function generateCurrentParticlesColorScale(): ColorScalePoint[] {
  return [
    { value: 0.0, color: 'rgba(0,0,0,0)',    label: '0 m/s' },  // transparent (still)
    { value: 0.2, color: '#0064C8',           label: '0.2'   },  // deep sapphire
    { value: 0.5, color: '#00A0DC',           label: '0.5'   },  // ocean blue
    { value: 0.8, color: '#14E1C8',           label: '0.8'   },  // vivid teal
    { value: 1.0, color: '#3CF0D7',           label: '1.0'   },  // bright teal
    { value: 1.5, color: '#78FAEB',           label: '1.5'   },  // light teal
    { value: 2.0, color: '#BEFFFE',           label: '2.0'   },  // near-white cyan
    { value: 3.0, color: '#E6FFFF',           label: '3.0+'  },  // white-cyan glow
  ];
}

/**
 * Get all color scales for reference/legend display.
 *
 * Naming convention:
 *   *.wind / *.wave / *.current / *.temp  — chroma-js marker/icon scales
 *   *.windParticles   — matches WIND_COLORS WebGL ramp  (GPGPU wind layer legend)
 *   *.currentParticles — matches CURRENT_COLORS WebGL ramp (GPGPU current layer legend)
 *   *.waveHeatmap     — matches WAVE_COLORS WebGL ramp   (wave heatmap + particles legend)
 *   *.seaTemperature  — matches TEMPERATURE_COLORS WebGL ramp (sea temp layer legend)
 *   *.windyWave       — legacy Windy-style scale (kept for backwards compatibility)
 */
export const COLOR_SCALES = {
  // Marker / icon scales (chroma-js, approximate)
  wind: generateColorScale('wind'),
  wave: generateColorScale('wave'),
  windyWave: generateWindyWaveColorScale(),
  current: generateColorScale('current'),
  temp: generateColorScale('temp'),
  // WebGL layer legends — colours match the actual shader ramps
  windParticles: generateWindParticlesColorScale(),
  currentParticles: generateCurrentParticlesColorScale(),
  waveHeatmap: generateWaveHeatmapColorScale(),
  seaTemperature: generateSeaTemperatureColorScale(),
  // Other
  bathymetry: generateBathymetryColorScale(),
  marineAreas: generateMarineAreasColorScale(),
} as const;

/**
 * Export scale instances for advanced usage
 */
export const SCALES = {
  wind: WIND_SCALE,
  wave: WAVE_SCALE,
  windyWave: WINDY_WAVE_SCALE,
  current: CURRENT_SCALE,
  temperature: TEMPERATURE_SCALE,
} as const;
