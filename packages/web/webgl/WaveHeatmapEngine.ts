/**
 * WaveHeatmapEngine.ts - MapLibre CustomLayerInterface for Wave Heatmap
 * Renders wave height data as a GPU-accelerated heatmap overlay
 * Supports fallback to Uint8 textures when OES_texture_float is unavailable
 */

import type { Map as MaplibreMap, CustomLayerInterface } from 'maplibre-gl';
import { createProgram, createQuadBuffer, saveGLState, restoreGLState } from './GLUtils';
import { createColorRampTexture, WAVE_COLORS } from './ColorRamps';
import { encodeScalarGrid, type GridMetadata } from './DataEncoder';
import { createLandMaskTexture } from './LandMask';
import heatmapVert from './shaders/heatmap.vert.glsl';
import heatmapFrag from './shaders/heatmap.frag.glsl';
import heatmapFragUint8 from './shaders/heatmap-uint8.frag.glsl';

export type HeatmapMode = 'float' | 'uint8' | 'disabled';

export interface WaveHeatmapConfig {
  opacity?: number;
  useLandMask?: boolean;
}

/**
 * Encode scalar grid data to Uint8 RGBA texture
 * R = normalized value (0-255)
 * G = same as R for shader compatibility
 * B = unused
 * A = valid data flag (255 for valid, 0 for invalid)
 */
function encodeScalarGridUint8(
  grid: number[][],
  maxValue: number = 10
): Uint8Array {
  const height = grid.length;
  const width = grid[0]?.length || 0;
  const data = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const v = grid[y][x];
      const normalized = Math.min(1, Math.max(0, (v || 0) / maxValue));
      const encoded = Math.round(normalized * 255);

      data[i] = encoded;     // R = normalized value
      data[i + 1] = encoded; // G = same
      data[i + 2] = 0;       // B unused
      data[i + 3] = v > 0 ? 255 : 0; // A = valid data flag
    }
  }

  return data;
}

/**
 * Create texture from data (Float32 or Uint8)
 * Uses LINEAR filtering for smooth heatmap interpolation
 */
function createHeatmapTexture(
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

export interface WaveHeatmapLayer extends CustomLayerInterface {
  updateData: (grid: number[][], minLon: number, maxLon: number, minLat: number, maxLat: number) => void;
  setOpacity: (opacity: number) => void;
  setVisibility: (visible: boolean) => void;
  getMode: () => HeatmapMode;
}

/**
 * Creates a MapLibre CustomLayerInterface for rendering wave heatmaps via WebGL.
 * Automatically selects Float32 or Uint8 mode based on device capabilities.
 */
export function createWaveHeatmapLayer(
  layerId: string = 'wave-heatmap',
  config: WaveHeatmapConfig = {}
): WaveHeatmapLayer {
  let map: MaplibreMap;
  let gl: WebGLRenderingContext;
  let program: WebGLProgram | null = null;
  let quadBuffer: WebGLBuffer | null = null;
  let dataTexture: WebGLTexture | null = null;
  let colorRampTexture: WebGLTexture | null = null;
  let landMaskTexture: WebGLTexture | null = null;
  let metadata: GridMetadata | null = null;
  let opacity = config.opacity ?? 0.7;
  let useLandMask = config.useLandMask ?? false;
  let isVisible = true;
  let needsDataUpdate = false;
  let pendingData: { grid: number[][]; minLon: number; maxLon: number; minLat: number; maxLat: number } | null = null;
  let mode: HeatmapMode = 'disabled';

  const layer: WaveHeatmapLayer = {
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

      // Check float texture support
      const floatExt = gl.getExtension('OES_texture_float');
      const floatLinearExt = gl.getExtension('OES_texture_float_linear');

      // Determine mode
      if (floatExt && floatLinearExt) {
        mode = 'float';
        console.log('[WaveHeatmapEngine] Using Float32 mode');
      } else if (floatExt) {
        // Float textures work but linear filtering doesn't - still usable
        mode = 'float';
        console.log('[WaveHeatmapEngine] Using Float32 mode (no linear filtering)');
      } else {
        mode = 'uint8';
        console.log('[WaveHeatmapEngine] OES_texture_float not supported, using Uint8 mode');
      }

      try {
        // Create shader program based on mode
        if (mode === 'float') {
          program = createProgram(gl, heatmapVert, heatmapFrag);
        } else {
          program = createProgram(gl, heatmapVert, heatmapFragUint8);
        }

        // Create fullscreen quad
        quadBuffer = createQuadBuffer(gl);

        // Create color ramp texture
        colorRampTexture = createColorRampTexture(gl, WAVE_COLORS);

        // Land mask will be created on first render with actual data bounds
        // For now, create a dummy 1x1 texture (all sea)
        const dummyLandData = new Uint8Array([0, 0, 0, 255]); // R=0 (water), A=255 (valid)
        landMaskTexture = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, landMaskTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, dummyLandData);
        gl.bindTexture(gl.TEXTURE_2D, null);

        console.log(`[WaveHeatmapEngine] Initialized successfully (${mode} mode)`);
      } catch (error) {
        console.error('[WaveHeatmapEngine] Initialization failed:', error);
        mode = 'disabled';
      }
    },

    render(_glContext: WebGLRenderingContext, _args: any) {
      if (!program || !isVisible || mode === 'disabled') return;

      // Process pending data updates
      if (needsDataUpdate && pendingData) {
        try {
          const height = pendingData.grid.length;
          const width = pendingData.grid[0]?.length || 0;

          if (width === 0 || height === 0) {
            console.warn('[WaveHeatmapEngine] Empty grid data provided');
            needsDataUpdate = false;
            pendingData = null;
            return;
          }

          if (dataTexture) gl.deleteTexture(dataTexture);

          if (mode === 'float') {
            // Float32 mode
            const { data, metadata: meta } = encodeScalarGrid(
              pendingData.grid,
              pendingData.minLon,
              pendingData.maxLon,
              pendingData.minLat,
              pendingData.maxLat
            );
            dataTexture = createHeatmapTexture(gl, data, meta.width, meta.height, true);
            metadata = meta;
          } else {
            // Uint8 mode
            const maxWaveHeight = 10; // meters
            const data = encodeScalarGridUint8(pendingData.grid, maxWaveHeight);
            dataTexture = createHeatmapTexture(gl, data, width, height, false);
            metadata = {
              width,
              height,
              minLon: pendingData.minLon,
              maxLon: pendingData.maxLon,
              minLat: pendingData.minLat,
              maxLat: pendingData.maxLat,
              minValue: 0,
              maxValue: maxWaveHeight
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
            // Use higher resolution for smoother coastlines (2x data resolution)
            const maskWidth = Math.min(1024, width * 4);
            const maskHeight = Math.min(1024, height * 4);

            // Create land mask asynchronously and update when ready
            createLandMaskTexture(gl, bounds, maskWidth, maskHeight)
              .then(newMask => {
                const oldMask = landMaskTexture;
                landMaskTexture = newMask;
                if (oldMask && oldMask !== newMask) {
                  gl.deleteTexture(oldMask);
                }
                console.log(`[WaveHeatmapEngine] Land mask updated for bounds`, bounds);
                map.triggerRepaint();
              })
              .catch(error => {
                console.error('[WaveHeatmapEngine] Failed to update land mask:', error);
              });
          }

          console.log(`[WaveHeatmapEngine] Data updated (${mode}):`, metadata);
        } catch (error) {
          console.error('[WaveHeatmapEngine] Failed to encode data:', error);
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
        gl.uniform1f(gl.getUniformLocation(program, 'u_max_value'), metadata.maxValue);
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
        console.error('[WaveHeatmapEngine] Render error:', error);
      }

      // MANDATORY: Restore GL state
      restoreGLState(gl, saved);
    },

    onRemove() {
      if (program) gl.deleteProgram(program);
      if (quadBuffer) gl.deleteBuffer(quadBuffer);
      if (dataTexture) gl.deleteTexture(dataTexture);
      if (colorRampTexture) gl.deleteTexture(colorRampTexture);
      if (landMaskTexture) gl.deleteTexture(landMaskTexture);
      console.log('[WaveHeatmapEngine] Removed');
    },
  };

  return layer;
}
