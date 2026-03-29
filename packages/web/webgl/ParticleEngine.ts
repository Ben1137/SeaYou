/**
 * ParticleEngine.ts - Offscreen Canvas GPGPU Particle System
 *
 * Renders animated particles to its OWN offscreen canvas with an independent
 * WebGL context. MapLibre's CanvasSource drapes the canvas onto the globe.
 *
 * Supports Float32 textures (OES_texture_float) and Uint8 fallback (R8G8B8A8).
 *
 * Architecture:
 *   update()  — GPGPU position update pass (ping-pong framebuffer swap)
 *   render()  — Trail fade + particle draw + composite to own canvas
 */

import {
  createProgram,
  createFramebuffer,
  createQuadBuffer,
  createParticleIndexBuffer,
} from './GLUtils';
import { createColorRampTexture, WIND_COLORS } from './ColorRamps';
import { isMobileDevice, isLowEndDevice } from './DeviceCapabilities';
import quadVert from './shaders/quad.vert.glsl';
import updateFrag from './shaders/particle-update.frag.glsl';
import updateFragUint8 from './shaders/particle-update-uint8.frag.glsl';
import drawVert from './shaders/particle-draw.vert.glsl';
import drawVertUint8 from './shaders/particle-draw-uint8.vert.glsl';
import drawFrag from './shaders/particle-draw.frag.glsl';
import fadeVert from './shaders/fade.vert.glsl';
import fadeFrag from './shaders/fade.frag.glsl';

export type ParticleMode = 'float' | 'uint8' | 'disabled';

export interface ParticleEngineConfig {
  id: string;
  particleRes?: number;
  speedFactor?: number;
  fadeOpacity?: number;
  dropRate?: number;
  dropRateBump?: number;
  pointSize?: number;
  colorRamp?: [number, number, number, number][];
  preferUint8?: boolean;
}

export interface ParticleEngine {
  /** Initialize WebGL on the given canvas. Call once. */
  init(canvas: HTMLCanvasElement): void;
  /** GPGPU position update pass (call before render). */
  update(): void;
  /** Trail fade + particle draw → canvas. */
  render(): void;
  /** Upload velocity field data. */
  updateVelocityData(
    data: Float32Array | Uint8Array,
    width: number, height: number,
    minLon: number, minLat: number,
    maxLon: number, maxLat: number,
    maxSpeed: number
  ): void;
  /** Get current rendering mode. */
  getMode(): ParticleMode;
  /** Get current data bounds. */
  getDataBounds(): { minLon: number; minLat: number; maxLon: number; maxLat: number } | null;
  /** Dynamically update fade opacity (trail length). */
  setFadeOpacity(value: number): void;
  /** Dynamically update base point size. */
  setPointSize(value: number): void;
  /** Clear trail FBOs (removes stale trails after big viewport jumps). */
  resetTrails(): void;
  /** Re-randomize particle positions (call after large bbox change). */
  resetParticles(): void;
  /** Release all WebGL resources. */
  destroy(): void;
}

function getDefaultParticleRes(): number {
  if (typeof window === 'undefined') return 256;
  if (isLowEndDevice()) return 128;
  if (isMobileDevice()) return 256;
  return 512;
}

const DEFAULTS: Required<Omit<ParticleEngineConfig, 'id' | 'preferUint8'>> = {
  particleRes: getDefaultParticleRes(),
  speedFactor: 1.5,
  fadeOpacity: 0.97,
  dropRate: 0.002,
  dropRateBump: 0.008,
  pointSize: 2.8,
  colorRamp: WIND_COLORS,
};

// R8G8B8A8 encoding constants (must match GLSL)
const BASE = 256.0;
const OFFSET = 32768.0;
const POS_SCALE = 32767.0;

function encodeFloat(value: number, scale: number): [number, number] {
  let v = value * scale + OFFSET;
  v = Math.max(0, Math.min(65535, v));
  const low = Math.floor(v) % 256;
  const high = Math.floor(v / 256);
  return [low, high];
}

function encodeParticleStateUint8(count: number): Uint8Array {
  const data = new Uint8Array(count * 4);
  for (let i = 0; i < count; i++) {
    const x = Math.random();
    const y = Math.random();
    const [xLow, xHigh] = encodeFloat(x - 0.5, POS_SCALE);
    const [yLow, yHigh] = encodeFloat(y - 0.5, POS_SCALE);
    data[i * 4 + 0] = Math.round(xLow);
    data[i * 4 + 1] = Math.round(xHigh);
    data[i * 4 + 2] = Math.round(yLow);
    data[i * 4 + 3] = Math.round(yHigh);
  }
  return data;
}

// Texture creation helpers
function createDataTextureFloat(
  gl: WebGLRenderingContext,
  data: Float32Array | null,
  width: number, height: number,
  useLinear = false
): WebGLTexture {
  const filter = useLinear ? gl.LINEAR : gl.NEAREST;
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const isWGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  const internalFormat = isWGL2 ? (gl as WebGL2RenderingContext).RGBA32F : gl.RGBA;
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, gl.RGBA, gl.FLOAT, data);
  return texture;
}

function createDataTextureUint8(
  gl: WebGLRenderingContext,
  data: Uint8Array | null,
  width: number, height: number,
  useLinear = false
): WebGLTexture {
  const filter = useLinear ? gl.LINEAR : gl.NEAREST;
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  return texture;
}

function createTrailTexture(gl: WebGLRenderingContext, width: number, height: number): WebGLTexture {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  return texture;
}

/**
 * Create a ParticleEngine that renders to its own offscreen canvas.
 */
export function createParticleEngine(userConfig: ParticleEngineConfig): ParticleEngine {
  const cfg = { ...DEFAULTS, ...userConfig };

  let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  let mode: ParticleMode = 'disabled';
  let destroyed = false;
  let initialized = false;

  // Programs
  let updateProgram: WebGLProgram | null = null;
  let drawProgram: WebGLProgram | null = null;
  let fadeProgram: WebGLProgram | null = null;

  // Ping-pong particle state
  let particleStateA: WebGLTexture | null = null;
  let particleStateB: WebGLTexture | null = null;
  let fboA: WebGLFramebuffer | null = null;
  let fboB: WebGLFramebuffer | null = null;
  let readFromA = true;

  // Trail double buffer
  let trailTexture0: WebGLTexture | null = null;
  let trailTexture1: WebGLTexture | null = null;
  let trailFBO0: WebGLFramebuffer | null = null;
  let trailFBO1: WebGLFramebuffer | null = null;
  let trailWidth = 0;
  let trailHeight = 0;
  let readFromTrail0 = true;

  // Velocity data
  let windTexture: WebGLTexture | null = null;
  let windWidth = 0;
  let windHeight = 0;

  // Resources
  let colorRampTexture: WebGLTexture | null = null;
  let quadBuffer: WebGLBuffer | null = null;
  let indexBuffer: WebGLBuffer | null = null;

  // Data bounds
  let bbox = { minLon: 30, minLat: 29, maxLon: 37, maxLat: 35 };
  let maxSpeed = 20;
  let hasBbox = false;

  function initParticleState() {
    if (!gl) return;
    const count = cfg.particleRes * cfg.particleRes;

    if (particleStateA) gl.deleteTexture(particleStateA);
    if (particleStateB) gl.deleteTexture(particleStateB);
    if (fboA) gl.deleteFramebuffer(fboA);
    if (fboB) gl.deleteFramebuffer(fboB);

    if (mode === 'float') {
      const data = new Float32Array(count * 4);
      for (let i = 0; i < count; i++) {
        data[i * 4] = Math.random();
        data[i * 4 + 1] = Math.random();
        data[i * 4 + 2] = Math.random();
        data[i * 4 + 3] = 0.0;
      }
      particleStateA = createDataTextureFloat(gl, data, cfg.particleRes, cfg.particleRes);
      fboA = createFramebuffer(gl, particleStateA);
      particleStateB = createDataTextureFloat(gl, data, cfg.particleRes, cfg.particleRes);
      fboB = createFramebuffer(gl, particleStateB);
    } else {
      const data = encodeParticleStateUint8(count);
      particleStateA = createDataTextureUint8(gl, data, cfg.particleRes, cfg.particleRes);
      fboA = createFramebuffer(gl, particleStateA);
      const data2 = encodeParticleStateUint8(count);
      particleStateB = createDataTextureUint8(gl, data2, cfg.particleRes, cfg.particleRes);
      fboB = createFramebuffer(gl, particleStateB);
    }

    readFromA = true;
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function initTrailTextures(width: number, height: number) {
    if (!gl) return;

    if (trailTexture0) gl.deleteTexture(trailTexture0);
    if (trailTexture1) gl.deleteTexture(trailTexture1);
    if (trailFBO0) gl.deleteFramebuffer(trailFBO0);
    if (trailFBO1) gl.deleteFramebuffer(trailFBO1);

    trailWidth = width;
    trailHeight = height;
    trailTexture0 = createTrailTexture(gl, width, height);
    trailFBO0 = createFramebuffer(gl, trailTexture0);
    trailTexture1 = createTrailTexture(gl, width, height);
    trailFBO1 = createFramebuffer(gl, trailTexture1);
    readFromTrail0 = true;

    // Clear both
    gl.bindFramebuffer(gl.FRAMEBUFFER, trailFBO0);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, trailFBO1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  const engine: ParticleEngine = {
    getMode() { return mode; },

    getDataBounds() {
      if (!hasBbox) return null;
      return { ...bbox };
    },

    init(canvas: HTMLCanvasElement) {
      if (destroyed) return;

      const existingGl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!existingGl) {
        console.error(`[ParticleEngine] ${cfg.id} Failed to get WebGL context`);
        mode = 'disabled';
        return;
      }
      gl = existingGl;

      // Check vertex texture support
      const maxVertexTextures = gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS);
      if (maxVertexTextures < 1) {
        console.warn(`[ParticleEngine] ${cfg.id} Vertex texture access not supported`);
        mode = 'disabled';
        return;
      }

      const isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
      const floatExt = isWebGL2 || gl.getExtension('OES_texture_float');
      gl.getExtension('OES_texture_float_linear');
      if (isWebGL2) gl.getExtension('EXT_color_buffer_float');

      // Determine mode
      if (userConfig.preferUint8) {
        mode = 'uint8';
      } else if (floatExt) {
        mode = 'float';
        try {
          const testData = new Float32Array(4 * 4 * 4);
          const testTex = createDataTextureFloat(gl, testData, 4, 4);
          const testFbo = createFramebuffer(gl, testTex);
          gl.bindFramebuffer(gl.FRAMEBUFFER, testFbo);
          const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.deleteTexture(testTex);
          gl.deleteFramebuffer(testFbo);
          if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Float FBO not complete');
        } catch {
          mode = 'uint8';
          while (gl.getError() !== gl.NO_ERROR) { /* drain */ }
        }
      } else {
        mode = 'uint8';
      }

      console.log(`[ParticleEngine] ${cfg.id} Using ${mode} mode${isWebGL2 ? ' (WebGL 2)' : ''}`);

      try {
        // Compile ALL programs eagerly — we own the GL context, no lazy compilation needed
        if (mode === 'float') {
          updateProgram = createProgram(gl, quadVert, updateFrag);
        } else {
          updateProgram = createProgram(gl, quadVert, updateFragUint8);
        }

        // Draw program — particles render in NDC, no projectTile needed
        const drawVertSrc = mode === 'float' ? drawVert : drawVertUint8;
        drawProgram = createProgram(gl, drawVertSrc, drawFrag);

        fadeProgram = createProgram(gl, fadeVert, fadeFrag);

        quadBuffer = createQuadBuffer(gl);
        indexBuffer = createParticleIndexBuffer(gl, cfg.particleRes);
        colorRampTexture = createColorRampTexture(gl, cfg.colorRamp);

        initParticleState();

        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;
        initTrailTextures(canvasWidth, canvasHeight);

        initialized = true;
        console.log(`[ParticleEngine] ${cfg.id} initialized with ${cfg.particleRes * cfg.particleRes} particles`);
      } catch (error) {
        console.error(`[ParticleEngine] ${cfg.id} Initialization failed:`, error);
        mode = 'disabled';
      }
    },

    updateVelocityData(data, width, height, minLon, minLat, maxLon, maxLat, newMaxSpeed) {
      if (destroyed || !gl || mode === 'disabled') return;

      if (windTexture) gl.deleteTexture(windTexture);

      if (mode === 'uint8') {
        if (data instanceof Uint8Array) {
          windTexture = createDataTextureUint8(gl, data, width, height, true);
        } else {
          const uint8Data = new Uint8Array(width * height * 4);
          const floatData = data as Float32Array;
          const ms = newMaxSpeed || 20;
          for (let i = 0; i < width * height; i++) {
            const u = floatData[i * 4];
            const v = floatData[i * 4 + 1];
            const speed = floatData[i * 4 + 2];
            const valid = floatData[i * 4 + 3];
            if (valid > 0) {
              uint8Data[i * 4] = Math.round(((u / ms) * 0.5 + 0.5) * 255);
              uint8Data[i * 4 + 1] = Math.round(((v / ms) * 0.5 + 0.5) * 255);
              uint8Data[i * 4 + 2] = Math.round((speed / ms) * 255);
              uint8Data[i * 4 + 3] = 255;
            }
          }
          windTexture = createDataTextureUint8(gl, uint8Data, width, height, true);
        }
      } else {
        windTexture = createDataTextureFloat(gl, data as Float32Array, width, height, true);
      }

      windWidth = width;
      windHeight = height;
      maxSpeed = newMaxSpeed || 20;

      // Reset particles if bbox changed significantly — coordinate shift OR area ratio
      const coordShift =
        Math.abs(bbox.minLon - minLon) > 0.5 ||
        Math.abs(bbox.maxLon - maxLon) > 0.5 ||
        Math.abs(bbox.minLat - minLat) > 0.5 ||
        Math.abs(bbox.maxLat - maxLat) > 0.5;

      // Area-ratio check: catches globe→city zoom where incremental steps are <0.5° each
      const oldArea = Math.max(0.001, (bbox.maxLon - bbox.minLon) * (bbox.maxLat - bbox.minLat));
      const newArea = Math.max(0.001, (maxLon - minLon) * (maxLat - minLat));
      const areaRatio = newArea / oldArea;
      const areaChanged = areaRatio < 0.5 || areaRatio > 2.0;

      const bboxChanged = coordShift || areaChanged;

      bbox = { minLon, minLat, maxLon, maxLat };
      hasBbox = true;

      if (bboxChanged) {
        initParticleState();
        if (trailFBO0 && trailFBO1) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, trailFBO0);
          gl.viewport(0, 0, trailWidth, trailHeight);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.bindFramebuffer(gl.FRAMEBUFFER, trailFBO1);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
      }
    },

    update() {
      if (destroyed || !initialized || !gl || gl.isContextLost() || !windTexture || !updateProgram || mode === 'disabled') return;

      const readTexture = readFromA ? particleStateA : particleStateB;
      const writeFBO = readFromA ? fboB : fboA;

      gl.bindFramebuffer(gl.FRAMEBUFFER, writeFBO);
      gl.viewport(0, 0, cfg.particleRes, cfg.particleRes);

      gl.useProgram(updateProgram);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, readTexture);
      gl.uniform1i(gl.getUniformLocation(updateProgram, 'u_particles'), 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, windTexture);
      gl.uniform1i(gl.getUniformLocation(updateProgram, 'u_wind'), 1);

      gl.uniform2f(gl.getUniformLocation(updateProgram, 'u_wind_res'), windWidth, windHeight);
      gl.uniform1f(gl.getUniformLocation(updateProgram, 'u_speed_factor'), cfg.speedFactor);
      gl.uniform1f(gl.getUniformLocation(updateProgram, 'u_drop_rate'), cfg.dropRate);
      gl.uniform1f(gl.getUniformLocation(updateProgram, 'u_drop_rate_bump'), cfg.dropRateBump);
      gl.uniform1f(gl.getUniformLocation(updateProgram, 'u_rand_seed'), Math.random());
      gl.uniform4f(gl.getUniformLocation(updateProgram, 'u_bbox'),
        bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat);
      gl.uniform2f(gl.getUniformLocation(updateProgram, 'u_particle_res'),
        cfg.particleRes, cfg.particleRes);
      gl.uniform1f(gl.getUniformLocation(updateProgram, 'u_max_speed'), maxSpeed);

      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);

      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      const posLoc = gl.getAttribLocation(updateProgram, 'a_pos');
      const texLoc = gl.getAttribLocation(updateProgram, 'a_texcoord');
      if (posLoc >= 0) {
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
      }
      if (texLoc >= 0) {
        gl.enableVertexAttribArray(texLoc);
        gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 16, 8);
      }

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      if (posLoc >= 0) gl.disableVertexAttribArray(posLoc);
      if (texLoc >= 0) gl.disableVertexAttribArray(texLoc);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, null);

      readFromA = !readFromA;
    },

    render() {
      if (destroyed || !initialized || !gl || gl.isContextLost() || !windTexture || !drawProgram || !fadeProgram || mode === 'disabled') return;

      const canvas = gl.canvas as HTMLCanvasElement;
      if (trailWidth !== canvas.width || trailHeight !== canvas.height) {
        initTrailTextures(canvas.width, canvas.height);
      }

      const currentParticles = readFromA ? particleStateA : particleStateB;
      const readTrailTex = readFromTrail0 ? trailTexture0 : trailTexture1;
      const writeTrailTex = readFromTrail0 ? trailTexture1 : trailTexture0;
      const writeTrailFBO = readFromTrail0 ? trailFBO1 : trailFBO0;

      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.STENCIL_TEST);

      const fadePosLoc = gl.getAttribLocation(fadeProgram, 'a_pos');
      const fadeTexLoc = gl.getAttribLocation(fadeProgram, 'a_texcoord');

      // ── STEP 1: Fade old trail → writeTrailFBO ──────────────────────
      gl.bindFramebuffer(gl.FRAMEBUFFER, writeTrailFBO);
      gl.viewport(0, 0, trailWidth, trailHeight);
      gl.disable(gl.BLEND);

      gl.useProgram(fadeProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, readTrailTex);
      gl.uniform1i(gl.getUniformLocation(fadeProgram, 'u_screen'), 0);
      gl.uniform1f(gl.getUniformLocation(fadeProgram, 'u_fade_opacity'), cfg.fadeOpacity);

      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.enableVertexAttribArray(fadePosLoc);
      gl.vertexAttribPointer(fadePosLoc, 2, gl.FLOAT, false, 16, 0);
      if (fadeTexLoc >= 0) {
        gl.enableVertexAttribArray(fadeTexLoc);
        gl.vertexAttribPointer(fadeTexLoc, 2, gl.FLOAT, false, 16, 8);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.disableVertexAttribArray(fadePosLoc);
      if (fadeTexLoc >= 0) gl.disableVertexAttribArray(fadeTexLoc);

      // ── STEP 2: Draw particles onto writeTrailFBO ───────────────────
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      gl.useProgram(drawProgram);

      const drawIndexLoc = gl.getAttribLocation(drawProgram, 'a_index');
      if (drawIndexLoc < 0) return;

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, currentParticles);
      gl.uniform1i(gl.getUniformLocation(drawProgram, 'u_particles'), 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, windTexture);
      gl.uniform1i(gl.getUniformLocation(drawProgram, 'u_wind'), 1);

      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, colorRampTexture);
      gl.uniform1i(gl.getUniformLocation(drawProgram, 'u_color_ramp'), 2);

      gl.uniform2f(gl.getUniformLocation(drawProgram, 'u_particles_res'),
        cfg.particleRes, cfg.particleRes);
      gl.uniform4f(gl.getUniformLocation(drawProgram, 'u_bbox'),
        bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat);
      gl.uniform1f(gl.getUniformLocation(drawProgram, 'u_point_size'), cfg.pointSize);
      gl.uniform1f(gl.getUniformLocation(drawProgram, 'u_max_speed'), maxSpeed);

      gl.bindBuffer(gl.ARRAY_BUFFER, indexBuffer);
      gl.enableVertexAttribArray(drawIndexLoc);
      gl.vertexAttribPointer(drawIndexLoc, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.POINTS, 0, cfg.particleRes * cfg.particleRes);
      gl.disableVertexAttribArray(drawIndexLoc);

      // Unbind textures
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, null);

      // ── STEP 3: Composite writeTrailTex → own canvas (default FBO) ──
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0.0, 0.0, 0.0, 0.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // Straight alpha — our canvas uses premultipliedAlpha: false
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      gl.useProgram(fadeProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, writeTrailTex);
      gl.uniform1i(gl.getUniformLocation(fadeProgram, 'u_screen'), 0);
      gl.uniform1f(gl.getUniformLocation(fadeProgram, 'u_fade_opacity'), 1.0);

      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.enableVertexAttribArray(fadePosLoc);
      gl.vertexAttribPointer(fadePosLoc, 2, gl.FLOAT, false, 16, 0);
      if (fadeTexLoc >= 0) {
        gl.enableVertexAttribArray(fadeTexLoc);
        gl.vertexAttribPointer(fadeTexLoc, 2, gl.FLOAT, false, 16, 8);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.disableVertexAttribArray(fadePosLoc);
      if (fadeTexLoc >= 0) gl.disableVertexAttribArray(fadeTexLoc);

      // Swap trail buffers
      readFromTrail0 = !readFromTrail0;
    },

    setFadeOpacity(value: number) {
      cfg.fadeOpacity = Math.max(0.95, Math.min(0.999, value));
    },

    setPointSize(value: number) {
      cfg.pointSize = Math.max(0.5, Math.min(5.0, value));
    },

    resetTrails() {
      if (destroyed || !gl || !trailFBO0 || !trailFBO1) return;
      gl.bindFramebuffer(gl.FRAMEBUFFER, trailFBO0);
      gl.viewport(0, 0, trailWidth, trailHeight);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, trailFBO1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      readFromTrail0 = true;
    },

    resetParticles() {
      if (destroyed || !gl || mode === 'disabled') return;
      initParticleState();
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      initialized = false;

      if (gl) {
        if (updateProgram) gl.deleteProgram(updateProgram);
        if (drawProgram) gl.deleteProgram(drawProgram);
        if (fadeProgram) gl.deleteProgram(fadeProgram);
        if (particleStateA) gl.deleteTexture(particleStateA);
        if (particleStateB) gl.deleteTexture(particleStateB);
        if (fboA) gl.deleteFramebuffer(fboA);
        if (fboB) gl.deleteFramebuffer(fboB);
        if (trailTexture0) gl.deleteTexture(trailTexture0);
        if (trailTexture1) gl.deleteTexture(trailTexture1);
        if (trailFBO0) gl.deleteFramebuffer(trailFBO0);
        if (trailFBO1) gl.deleteFramebuffer(trailFBO1);
        if (windTexture) gl.deleteTexture(windTexture);
        if (colorRampTexture) gl.deleteTexture(colorRampTexture);
        if (quadBuffer) gl.deleteBuffer(quadBuffer);
        if (indexBuffer) gl.deleteBuffer(indexBuffer);

        // Explicitly release WebGL context to prevent browser context exhaustion
        const loseCtx = gl.getExtension('WEBGL_lose_context');
        if (loseCtx) loseCtx.loseContext();
      }

      gl = null;
      mode = 'disabled';
      console.log(`[ParticleEngine] ${cfg.id} destroyed`);
    },
  };

  return engine;
}
