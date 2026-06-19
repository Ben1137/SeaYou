/**
 * CoastalDynamicsEngine.ts
 *
 * Standalone offscreen-canvas WebGL engine for the Coastal Dynamics breaking-wave
 * heatmap. Architecturally identical to GenericHeatmapEngine but uses TWO data
 * textures: swell (TEXTURE0) and bathymetry (TEXTURE4). The physics transform
 * (Fenton-McKee dispersion → shoaling → depth-limited breaking) runs entirely in
 * coastal-dynamics.frag.glsl.
 *
 * Private GL context — NOT subject to CLAUDE.md shared-context rules.
 * This engine owns its own offscreen canvas and WebGL context (identical to
 * GenericHeatmapEngine). The TEXTURE0–3 conventions in CLAUDE.md apply only to
 * ParticleEngine which shares MapLibre's GL context.
 *
 * Texture layout (private context, no cross-engine conflicts):
 *   TEXTURE0  u_data        Swell grid (R=H0, G=T, A=valid)
 *   TEXTURE1  u_color_ramp  Breaking-height colour ramp (256×1)
 *   TEXTURE2  u_land_mask   Land/sea mask (unused in Phase 3, dummy 1×1)
 *   TEXTURE4  u_depth       Bathymetry grid (R=depth_m, A=valid)
 */

import { createProgram } from './GLUtils';
import { createColorRampTexture } from './ColorRamps';

import vertShader from './shaders/heatmap.vert.glsl';
import fragShader from './shaders/coastal-dynamics.frag.glsl';

export interface CoastalDynamicsConfig {
  /** Colour ramp for breaking-wave height output */
  colorRamp: [number, number, number, number][];
  /** Maximum breaking height for colour ramp normalisation (m). Default 4.0 */
  maxBreakingHeight?: number;
  /** Overall layer opacity */
  opacity?: number;
  logPrefix?: string;
}

export interface CoastalDynamicsEngine {
  init(canvas: HTMLCanvasElement): void;
  /** Upload swell grid: each cell has [H0, T] — stored as R=H0, G=T, A=valid */
  updateSwellData(
    H0Grid: number[][],
    TGrid: number[][],
    minLon: number, maxLon: number,
    minLat: number, maxLat: number,
  ): void;
  /** Upload bathymetry depth grid (m, positive down). Called from fetchDepthGrid(). */
  updateBathymetryData(
    depthGrid: number[][],
    minLon: number, maxLon: number,
    minLat: number, maxLat: number,
  ): void;
  /** Set tide offset (sea_level_height_msl) added to depth before transform */
  setTideOffset(tideM: number): void;
  setOpacity(opacity: number): void;
  render(): void;
  getDataBounds(): { minLon: number; maxLon: number; minLat: number; maxLat: number } | null;
  destroy(): void;
}

type EngineMode = 'float' | 'uint8' | 'disabled';

const FULLSCREEN_QUAD = new Float32Array([
  -1, -1, 0, 0,
   1, -1, 1, 0,
  -1,  1, 0, 1,
   1,  1, 1, 1,
]);

export function createCoastalDynamicsEngine(
  config: CoastalDynamicsConfig,
): CoastalDynamicsEngine {
  const prefix = config.logPrefix ?? '[CoastalDynamics]';
  const maxBreakingHeight = config.maxBreakingHeight ?? 4.0;
  let opacity = config.opacity ?? 0.75;
  let tideOffset = 0;

  let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  let mode: EngineMode = 'disabled';
  let useWebGL2Float = false;
  let program: WebGLProgram | null = null;
  let quadBuffer: WebGLBuffer | null = null;

  let swellTexture: WebGLTexture | null = null;
  let depthTexture: WebGLTexture | null = null;
  let colorRampTexture: WebGLTexture | null = null;
  let dummyLandMask: WebGLTexture | null = null;

  let swellMeta: { minLon: number; maxLon: number; minLat: number; maxLat: number } | null = null;
  let depthMeta:  { minLon: number; maxLon: number; minLat: number; maxLat: number } | null = null;

  let pendingSwell: {
    H0Grid: number[][]; TGrid: number[][];
    minLon: number; maxLon: number; minLat: number; maxLat: number;
  } | null = null;
  let pendingDepth: {
    grid: number[][];
    minLon: number; maxLon: number; minLat: number; maxLat: number;
  } | null = null;

  let destroyed = false;

  /**
   * Upload a 2-channel swell texture: R=H0, G=T, A=valid.
   * Float32 RGBA if mode=float, Uint8 otherwise (normalized to 0–255).
   * Max H0 = 30 m, Max T = 30 s for Uint8 range.
   */
  function uploadSwellTexture(
    H0Grid: number[][],
    TGrid:  number[][],
    existing: WebGLTexture | null,
  ): WebGLTexture {
    if (!gl) throw new Error('GL not initialized');
    const height = H0Grid.length;
    const width  = H0Grid[0]?.length ?? 0;
    if (width === 0 || height === 0) throw new Error('Empty swell grid');

    if (existing) gl.deleteTexture(existing);
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    if (mode === 'float') {
      const data = new Float32Array(width * height * 4);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const H0 = H0Grid[y][x];
          const T  = TGrid[y][x];
          if (H0 != null && T != null && !isNaN(H0) && !isNaN(T) && H0 > 0 && T > 0) {
            data[i]     = H0;   // R = H0
            data[i + 1] = T;    // G = T
            data[i + 2] = 0;
            data[i + 3] = 1.0;  // A = valid
          }
          // else: A stays 0 → shader discards
        }
      }
      const internalFmt = useWebGL2Float
        ? (gl as WebGL2RenderingContext).RGBA32F
        : gl.RGBA;
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFmt, width, height, 0, gl.RGBA, gl.FLOAT, data);
    } else {
      // Uint8 fallback: pack H0/30 and T/30 into R/G bytes
      const data = new Uint8Array(width * height * 4);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const H0 = H0Grid[y][x];
          const T  = TGrid[y][x];
          if (H0 != null && T != null && !isNaN(H0) && !isNaN(T) && H0 > 0 && T > 0) {
            data[i]     = Math.round(Math.min(1, H0 / 30) * 255);
            data[i + 1] = Math.round(Math.min(1, T  / 30) * 255);
            data[i + 2] = 0;
            data[i + 3] = 255;
          }
        }
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    }

    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  }

  /**
   * Upload a depth texture: R=depth_m (positive down), A=valid.
   * Depths ≤ 0 (land) are stored with A=0 so the shader discards them.
   */
  function uploadDepthTexture(
    grid: number[][],
    existing: WebGLTexture | null,
  ): WebGLTexture {
    if (!gl) throw new Error('GL not initialized');
    const height = grid.length;
    const width  = grid[0]?.length ?? 0;
    if (width === 0 || height === 0) throw new Error('Empty depth grid');

    if (existing) gl.deleteTexture(existing);
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    if (mode === 'float') {
      const data = new Float32Array(width * height * 4);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const d = grid[y][x];
          if (d != null && !isNaN(d) && d > 0) {
            data[i]     = d;    // R = depth (m)
            data[i + 1] = 0;
            data[i + 2] = 0;
            data[i + 3] = 1.0;  // A = valid (ocean)
          }
          // land (d ≤ 0): A stays 0 → shader discards
        }
      }
      const internalFmt = useWebGL2Float
        ? (gl as WebGL2RenderingContext).RGBA32F
        : gl.RGBA;
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFmt, width, height, 0, gl.RGBA, gl.FLOAT, data);
    } else {
      // Uint8: pack depth/6000 → byte
      const data = new Uint8Array(width * height * 4);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const d = grid[y][x];
          if (d != null && !isNaN(d) && d > 0) {
            data[i]     = Math.round(Math.min(1, d / 6000) * 255);
            data[i + 1] = 0;
            data[i + 2] = 0;
            data[i + 3] = 255;
          }
        }
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    }

    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  }

  const engine: CoastalDynamicsEngine = {
    init(canvas: HTMLCanvasElement) {
      if (destroyed) return;

      const existingGl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!existingGl) {
        console.error(`${prefix} Failed to get WebGL context`);
        mode = 'disabled';
        return;
      }
      gl = existingGl;

      const isWebGL2 = typeof WebGL2RenderingContext !== 'undefined'
        && gl instanceof WebGL2RenderingContext;
      useWebGL2Float = isWebGL2;

      const floatExt   = isWebGL2 || gl.getExtension('OES_texture_float');
      const floatLinear = isWebGL2 || gl.getExtension('OES_texture_float_linear');
      if (isWebGL2) {
        gl.getExtension('EXT_color_buffer_float');
        gl.getExtension('EXT_float_blend');
      }

      mode = (floatExt && floatLinear) ? 'float' : 'uint8';
      console.log(`${prefix} Using ${mode} mode${isWebGL2 ? ' (WebGL 2)' : ''}`);

      try {
        program = createProgram(gl, vertShader, fragShader);

        quadBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, FULLSCREEN_QUAD, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        colorRampTexture = createColorRampTexture(gl, config.colorRamp);

        // Dummy land mask (1×1 sea) — Phase 3 relies on depth ≤ 0 to exclude land
        const dummyLand = new Uint8Array([0, 0, 0, 255]);
        dummyLandMask = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, dummyLandMask);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, dummyLand);
        gl.bindTexture(gl.TEXTURE_2D, null);

        console.log(`${prefix} Initialized (${mode} mode)`);
      } catch (err) {
        console.error(`${prefix} Init failed:`, err);
        mode = 'disabled';
      }
    },

    updateSwellData(H0Grid, TGrid, minLon, maxLon, minLat, maxLat) {
      pendingSwell = { H0Grid, TGrid, minLon, maxLon, minLat, maxLat };
      engine.render();
    },

    updateBathymetryData(depthGrid, minLon, maxLon, minLat, maxLat) {
      pendingDepth = { grid: depthGrid, minLon, maxLon, minLat, maxLat };
      engine.render();
    },

    setTideOffset(tideM) { tideOffset = tideM; },
    setOpacity(o) { opacity = Math.max(0, Math.min(1, o)); },

    getDataBounds() {
      if (!swellMeta) return null;
      return { ...swellMeta };
    },

    render() {
      if (destroyed || mode === 'disabled' || !gl || !program || gl.isContextLost()) return;

      // Upload pending swell texture
      if (pendingSwell) {
        try {
          swellTexture = uploadSwellTexture(
            pendingSwell.H0Grid, pendingSwell.TGrid, swellTexture,
          );
          swellMeta = {
            minLon: pendingSwell.minLon, maxLon: pendingSwell.maxLon,
            minLat: pendingSwell.minLat, maxLat: pendingSwell.maxLat,
          };
          console.log(`${prefix} Swell texture uploaded`);
        } catch (e) {
          console.error(`${prefix} Swell upload failed:`, e);
        }
        pendingSwell = null;
      }

      // Upload pending depth texture
      if (pendingDepth) {
        try {
          depthTexture = uploadDepthTexture(pendingDepth.grid, depthTexture);
          depthMeta = {
            minLon: pendingDepth.minLon, maxLon: pendingDepth.maxLon,
            minLat: pendingDepth.minLat, maxLat: pendingDepth.maxLat,
          };
          console.log(`${prefix} Depth texture uploaded`);
        } catch (e) {
          console.error(`${prefix} Depth upload failed:`, e);
        }
        pendingDepth = null;
      }

      if (!swellTexture || !depthTexture) return;

      const canvas = gl.canvas as HTMLCanvasElement;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(program);

      // TEXTURE0: swell (R=H0, G=T, A=valid)
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, swellTexture);
      gl.uniform1i(gl.getUniformLocation(program, 'u_data'), 0);

      // TEXTURE1: colour ramp
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, colorRampTexture);
      gl.uniform1i(gl.getUniformLocation(program, 'u_color_ramp'), 1);

      // TEXTURE2: dummy land mask (depth ≤ 0 handles land exclusion in shader)
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, dummyLandMask);
      gl.uniform1i(gl.getUniformLocation(program, 'u_land_mask'), 2);

      // TEXTURE4: bathymetry depth
      gl.activeTexture(gl.TEXTURE0 + 4);
      gl.bindTexture(gl.TEXTURE_2D, depthTexture);
      gl.uniform1i(gl.getUniformLocation(program, 'u_depth'), 4);

      // Scalar uniforms
      gl.uniform1f(gl.getUniformLocation(program, 'u_opacity'), opacity);
      gl.uniform1f(gl.getUniformLocation(program, 'u_max_breaking_height'), maxBreakingHeight);
      gl.uniform1f(gl.getUniformLocation(program, 'u_tide_offset'), tideOffset);
      gl.uniform1f(gl.getUniformLocation(program, 'u_use_land_mask'), 0.0); // depth handles it

      // Draw fullscreen quad (straight alpha, premultipliedAlpha: false canvas)
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

      // DIAGNOSTIC PROBE 2 — one-time pixel readback to confirm the engine is drawing.
      // Non-zero alpha → engine draws to canvas; blank → all-discard or viewport/blend bug.
      if (!(engine as any)._probe2Done) {
        (engine as any)._probe2Done = true;
        const px = new Uint8Array(4);
        gl.readPixels(
          Math.floor((gl.canvas as HTMLCanvasElement).width / 2),
          Math.floor((gl.canvas as HTMLCanvasElement).height / 2),
          1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px
        );
        console.log('[CoastalDynamics] PROBE2 centre pixel RGBA after draw:', px[0], px[1], px[2], px[3]);
      }
      // END DIAGNOSTIC PROBE 2

      gl.disableVertexAttribArray(posLoc);
      gl.disableVertexAttribArray(texLoc);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;

      if (gl) {
        if (program)         gl.deleteProgram(program);
        if (quadBuffer)      gl.deleteBuffer(quadBuffer);
        if (swellTexture)    gl.deleteTexture(swellTexture);
        if (depthTexture)    gl.deleteTexture(depthTexture);
        if (colorRampTexture) gl.deleteTexture(colorRampTexture);
        if (dummyLandMask)   gl.deleteTexture(dummyLandMask);

        const loseCtx = gl.getExtension('WEBGL_lose_context');
        if (loseCtx) loseCtx.loseContext();
      }

      program = null; quadBuffer = null;
      swellTexture = null; depthTexture = null;
      colorRampTexture = null; dummyLandMask = null;
      gl = null;
      mode = 'disabled';
      console.log(`${prefix} Destroyed`);
    },
  };

  return engine;
}
