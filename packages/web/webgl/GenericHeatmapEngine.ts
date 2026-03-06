/**
 * GenericHeatmapEngine.ts - Configurable MapLibre CustomLayerInterface for heatmaps
 *
 * Unified engine replacing both WaveHeatmapEngine and SeaTemperatureEngine.
 * Supports any scalar data via configurable:
 *   - Color ramp
 *   - Normalization mode (max-value, range, unit)
 *   - Data range (min/max)
 *   - Land masking
 *   - Discard threshold
 *   - Smoothstep fade band (for visual parity with original engines)
 *   - Valid range guard (for out-of-range data rejection)
 *
 * Shaders are imported internally — callers only pass data config.
 */

import type { Map as MaplibreMap, CustomLayerInterface } from 'maplibre-gl';
import { createProgram, createQuadBuffer, saveGLState, restoreGLState } from './GLUtils';
import { createColorRampTexture } from './ColorRamps';
import { createLandMaskTexture } from './LandMask';

// Import shaders (handled by Vite glsl-loader plugin in vite.config.ts)
import vertShader from './shaders/heatmap.vert.glsl';
import fragShaderFloat from './shaders/generic-heatmap.frag.glsl';
import fragShaderUint8 from './shaders/generic-heatmap-uint8.frag.glsl';

export type HeatmapMode = 'float' | 'uint8' | 'disabled';
export type NormalizationMode = 'max-value' | 'range' | 'unit';

export interface HeatmapLayerConfig {
  logPrefix: string;
  colorRamp: [number, number, number, number][];
  normalization: NormalizationMode;
  maxValue?: number;
  minValue?: number;
  opacity?: number;
  useLandMask?: boolean;
  discardBelow?: number;    // Raw value threshold for discard
  fadeRange?: number;       // Smoothstep band in raw units (0 = disabled)
  validRange?: [number, number]; // [min, max] — out-of-range values → alpha=0 (NaN)
}

export interface GenericHeatmapLayer extends CustomLayerInterface {
  updateData: (grid: number[][], minLon: number, maxLon: number, minLat: number, maxLat: number) => void;
  setOpacity: (opacity: number) => void;
  setVisibility: (visible: boolean) => void;
  getMode: () => HeatmapMode;
}

interface GridMetadata {
  width: number;
  height: number;
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

/**
 * Encode grid to Float32 RGBA texture.
 * R = raw value, A = valid flag (1.0 for valid, 0.0 for NaN/invalid/out-of-range)
 */
function encodeGridFloat32(
  grid: number[][],
  validRange?: [number, number]
): Float32Array {
  const height = grid.length;
  const width = grid[0]?.length || 0;
  const data = new Float32Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const v = grid[y][x];

      if (v !== null && v !== undefined && !isNaN(v)) {
        // Apply valid range guard: out-of-range → treated as invalid (alpha=0)
        if (validRange && (v < validRange[0] || v > validRange[1])) {
          // out-of-range: leave as zeros (alpha=0 → shader discards)
          continue;
        }
        data[i] = v;       // R = raw value
        data[i + 1] = 0;   // G unused
        data[i + 2] = 0;   // B unused
        data[i + 3] = 1;   // A = valid flag
      }
      // else: all zeros (alpha=0 → shader discards)
    }
  }

  return data;
}

/**
 * Encode grid to Uint8 RGBA texture with CPU-side normalization.
 */
function encodeGridUint8(
  grid: number[][],
  normalization: NormalizationMode,
  minValue: number,
  maxValue: number,
  validRange?: [number, number]
): Uint8Array {
  const height = grid.length;
  const width = grid[0]?.length || 0;
  const data = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const v = grid[y][x];

      if (v === null || v === undefined || isNaN(v)) {
        // Invalid: A=0
        continue;
      }

      // Apply valid range guard: out-of-range → treated as invalid (alpha=0)
      if (validRange && (v < validRange[0] || v > validRange[1])) {
        continue;
      }

      let normalized: number;
      if (normalization === 'max-value') {
        normalized = Math.max(0, Math.min(1, v / maxValue));
      } else if (normalization === 'range') {
        normalized = Math.max(0, Math.min(1, (v - minValue) / (maxValue - minValue)));
      } else {
        // unit: already 0-1
        normalized = Math.max(0, Math.min(1, v));
      }

      const encoded = Math.round(normalized * 255);
      data[i] = encoded;     // R = normalized
      data[i + 1] = encoded; // G = same for shader compat
      data[i + 2] = 0;       // B unused
      data[i + 3] = 255;     // A = valid
    }
  }

  return data;
}

function normModeToFloat(mode: NormalizationMode): number {
  switch (mode) {
    case 'max-value': return 0.0;
    case 'range': return 1.0;
    case 'unit': return 2.0;
  }
}

/**
 * Create a generic MapLibre CustomLayerInterface for heatmap rendering.
 *
 * Usage examples:
 *   // Wave heatmap (max-value normalization with smoothstep fade)
 *   createGenericHeatmapLayer('wave-heatmap-webgl', {
 *     logPrefix: '[WaveHeatmap]',
 *     colorRamp: WAVE_COLORS,
 *     normalization: 'max-value',
 *     maxValue: 10,
 *     discardBelow: 0.05,
 *     fadeRange: 0.25,
 *     opacity: 0.65,
 *     useLandMask: false,
 *   });
 *
 *   // Sea temperature (range normalization, no smoothstep)
 *   createGenericHeatmapLayer('sea-temperature-webgl', {
 *     logPrefix: '[SeaTemperature]',
 *     colorRamp: TEMPERATURE_COLORS,
 *     normalization: 'range',
 *     minValue: 0,
 *     maxValue: 35,
 *     validRange: [-2, 40],
 *     opacity: 0.6,
 *     useLandMask: true,
 *   });
 */
export function createGenericHeatmapLayer(
  layerId: string,
  config: HeatmapLayerConfig
): GenericHeatmapLayer {
  let map: MaplibreMap;
  let gl: WebGLRenderingContext;
  let program: WebGLProgram | null = null;
  let quadBuffer: WebGLBuffer | null = null;
  let dataTexture: WebGLTexture | null = null;
  let colorRampTexture: WebGLTexture | null = null;
  let landMaskTexture: WebGLTexture | null = null;
  let metadata: GridMetadata | null = null;
  let opacity = config.opacity ?? 0.7;
  let isVisible = true;
  let needsDataUpdate = false;
  let pendingData: { grid: number[][]; minLon: number; maxLon: number; minLat: number; maxLat: number } | null = null;
  let mode: HeatmapMode = 'disabled';

  const useLandMask = config.useLandMask ?? false;
  const minValue = config.minValue ?? 0;
  const maxValue = config.maxValue ?? 1;
  const discardBelow = config.discardBelow ?? 0;
  const fadeRange = config.fadeRange ?? 0;
  const validRange = config.validRange;
  const normMode = config.normalization;
  const prefix = config.logPrefix;

  const layer: GenericHeatmapLayer = {
    id: layerId,
    type: 'custom' as const,
    renderingMode: '2d' as const,

    getMode() { return mode; },

    updateData(grid, minLon, maxLon, minLat, maxLat) {
      pendingData = { grid, minLon, maxLon, minLat, maxLat };
      needsDataUpdate = true;
      if (map) map.triggerRepaint();
    },

    setOpacity(newOpacity: number) {
      opacity = Math.max(0, Math.min(1, newOpacity));
      if (map) map.triggerRepaint();
    },

    setVisibility(visible: boolean) {
      isVisible = visible;
      if (map) map.triggerRepaint();
    },

    onAdd(mapInstance: MaplibreMap, glContext: WebGLRenderingContext) {
      map = mapInstance;
      gl = glContext;

      const floatExt = gl.getExtension('OES_texture_float');
      gl.getExtension('OES_texture_float_linear');

      if (floatExt) {
        mode = 'float';
        console.log(`${prefix} Using Float32 mode`);
      } else {
        mode = 'uint8';
        console.log(`${prefix} Using Uint8 mode`);
      }

      try {
        program = createProgram(
          gl,
          vertShader,
          mode === 'float' ? fragShaderFloat : fragShaderUint8
        );

        quadBuffer = createQuadBuffer(gl);
        colorRampTexture = createColorRampTexture(gl, config.colorRamp);

        // Dummy 1x1 land mask (all sea)
        const dummyData = new Uint8Array([0, 0, 0, 255]);
        landMaskTexture = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, landMaskTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, dummyData);
        gl.bindTexture(gl.TEXTURE_2D, null);

        console.log(`${prefix} Initialized (${mode} mode)`);
      } catch (error) {
        console.error(`${prefix} Initialization failed:`, error);
        mode = 'disabled';
      }
    },

    render(_glContext: WebGLRenderingContext, _args: any) {
      if (!program || !isVisible || mode === 'disabled') return;

      // Process pending data
      if (needsDataUpdate && pendingData) {
        try {
          const height = pendingData.grid.length;
          const width = pendingData.grid[0]?.length || 0;

          if (width === 0 || height === 0) {
            needsDataUpdate = false;
            pendingData = null;
            return;
          }

          if (dataTexture) gl.deleteTexture(dataTexture);

          const texture = gl.createTexture()!;
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

          if (mode === 'float') {
            const floatData = encodeGridFloat32(pendingData.grid, validRange);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.FLOAT, floatData);
          } else {
            const uint8Data = encodeGridUint8(pendingData.grid, normMode, minValue, maxValue, validRange);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, uint8Data);
          }

          dataTexture = texture;
          metadata = {
            width,
            height,
            minLon: pendingData.minLon,
            maxLon: pendingData.maxLon,
            minLat: pendingData.minLat,
            maxLat: pendingData.maxLat,
          };

          // Update land mask if enabled
          if (useLandMask) {
            const bounds = {
              west: pendingData.minLon,
              south: pendingData.minLat,
              east: pendingData.maxLon,
              north: pendingData.maxLat,
            };
            const maskW = Math.min(1024, width * 4);
            const maskH = Math.min(1024, height * 4);

            createLandMaskTexture(gl, bounds, maskW, maskH)
              .then(newMask => {
                const oldMask = landMaskTexture;
                landMaskTexture = newMask;
                if (oldMask && oldMask !== newMask) gl.deleteTexture(oldMask);
                map.triggerRepaint();
              })
              .catch(err => console.error(`${prefix} Land mask error:`, err));
          }

          console.log(`${prefix} Data updated (${mode}): ${width}x${height}`);
        } catch (error) {
          console.error(`${prefix} Failed to encode data:`, error);
        }
        needsDataUpdate = false;
        pendingData = null;
      }

      if (!dataTexture || !metadata) return;

      const saved = saveGLState(gl);

      try {
        const bounds = map.getBounds();

        gl.useProgram(program);

        // Bind data texture to unit 0
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, dataTexture);
        gl.uniform1i(gl.getUniformLocation(program, 'u_data'), 0);

        // Bind color ramp to unit 1
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, colorRampTexture);
        gl.uniform1i(gl.getUniformLocation(program, 'u_color_ramp'), 1);

        // Bind land mask to unit 2
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, landMaskTexture);
        gl.uniform1i(gl.getUniformLocation(program, 'u_land_mask'), 2);

        // Set uniforms
        gl.uniform4f(
          gl.getUniformLocation(program, 'u_data_bbox'),
          metadata.minLon, metadata.minLat, metadata.maxLon, metadata.maxLat
        );
        gl.uniform4f(
          gl.getUniformLocation(program, 'u_view_bbox'),
          bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()
        );
        gl.uniform1f(gl.getUniformLocation(program, 'u_opacity'), opacity);
        gl.uniform1f(gl.getUniformLocation(program, 'u_use_land_mask'), useLandMask ? 1.0 : 0.0);

        // Float32 mode: set normalization uniforms + fade range in raw units
        if (mode === 'float') {
          gl.uniform1f(gl.getUniformLocation(program, 'u_norm_mode'), normModeToFloat(normMode));
          gl.uniform1f(gl.getUniformLocation(program, 'u_min_value'), minValue);
          gl.uniform1f(gl.getUniformLocation(program, 'u_max_value'), maxValue);
          gl.uniform1f(gl.getUniformLocation(program, 'u_discard_below'), discardBelow);
          gl.uniform1f(gl.getUniformLocation(program, 'u_fade_range'), fadeRange);
        } else {
          // Uint8 mode: convert discard + fadeRange from raw → normalized space
          let normalizedDiscard: number;
          let normalizedFadeRange: number;

          if (normMode === 'max-value') {
            normalizedDiscard = discardBelow / maxValue;
            normalizedFadeRange = fadeRange / maxValue;
          } else if (normMode === 'range') {
            const range = maxValue - minValue;
            normalizedDiscard = (discardBelow - minValue) / range;
            normalizedFadeRange = fadeRange / range;
          } else {
            normalizedDiscard = discardBelow;
            normalizedFadeRange = fadeRange;
          }

          gl.uniform1f(gl.getUniformLocation(program, 'u_discard_below'), Math.max(0, normalizedDiscard));
          gl.uniform1f(gl.getUniformLocation(program, 'u_fade_range'), Math.max(0, normalizedFadeRange));
        }

        // Draw fullscreen quad
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.disable(gl.DEPTH_TEST);

        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        const posLoc = gl.getAttribLocation(program, 'a_pos');
        const texLoc = gl.getAttribLocation(program, 'a_texcoord');
        gl.enableVertexAttribArray(posLoc);
        gl.enableVertexAttribArray(texLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
        gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 16, 8);

        gl.drawArrays(gl.TRIANGLES, 0, 6);

        gl.disableVertexAttribArray(posLoc);
        gl.disableVertexAttribArray(texLoc);
      } catch (error) {
        console.error(`${prefix} Render error:`, error);
      }

      restoreGLState(gl, saved);
    },

    onRemove() {
      if (program) gl.deleteProgram(program);
      if (quadBuffer) gl.deleteBuffer(quadBuffer);
      if (dataTexture) gl.deleteTexture(dataTexture);
      if (colorRampTexture) gl.deleteTexture(colorRampTexture);
      if (landMaskTexture) gl.deleteTexture(landMaskTexture);
      mode = 'disabled';
      console.log(`${prefix} Removed`);
    },
  };

  return layer;
}
