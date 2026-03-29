/**
 * GenericHeatmapEngine.ts - Offscreen Canvas heatmap renderer
 *
 * Renders scalar data (wave height, sea temperature, cloud cover, etc.) to its
 * OWN offscreen canvas with an independent WebGL context. MapLibre's CanvasSource
 * drapes the canvas onto the globe — no CustomLayerInterface, no shared GL state.
 *
 * Supports configurable:
 *   - Color ramp
 *   - Normalization mode (max-value, range, unit)
 *   - Data range (min/max)
 *   - Land masking
 *   - Discard threshold
 *   - Smoothstep fade band
 *   - Valid range guard
 *   - Temporal interpolation (current/next frame blending)
 */

import { createProgram } from './GLUtils';
import { createColorRampTexture } from './ColorRamps';
import { createLandMaskTexture } from './LandMask';

// Import shaders (handled by Vite glsl-loader plugin)
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
  validRange?: [number, number]; // [min, max] — out-of-range values → alpha=0
}

export interface GenericHeatmapEngine {
  /** Initialize WebGL on the given canvas. Call once after creation. */
  init(canvas: HTMLCanvasElement): void;
  /** Render the heatmap to the canvas. Call whenever data or blend changes. */
  render(): void;
  /** Upload primary data grid. */
  updateData(grid: number[][], minLon: number, maxLon: number, minLat: number, maxLat: number): void;
  /** Upload next timestep for temporal blending. */
  updateNextData(grid: number[][], minLon: number, maxLon: number, minLat: number, maxLat: number): void;
  /** Set temporal blend factor (0 = current only, 1 = next only). */
  setBlend(blend: number): void;
  /** Set layer opacity. */
  setOpacity(opacity: number): void;
  /** Enable/disable FBM noise cloud pattern (modulates alpha for fluffy cloud shapes). */
  setCloudPattern(enabled: boolean): void;
  /** Get current rendering mode. */
  getMode(): HeatmapMode;
  /** Get current data bounds (for CanvasSource coordinates). */
  getDataBounds(): { minLon: number; maxLon: number; minLat: number; maxLat: number } | null;
  /** Release all WebGL resources. */
  destroy(): void;
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
        if (validRange && (v < validRange[0] || v > validRange[1])) {
          continue;
        }
        data[i] = v;       // R = raw value
        data[i + 1] = 0;   // G unused
        data[i + 2] = 0;   // B unused
        data[i + 3] = 1;   // A = valid flag
      }
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

      if (v === null || v === undefined || isNaN(v)) continue;
      if (validRange && (v < validRange[0] || v > validRange[1])) continue;

      let normalized: number;
      if (normalization === 'max-value') {
        normalized = Math.max(0, Math.min(1, v / maxValue));
      } else if (normalization === 'range') {
        normalized = Math.max(0, Math.min(1, (v - minValue) / (maxValue - minValue)));
      } else {
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
 * Create a GenericHeatmapEngine that renders to its own offscreen canvas.
 *
 * Usage:
 *   const engine = createGenericHeatmapEngine({ ... });
 *   engine.init(offscreenCanvas);
 *   engine.updateData(grid, minLon, maxLon, minLat, maxLat);
 *   engine.render();  // renders to the canvas
 *   // MapLibre's CanvasSource reads the canvas pixels automatically
 */
export function createGenericHeatmapEngine(
  config: HeatmapLayerConfig
): GenericHeatmapEngine {
  let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  let program: WebGLProgram | null = null;
  let quadBuffer: WebGLBuffer | null = null;
  let dataTexture: WebGLTexture | null = null;
  let dataTextureNext: WebGLTexture | null = null;
  let dummyNextTexture: WebGLTexture | null = null;
  let colorRampTexture: WebGLTexture | null = null;
  let landMaskTexture: WebGLTexture | null = null;
  let metadata: GridMetadata | null = null;
  let mode: HeatmapMode = 'disabled';
  let useWebGL2FloatFormat = false;
  let opacity = config.opacity ?? 0.7;
  let timeBlend = 0;
  let cloudPattern = 0.0; // 0.0 = off, 1.0 = FBM noise cloud alpha modulation
  let destroyed = false;

  const useLandMask = config.useLandMask ?? false;
  const minValue = config.minValue ?? 0;
  const maxValue = config.maxValue ?? 1;
  const discardBelow = config.discardBelow ?? 0;
  const fadeRange = config.fadeRange ?? 0;
  const validRange = config.validRange;
  const normMode = config.normalization;
  const prefix = config.logPrefix;

  // Pending data queues
  let pendingData: { grid: number[][]; minLon: number; maxLon: number; minLat: number; maxLat: number } | null = null;
  let needsDataUpdate = false;
  let pendingNextData: { grid: number[][]; minLon: number; maxLon: number; minLat: number; maxLat: number } | null = null;
  let needsNextDataUpdate = false;

  /**
   * Static fullscreen NDC quad: 4 vertices as TRIANGLE_STRIP.
   * a_pos = [-1..1] NDC, a_texcoord = [0..1] UV
   * Layout per vertex: [posX, posY, u, v] = 16 bytes stride
   *
   * UV assignment matches data grid orientation:
   *   Bottom-Left  (-1,-1) → UV (0, 0) → minLon, minLat (south-west)
   *   Bottom-Right ( 1,-1) → UV (1, 0) → maxLon, minLat (south-east)
   *   Top-Left     (-1, 1) → UV (0, 1) → minLon, maxLat (north-west)
   *   Top-Right    ( 1, 1) → UV (1, 1) → maxLon, maxLat (north-east)
   */
  const FULLSCREEN_QUAD = new Float32Array([
    // posX, posY, u, v
    -1, -1, 0, 0,  // BL
     1, -1, 1, 0,  // BR
    -1,  1, 0, 1,  // TL
     1,  1, 1, 1,  // TR
  ]);

  function uploadTexture(
    grid: number[][],
    existingTex: WebGLTexture | null
  ): { texture: WebGLTexture; width: number; height: number } {
    if (!gl) throw new Error('GL not initialized');

    const height = grid.length;
    const width = grid[0]?.length || 0;
    if (width === 0 || height === 0) throw new Error('Empty grid');

    if (existingTex) gl.deleteTexture(existingTex);

    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    if (mode === 'float') {
      const floatData = encodeGridFloat32(grid, validRange);
      const internalFmt = useWebGL2FloatFormat
        ? (gl as WebGL2RenderingContext).RGBA32F
        : gl.RGBA;
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFmt, width, height, 0, gl.RGBA, gl.FLOAT, floatData);
    } else {
      const uint8Data = encodeGridUint8(grid, normMode, minValue, maxValue, validRange);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, uint8Data);
    }
    gl.bindTexture(gl.TEXTURE_2D, null);

    return { texture, width, height };
  }

  const engine: GenericHeatmapEngine = {
    getMode() { return mode; },

    getDataBounds() {
      if (!metadata) return null;
      return {
        minLon: metadata.minLon,
        maxLon: metadata.maxLon,
        minLat: metadata.minLat,
        maxLat: metadata.maxLat,
      };
    },

    updateData(grid, minLon, maxLon, minLat, maxLat) {
      pendingData = { grid, minLon, maxLon, minLat, maxLat };
      needsDataUpdate = true;
      // Force immediate render so heatmap appears without waiting for next frame
      engine.render();
    },

    updateNextData(grid, minLon, maxLon, minLat, maxLat) {
      pendingNextData = { grid, minLon, maxLon, minLat, maxLat };
      needsNextDataUpdate = true;
    },

    setBlend(blend: number) {
      timeBlend = Math.max(0, Math.min(1, blend));
    },

    setOpacity(newOpacity: number) {
      opacity = Math.max(0, Math.min(1, newOpacity));
    },

    setCloudPattern(enabled: boolean) {
      cloudPattern = enabled ? 1.0 : 0.0;
    },

    init(canvas: HTMLCanvasElement) {
      if (destroyed) return;

      // Get our own GL context from the canvas (already created by OffscreenCanvasManager
      // with preserveDrawingBuffer: true, premultipliedAlpha: false)
      const existingGl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!existingGl) {
        console.error(`${prefix} Failed to get WebGL context from canvas`);
        mode = 'disabled';
        return;
      }
      gl = existingGl;

      const isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
      useWebGL2FloatFormat = isWebGL2;

      // Detect float texture support + LINEAR interpolation for smooth gradients
      const floatExt = isWebGL2 || gl.getExtension('OES_texture_float');
      const floatLinearExt = gl.getExtension('OES_texture_float_linear');
      if (isWebGL2) {
        gl.getExtension('EXT_color_buffer_float');
        gl.getExtension('EXT_float_blend');
      }
      // Half-float fallback — LINEAR is always supported for half-float in WebGL2
      if (!floatLinearExt) {
        gl.getExtension('OES_texture_half_float');
        gl.getExtension('OES_texture_half_float_linear');
      }

      mode = floatExt ? 'float' : 'uint8';
      console.log(`${prefix} Using ${mode} mode${isWebGL2 ? ' (WebGL 2)' : ''}, float LINEAR: ${!!floatLinearExt}`);

      try {
        // Compile shaders eagerly — no lazy compilation needed since we own the GL context
        const fragSrc = mode === 'float' ? fragShaderFloat : fragShaderUint8;
        program = createProgram(gl, vertShader, fragSrc);
        console.log(`${prefix} Shaders compiled successfully`);

        // Create static fullscreen quad buffer
        quadBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, FULLSCREEN_QUAD, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        // Color ramp texture
        colorRampTexture = createColorRampTexture(gl, config.colorRamp);

        // Dummy 1×1 transparent texture for u_data_next
        const dummyData = new Uint8Array([0, 0, 0, 0]);
        dummyNextTexture = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, dummyNextTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, dummyData);
        gl.bindTexture(gl.TEXTURE_2D, null);

        // Dummy 1×1 land mask (all sea)
        const dummyLand = new Uint8Array([0, 0, 0, 255]);
        landMaskTexture = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, landMaskTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, dummyLand);
        gl.bindTexture(gl.TEXTURE_2D, null);

        console.log(`${prefix} Initialized (${mode} mode)`);
      } catch (error) {
        console.error(`${prefix} Initialization failed:`, error);
        mode = 'disabled';
      }
    },

    render() {
      if (destroyed || mode === 'disabled' || !gl || !program || gl.isContextLost()) return;

      // Process pending data uploads
      if (needsDataUpdate && pendingData) {
        try {
          const result = uploadTexture(pendingData.grid, dataTexture);
          dataTexture = result.texture;
          metadata = {
            width: result.width,
            height: result.height,
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
            const maskW = Math.min(1024, result.width * 4);
            const maskH = Math.min(1024, result.height * 4);

            createLandMaskTexture(gl, bounds, maskW, maskH)
              .then(newMask => {
                const oldMask = landMaskTexture;
                landMaskTexture = newMask;
                if (oldMask && oldMask !== newMask) gl!.deleteTexture(oldMask);
              })
              .catch(err => console.error(`${prefix} Land mask error:`, err));
          }

          console.log(`${prefix} Data updated (${mode}): ${result.width}x${result.height}`);
        } catch (error) {
          console.error(`${prefix} Failed to encode data:`, error);
        }
        needsDataUpdate = false;
        pendingData = null;
      }

      // Process pending next-frame data
      if (needsNextDataUpdate && pendingNextData) {
        try {
          const result = uploadTexture(pendingNextData.grid, dataTextureNext);
          dataTextureNext = result.texture;
          console.log(`${prefix} Next-frame data uploaded (${mode}): ${result.width}×${result.height}`);
        } catch (error) {
          console.error(`${prefix} Failed to upload next-frame data:`, error);
        }
        needsNextDataUpdate = false;
        pendingNextData = null;
      }

      if (!dataTexture || !metadata) return;

      // ── Render fullscreen quad to own canvas ──────────────────────────────
      const canvas = gl.canvas as HTMLCanvasElement;
      gl.viewport(0, 0, canvas.width, canvas.height);

      // Clear with fully transparent black — ensures no washout on globe
      gl.clearColor(0.0, 0.0, 0.0, 0.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

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

      // Bind next-frame data to unit 3
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, dataTextureNext ?? dummyNextTexture);
      gl.uniform1i(gl.getUniformLocation(program, 'u_data_next'), 3);
      gl.uniform1f(gl.getUniformLocation(program, 'u_time_blend'), timeBlend);

      // Scalar uniforms
      gl.uniform1f(gl.getUniformLocation(program, 'u_opacity'), opacity);
      gl.uniform1f(gl.getUniformLocation(program, 'u_use_land_mask'), useLandMask ? 1.0 : 0.0);
      gl.uniform1f(gl.getUniformLocation(program, 'u_cloud_pattern'), cloudPattern);

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

      // Draw fullscreen quad — straight alpha, no depth test
      // Straight alpha because premultipliedAlpha: false on our canvas context.
      // MapLibre's raster layer handles compositing onto the globe.
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.DEPTH_TEST);

      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      const posLoc = gl.getAttribLocation(program, 'a_pos');
      const texLoc = gl.getAttribLocation(program, 'a_texcoord');
      gl.enableVertexAttribArray(posLoc);
      gl.enableVertexAttribArray(texLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
      gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 16, 8);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      gl.disableVertexAttribArray(posLoc);
      gl.disableVertexAttribArray(texLoc);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;

      if (gl) {
        if (program) gl.deleteProgram(program);
        if (quadBuffer) gl.deleteBuffer(quadBuffer);
        if (dataTexture) gl.deleteTexture(dataTexture);
        if (dataTextureNext) gl.deleteTexture(dataTextureNext);
        if (dummyNextTexture) gl.deleteTexture(dummyNextTexture);
        if (colorRampTexture) gl.deleteTexture(colorRampTexture);
        if (landMaskTexture) gl.deleteTexture(landMaskTexture);

        // Explicitly release WebGL context to prevent browser context exhaustion
        const loseCtx = gl.getExtension('WEBGL_lose_context');
        if (loseCtx) loseCtx.loseContext();
      }

      program = null;
      quadBuffer = null;
      dataTexture = null;
      dataTextureNext = null;
      dummyNextTexture = null;
      colorRampTexture = null;
      landMaskTexture = null;
      gl = null;
      mode = 'disabled';
      console.log(`${prefix} Destroyed`);
    },
  };

  return engine;
}
