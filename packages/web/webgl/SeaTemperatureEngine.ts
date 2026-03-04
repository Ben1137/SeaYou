/**
 * SeaTemperatureEngine.ts — Custom WebGL Layer for Sea Surface Temperature
 * Phase 5: Sea temperature overlay with Windy-style color ramp
 * Supports fallback to Uint8 textures when OES_texture_float is unavailable
 */

import type maplibregl from 'maplibre-gl';
import {
  createProgram,
  createQuadBuffer,
  saveGLState,
  restoreGLState,
  type GLState,
} from './GLUtils';
import { createColorRampTexture, TEMPERATURE_COLORS } from './ColorRamps';
import { createLandMaskTexture } from './LandMask';
import heatmapVert from './shaders/heatmap.vert.glsl';
import temperatureFrag from './shaders/temperature.frag.glsl';
import temperatureFragUint8 from './shaders/temperature-uint8.frag.glsl';

export type TemperatureMode = 'float' | 'uint8' | 'disabled';

export interface SeaTemperatureConfig {
  opacity?: number;
  minTemp?: number;  // Minimum temperature for color scale (default: 10°C)
  maxTemp?: number;  // Maximum temperature for color scale (default: 30°C)
  useLandMask?: boolean; // Enable land masking to prevent overlay on land
}

export interface SeaTemperatureLayer extends maplibregl.CustomLayerInterface {
  updateData: (
    grid: number[][],
    minLon: number,
    maxLon: number,
    minLat: number,
    maxLat: number
  ) => void;
  setOpacity: (opacity: number) => void;
  setVisibility: (visible: boolean) => void;
  getMode: () => TemperatureMode;
}

interface GridMetadata {
  width: number;
  height: number;
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
  minValue: number;
  maxValue: number;
}

/**
 * Encode a 2D grid of temperature values into a Float32 RGBA texture.
 */
function encodeTemperatureGrid(
  grid: number[][],
  minLon: number,
  maxLon: number,
  minLat: number,
  maxLat: number
): { data: Float32Array; metadata: GridMetadata } {
  const height = grid.length;
  const width = grid[0].length;

  let minValue = Infinity;
  let maxValue = -Infinity;

  // Find range
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = grid[y][x];
      if (v !== null && v !== undefined && !isNaN(v) && v > -10 && v < 50) {
        minValue = Math.min(minValue, v);
        maxValue = Math.max(maxValue, v);
      }
    }
  }

  const data = new Float32Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const v = grid[y][x];

      if (v !== null && v !== undefined && !isNaN(v) && v > -10 && v < 50) {
        data[i] = v;     // R = raw temperature
        data[i + 1] = 0; // G unused
        data[i + 2] = 0; // B unused
        data[i + 3] = 1; // A = valid flag
      }
    }
  }

  return {
    data,
    metadata: { width, height, minLon, maxLon, minLat, maxLat, minValue, maxValue },
  };
}

/**
 * Encode a 2D grid of temperature values into a Uint8 RGBA texture.
 * For devices without OES_texture_float support.
 */
function encodeTemperatureGridUint8(
  grid: number[][],
  minTemp: number,
  maxTemp: number
): Uint8Array {
  const height = grid.length;
  const width = grid[0]?.length || 0;
  const data = new Uint8Array(width * height * 4);
  const tempRange = maxTemp - minTemp;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const v = grid[y][x];

      if (v !== null && v !== undefined && !isNaN(v) && v > -10 && v < 50) {
        // Normalize temperature to 0-1 range based on min/max temp
        const normalized = Math.max(0, Math.min(1, (v - minTemp) / tempRange));
        const encoded = Math.round(normalized * 255);

        data[i] = encoded;     // R = normalized temperature
        data[i + 1] = encoded; // G = same for compatibility
        data[i + 2] = 0;       // B unused
        data[i + 3] = 255;     // A = valid flag
      } else {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 0;       // Invalid data
      }
    }
  }

  return data;
}

/**
 * Create temperature texture (Float32 or Uint8)
 */
function createTemperatureTexture(
  gl: WebGLRenderingContext,
  data: Float32Array | Uint8Array,
  width: number,
  height: number,
  isFloat: boolean
): WebGLTexture {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  if (isFloat) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.FLOAT, data as Float32Array);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data as Uint8Array);
  }

  return texture;
}

/**
 * Creates a MapLibre CustomLayerInterface for rendering sea temperature via WebGL.
 */
export function createSeaTemperatureLayer(
  layerId: string,
  config: SeaTemperatureConfig = {}
): SeaTemperatureLayer {
  let map: maplibregl.Map;
  let gl: WebGLRenderingContext;
  let program: WebGLProgram | null = null;
  let quadBuffer: WebGLBuffer | null = null;
  let dataTexture: WebGLTexture | null = null;
  let colorRampTexture: WebGLTexture | null = null;
  let landMaskTexture: WebGLTexture | null = null;
  let metadata: GridMetadata | null = null;
  let opacity = config.opacity ?? 0.7;
  let minTemp = config.minTemp ?? 10;
  let maxTemp = config.maxTemp ?? 30;
  let useLandMask = config.useLandMask ?? false;
  let isVisible = true;
  let needsDataUpdate = false;
  let pendingData: { grid: number[][]; minLon: number; maxLon: number; minLat: number; maxLat: number } | null = null;
  let mode: TemperatureMode = 'disabled';

  const layer: SeaTemperatureLayer = {
    id: layerId,
    type: 'custom' as const,
    renderingMode: '2d' as const,

    getMode() {
      return mode;
    },

    updateData(grid, minLon, maxLon, minLat, maxLat) {
      pendingData = { grid, minLon, maxLon, minLat, maxLat };
      needsDataUpdate = true;
      if (map) map.triggerRepaint();
    },

    setOpacity(newOpacity: number) {
      opacity = newOpacity;
      if (map) map.triggerRepaint();
    },

    setVisibility(visible: boolean) {
      isVisible = visible;
      if (map) map.triggerRepaint();
    },

    onAdd(mapInstance, glContext) {
      map = mapInstance;
      gl = glContext;

      try {
        // Check float texture support
        const floatExt = gl.getExtension('OES_texture_float');
        gl.getExtension('OES_texture_float_linear');

        // Determine mode
        if (floatExt) {
          mode = 'float';
          console.log('[SeaTemperatureEngine] Using Float32 mode');
        } else {
          mode = 'uint8';
          console.log('[SeaTemperatureEngine] OES_texture_float not supported, using Uint8 mode');
        }

        // Create shader program based on mode
        if (mode === 'float') {
          program = createProgram(gl, heatmapVert, temperatureFrag);
        } else {
          program = createProgram(gl, heatmapVert, temperatureFragUint8);
        }

        // Create fullscreen quad
        quadBuffer = createQuadBuffer(gl);

        // Create color ramp texture
        colorRampTexture = createColorRampTexture(gl, TEMPERATURE_COLORS);

        // Create dummy land mask texture (will be updated with first data)
        const dummyLandData = new Uint8Array([0, 0, 0, 255]); // R=0 (water), A=255 (valid)
        landMaskTexture = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, landMaskTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, dummyLandData);
        gl.bindTexture(gl.TEXTURE_2D, null);

        console.log(`[SeaTemperatureEngine] ${layerId} initialized (${mode} mode)`);
      } catch (error) {
        console.error('[SeaTemperatureEngine] Initialization failed:', error);
        mode = 'disabled';
      }
    },

    render(_glContext, _args) {
      if (!program || !isVisible || mode === 'disabled') return;

      // Process pending data updates
      if (needsDataUpdate && pendingData) {
        try {
          const height = pendingData.grid.length;
          const width = pendingData.grid[0]?.length || 0;

          if (width === 0 || height === 0) {
            console.warn('[SeaTemperatureEngine] Empty grid data provided');
            needsDataUpdate = false;
            pendingData = null;
            return;
          }

          if (dataTexture) gl.deleteTexture(dataTexture);

          if (mode === 'float') {
            const { data, metadata: meta } = encodeTemperatureGrid(
              pendingData.grid,
              pendingData.minLon,
              pendingData.maxLon,
              pendingData.minLat,
              pendingData.maxLat
            );
            dataTexture = createTemperatureTexture(gl, data, meta.width, meta.height, true);
            metadata = meta;
          } else {
            // Uint8 mode
            const data = encodeTemperatureGridUint8(pendingData.grid, minTemp, maxTemp);
            dataTexture = createTemperatureTexture(gl, data, width, height, false);
            metadata = {
              width,
              height,
              minLon: pendingData.minLon,
              maxLon: pendingData.maxLon,
              minLat: pendingData.minLat,
              maxLat: pendingData.maxLat,
              minValue: minTemp,
              maxValue: maxTemp
            };
          }

          // Update land mask for new bounds if land masking is enabled
          if (useLandMask && landMaskTexture) {
            const bounds = {
              west: pendingData.minLon,
              south: pendingData.minLat,
              east: pendingData.maxLon,
              north: pendingData.maxLat
            };
            const maskWidth = Math.min(1024, width * 4);
            const maskHeight = Math.min(1024, height * 4);

            // Create land mask asynchronously
            createLandMaskTexture(gl, bounds, maskWidth, maskHeight)
              .then(newMask => {
                const oldMask = landMaskTexture;
                landMaskTexture = newMask;
                if (oldMask && oldMask !== newMask) {
                  gl.deleteTexture(oldMask);
                }
                console.log(`[SeaTemperatureEngine] Land mask updated for bounds`, bounds);
                map.triggerRepaint();
              })
              .catch(error => {
                console.error('[SeaTemperatureEngine] Failed to update land mask:', error);
              });
          }

          console.log(`[SeaTemperatureEngine] Data updated (${mode}):`, metadata);
        } catch (error) {
          console.error('[SeaTemperatureEngine] Failed to encode data:', error);
        }
        needsDataUpdate = false;
        pendingData = null;
      }

      if (!dataTexture || !metadata) return;

      const saved = saveGLState(gl);

      try {
        // Get current viewport bounds
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
        gl.uniform1f(gl.getUniformLocation(program, 'u_min_temp'), minTemp);
        gl.uniform1f(gl.getUniformLocation(program, 'u_max_temp'), maxTemp);
        gl.uniform1f(gl.getUniformLocation(program, 'u_use_land_mask'), useLandMask ? 1.0 : 0.0);

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
        console.error('[SeaTemperatureEngine] Render failed:', error);
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
    },
  };

  return layer;
}
