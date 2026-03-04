/**
 * ParticleEngine.ts - Reusable GPGPU Particle System for MapLibre
 * Supports both Float32 textures (OES_texture_float) and Uint8 fallback (R8G8B8A8 encoding)
 *
 * ARCHITECTURE:
 *   prerender() - GPGPU update pass (ping-pong framebuffer swap)
 *   render()    - Draw particles to screen
 *
 * FALLBACK MODES:
 *   1. Float32 textures (full precision, requires OES_texture_float)
 *   2. Uint8 textures (16-bit encoded, universal WebGL support)
 */

import type maplibregl from 'maplibre-gl';
import {
  createProgram,
  createFramebuffer,
  createQuadBuffer,
  createParticleIndexBuffer,
  saveGLState,
  restoreGLState,
  type GLState,
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
  particleRes?: number;           // Side length of particle state texture (e.g. 256 = 65K particles)
  speedFactor?: number;           // Movement speed multiplier
  fadeOpacity?: number;           // Trail persistence (0.96 = long trails, 0.99 = short trails)
  dropRate?: number;              // Base particle reset rate
  dropRateBump?: number;          // Additional reset rate for fast particles
  pointSize?: number;             // Particle size in pixels
  colorRamp?: [number, number, number, number][]; // RGBA color stops
  preferUint8?: boolean;          // Force Uint8 mode even if float is available
}

// Determine optimal particle resolution based on device capabilities.
// Uses proper mobile/low-end detection from DeviceCapabilities (user-agent +
// touch points + screen size) instead of devicePixelRatio, which incorrectly
// classified standard 1080p desktops (DPR = 1.0) as mobile-tier.
function getDefaultParticleRes(): number {
  if (typeof window === 'undefined') return 256;
  // Low-end phones/tablets → 128×128 = 16K particles (saves GPU memory)
  if (isLowEndDevice()) return 128;
  // Mobile (phones / small tablets) → 256×256 = 65K particles
  if (isMobileDevice()) return 256;
  // Desktop / laptop / large tablet → 512×512 = 262,144 particles
  return 512;
}

const DEFAULTS: Required<Omit<ParticleEngineConfig, 'id' | 'preferUint8'>> = {
  particleRes: getDefaultParticleRes(),
  speedFactor: 1.5,
  fadeOpacity: 0.97,   // Higher = longer trails. 0.97 = distinct clean trails at 262k particles.
                       // (0.9965 produced multi-hundred-frame smearing at full particle count;
                       //  do NOT go below 0.97 — that makes trails look like buzzing dots)
  dropRate: 0.002,
  dropRateBump: 0.008,
  pointSize: 2.8,      // Slightly larger base for better visibility on 4K/HiDPI
  colorRamp: WIND_COLORS,
};

export interface ParticleLayer extends maplibregl.CustomLayerInterface {
  updateVelocityData: (
    data: Float32Array | Uint8Array,
    width: number,
    height: number,
    minLon: number,
    minLat: number,
    maxLon: number,
    maxLat: number,
    maxSpeed: number
  ) => void;
  setVisibility: (visible: boolean) => void;
  getMode: () => ParticleMode;
}

// ============================================================
// R8G8B8A8 ENCODING UTILITIES (JavaScript side)
// Must match GLSL encode/decode functions exactly
//
// Encoding scheme: Store 16-bit value as two 8-bit bytes
// value in [0, 1] → scale to [0, 65535] → split into [low, high]
// where reconstructed_value = low + high * 256
// ============================================================
const BASE = 256.0;       // Use 256 for proper byte encoding (0-255 range)
const OFFSET = 32768.0;   // Midpoint for signed values
const POS_SCALE = 32767.0; // Max positive value in 16-bit signed

function encodeFloat(value: number, scale: number): [number, number] {
  // Map value from [-0.5, 0.5] range to [0, 65535] uint16 range
  let v = value * scale + OFFSET;
  v = Math.max(0, Math.min(65535, v));

  // Split into low byte (0-255) and high byte (0-255)
  const low = Math.floor(v) % 256;
  const high = Math.floor(v / 256);

  return [low, high];
}

function encodeParticleStateUint8(count: number): Uint8Array {
  const data = new Uint8Array(count * 4);

  for (let i = 0; i < count; i++) {
    const x = Math.random();
    const y = Math.random();

    // Encode position (x in RG, y in BA)
    const [xLow, xHigh] = encodeFloat(x - 0.5, POS_SCALE);
    const [yLow, yHigh] = encodeFloat(y - 0.5, POS_SCALE);

    data[i * 4 + 0] = Math.round(xLow);
    data[i * 4 + 1] = Math.round(xHigh);
    data[i * 4 + 2] = Math.round(yLow);
    data[i * 4 + 3] = Math.round(yHigh);
  }

  return data;
}

// ============================================================
// TEXTURE CREATION HELPERS
// ============================================================
// useLinear = false  → gl.NEAREST (GPGPU particle state — encoded values must NOT be interpolated)
// useLinear = true   → gl.LINEAR  (wind/velocity field — smooth bilinear interpolation between grid cells)
function createDataTextureFloat(
  gl: WebGLRenderingContext,
  data: Float32Array | null,
  width: number,
  height: number,
  useLinear = false
): WebGLTexture {
  const filter = useLinear ? gl.LINEAR : gl.NEAREST;
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.FLOAT, data);
  return texture;
}

function createDataTextureUint8(
  gl: WebGLRenderingContext,
  data: Uint8Array | null,
  width: number,
  height: number,
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

/**
 * Create a trail texture for screen-space particle trails.
 * Uses LINEAR filtering for smooth fade effect.
 */
function createTrailTexture(
  gl: WebGLRenderingContext,
  width: number,
  height: number
): WebGLTexture {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  // Initialize with transparent black
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  return texture;
}

/**
 * Creates a reusable GPGPU particle layer for MapLibre.
 * Automatically selects Float32 or Uint8 mode based on device capabilities.
 */
export function createParticleLayer(userConfig: ParticleEngineConfig): ParticleLayer {
  const cfg = { ...DEFAULTS, ...userConfig };

  let map: maplibregl.Map;
  let gl: WebGLRenderingContext;
  let isVisible = true;
  let mode: ParticleMode = 'disabled';
  let debugFrameCount = 0;

  // Shader programs (will use either float or uint8 versions)
  let updateProgram: WebGLProgram | null = null;
  let drawProgram: WebGLProgram | null = null;
  let fadeProgram: WebGLProgram | null = null;

  // Ping-pong particle state textures + FBOs
  let particleStateA: WebGLTexture | null = null;
  let particleStateB: WebGLTexture | null = null;
  let fboA: WebGLFramebuffer | null = null;
  let fboB: WebGLFramebuffer | null = null;
  let readFromA = true;

  // Trail textures (double-buffered screen-space textures for fade effect)
  let trailTexture0: WebGLTexture | null = null;
  let trailTexture1: WebGLTexture | null = null;
  let trailFramebuffer0: WebGLFramebuffer | null = null;
  let trailFramebuffer1: WebGLFramebuffer | null = null;
  let trailTextureWidth = 0;
  let trailTextureHeight = 0;
  let readFromTrail0 = true;

  // Velocity data texture (always Float32 from CPU, but may be converted)
  let windTexture: WebGLTexture | null = null;
  let windWidth = 0;
  let windHeight = 0;

  // Color ramp
  let colorRampTexture: WebGLTexture | null = null;

  // Geometry buffers
  let quadBuffer: WebGLBuffer | null = null;
  let indexBuffer: WebGLBuffer | null = null;

  // Data bounds
  let bbox = { minLon: 30, minLat: 29, maxLon: 37, maxLat: 35 };
  let maxSpeed = 20;

  // Track initialization
  let initialized = false;

  function initParticleStateFloat() {
    if (!gl || mode !== 'float') return;

    const count = cfg.particleRes * cfg.particleRes;
    const data = new Float32Array(count * 4);

    for (let i = 0; i < count; i++) {
      data[i * 4 + 0] = Math.random(); // X position
      data[i * 4 + 1] = Math.random(); // Y position
      data[i * 4 + 2] = Math.random(); // Starting age
      data[i * 4 + 3] = 0.0;           // Speed
    }

    if (particleStateA) gl.deleteTexture(particleStateA);
    if (particleStateB) gl.deleteTexture(particleStateB);
    if (fboA) gl.deleteFramebuffer(fboA);
    if (fboB) gl.deleteFramebuffer(fboB);

    particleStateA = createDataTextureFloat(gl, data, cfg.particleRes, cfg.particleRes);
    fboA = createFramebuffer(gl, particleStateA);
    particleStateB = createDataTextureFloat(gl, data, cfg.particleRes, cfg.particleRes);
    fboB = createFramebuffer(gl, particleStateB);
    readFromA = true;

    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function initParticleStateUint8() {
    if (!gl || mode !== 'uint8') return;

    const count = cfg.particleRes * cfg.particleRes;
    const data = encodeParticleStateUint8(count);

    if (particleStateA) gl.deleteTexture(particleStateA);
    if (particleStateB) gl.deleteTexture(particleStateB);
    if (fboA) gl.deleteFramebuffer(fboA);
    if (fboB) gl.deleteFramebuffer(fboB);

    particleStateA = createDataTextureUint8(gl, data, cfg.particleRes, cfg.particleRes);
    fboA = createFramebuffer(gl, particleStateA);

    // Create a copy for ping-pong
    const data2 = encodeParticleStateUint8(count);
    particleStateB = createDataTextureUint8(gl, data2, cfg.particleRes, cfg.particleRes);
    fboB = createFramebuffer(gl, particleStateB);
    readFromA = true;

    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function initParticleState() {
    if (mode === 'float') {
      initParticleStateFloat();
    } else if (mode === 'uint8') {
      initParticleStateUint8();
    }
  }

  /**
   * Initialize or resize trail textures to match canvas size.
   * Called on initialization and when canvas resizes.
   */
  function initTrailTextures(width: number, height: number) {
    if (!gl) return;

    // Clean up existing textures
    if (trailTexture0) gl.deleteTexture(trailTexture0);
    if (trailTexture1) gl.deleteTexture(trailTexture1);
    if (trailFramebuffer0) gl.deleteFramebuffer(trailFramebuffer0);
    if (trailFramebuffer1) gl.deleteFramebuffer(trailFramebuffer1);

    // Create new trail textures at canvas size
    trailTextureWidth = width;
    trailTextureHeight = height;

    trailTexture0 = createTrailTexture(gl, width, height);
    trailFramebuffer0 = createFramebuffer(gl, trailTexture0);

    trailTexture1 = createTrailTexture(gl, width, height);
    trailFramebuffer1 = createFramebuffer(gl, trailTexture1);

    readFromTrail0 = true;

    // Clear both trail textures to transparent black
    const saved = saveGLState(gl);
    gl.bindFramebuffer(gl.FRAMEBUFFER, trailFramebuffer0);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, trailFramebuffer1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    restoreGLState(gl, saved);

    console.log(`[ParticleEngine] Trail textures initialized (${width}x${height})`);
  }

  const layer: ParticleLayer = {
    id: cfg.id,
    type: 'custom' as const,
    renderingMode: '2d' as const,

    getMode() {
      return mode;
    },

    updateVelocityData(data, width, height, minLon, minLat, maxLon, maxLat, newMaxSpeed) {
      if (!gl || mode === 'disabled') return;

      if (windTexture) gl.deleteTexture(windTexture);

      // Create wind texture based on current mode and data type
      if (mode === 'uint8') {
        // In uint8 mode, we MUST use Uint8 textures (device doesn't support float)
        if (data instanceof Uint8Array) {
          // useLinear=true: wind field is a continuous scalar field — bilinear
          // interpolation between grid cells produces smooth particle trajectories.
          // NEAREST would create discrete grid-snapping ("cubicle" blocky movement).
          windTexture = createDataTextureUint8(gl, data, width, height, true);
        } else {
          // Convert Float32Array to Uint8Array with normalized encoding
          // This handles the case where caller passes Float32Array in uint8 mode
          const uint8Data = new Uint8Array(width * height * 4);
          const floatData = data as Float32Array;
          const ms = newMaxSpeed || 20;

          for (let i = 0; i < width * height; i++) {
            const u = floatData[i * 4];
            const v = floatData[i * 4 + 1];
            const speed = floatData[i * 4 + 2];
            const valid = floatData[i * 4 + 3];

            if (valid > 0) {
              // Normalize U and V: [-maxSpeed, maxSpeed] -> [0, 255]
              uint8Data[i * 4] = Math.round(((u / ms) * 0.5 + 0.5) * 255);
              uint8Data[i * 4 + 1] = Math.round(((v / ms) * 0.5 + 0.5) * 255);
              uint8Data[i * 4 + 2] = Math.round((speed / ms) * 255);
              uint8Data[i * 4 + 3] = 255;
            } else {
              uint8Data[i * 4] = 0;
              uint8Data[i * 4 + 1] = 0;
              uint8Data[i * 4 + 2] = 0;
              uint8Data[i * 4 + 3] = 0;
            }
          }
          windTexture = createDataTextureUint8(gl, uint8Data, width, height, true); // LINEAR for smooth advection
        }
        console.log('[ParticleEngine] Wind texture created as Uint8 (LINEAR filter)');
      } else {
        // Float mode - use float texture with LINEAR for smooth bilinear wind sampling
        windTexture = createDataTextureFloat(gl, data as Float32Array, width, height, true);
        console.log('[ParticleEngine] Wind texture created as Float32');
      }

      windWidth = width;
      windHeight = height;
      maxSpeed = newMaxSpeed || 20;

      // Only reset particles if bbox has changed significantly (map panned far).
      // DO NOT reset particles on every data refresh — that causes a solid-color
      // "wash" as 65k particles all start from random positions simultaneously,
      // flooding the trail FBO with a uniform block of color.
      const bboxChanged =
        Math.abs(bbox.minLon - minLon) > 0.5 ||
        Math.abs(bbox.maxLon - maxLon) > 0.5 ||
        Math.abs(bbox.minLat - minLat) > 0.5 ||
        Math.abs(bbox.maxLat - maxLat) > 0.5;

      bbox = { minLon, minLat, maxLon, maxLat };

      if (bboxChanged) {
        // Map has panned significantly — reset particle positions so they
        // start within the new visible region rather than outside it.
        initParticleState();
        // Also clear trails to avoid showing stale trails from old location
        if (trailFramebuffer0 && trailFramebuffer1) {
          const savedFB = gl.getParameter(gl.FRAMEBUFFER_BINDING);
          const savedVP = gl.getParameter(gl.VIEWPORT);
          gl.bindFramebuffer(gl.FRAMEBUFFER, trailFramebuffer0);
          gl.viewport(0, 0, trailTextureWidth, trailTextureHeight);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.bindFramebuffer(gl.FRAMEBUFFER, trailFramebuffer1);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.bindFramebuffer(gl.FRAMEBUFFER, savedFB);
          gl.viewport(savedVP[0], savedVP[1], savedVP[2], savedVP[3]);
        }
      }

      if (map) map.triggerRepaint();
    },

    setVisibility(visible: boolean) {
      isVisible = visible;
      if (map) map.triggerRepaint();
    },

    onAdd(mapInstance, glContext) {
      map = mapInstance;
      gl = glContext;

      // Check vertex texture support (required for both modes)
      const maxVertexTextures = gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS);
      if (maxVertexTextures < 1) {
        console.warn('[ParticleEngine] Vertex texture access not supported - disabled');
        mode = 'disabled';
        return;
      }

      // Check for float texture support
      const floatExt = gl.getExtension('OES_texture_float');

      // Determine mode
      if (userConfig.preferUint8) {
        mode = 'uint8';
        console.log('[ParticleEngine] Using Uint8 mode (forced)');
      } else if (floatExt) {
        // Try float mode first, verify FBO completeness
        mode = 'float';
        try {
          // Test if we can render to float textures
          const testData = new Float32Array(4 * 4 * 4);
          const testTex = createDataTextureFloat(gl, testData, 4, 4);
          const testFbo = createFramebuffer(gl, testTex);

          gl.bindFramebuffer(gl.FRAMEBUFFER, testFbo);
          const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);

          gl.deleteTexture(testTex);
          gl.deleteFramebuffer(testFbo);

          if (status !== gl.FRAMEBUFFER_COMPLETE) {
            throw new Error('Float FBO not complete');
          }
          console.log('[ParticleEngine] Using Float32 mode');
        } catch {
          mode = 'uint8';
          console.log('[ParticleEngine] Float32 FBO failed, falling back to Uint8 mode');
        }
      } else {
        mode = 'uint8';
        console.log('[ParticleEngine] OES_texture_float not supported, using Uint8 mode');
      }

      try {
        // Create shader programs based on mode
        if (mode === 'float') {
          updateProgram = createProgram(gl, quadVert, updateFrag);
          drawProgram = createProgram(gl, drawVert, drawFrag);
        } else if (mode === 'uint8') {
          updateProgram = createProgram(gl, quadVert, updateFragUint8);
          drawProgram = createProgram(gl, drawVertUint8, drawFrag);
        }

        // Create fade program (same for both modes)
        fadeProgram = createProgram(gl, fadeVert, fadeFrag);

        // Create geometry
        quadBuffer = createQuadBuffer(gl);
        indexBuffer = createParticleIndexBuffer(gl, cfg.particleRes);

        // Create color ramp
        colorRampTexture = createColorRampTexture(gl, cfg.colorRamp);

        // Initialize particle state
        initParticleState();

        // Initialize trail textures at current canvas size
        const canvasWidth = gl.canvas.width;
        const canvasHeight = gl.canvas.height;
        initTrailTextures(canvasWidth, canvasHeight);

        initialized = true;
        console.log(`[ParticleEngine] ${cfg.id} initialized (${mode} mode) with ${cfg.particleRes * cfg.particleRes} particles`);
      } catch (error) {
        console.error('[ParticleEngine] Initialization failed:', error);
        mode = 'disabled';
      }
    },

    // PRERENDER: GPGPU update pass (ping-pong particle positions)
    prerender(_glContext, _args) {
      if (!initialized || !windTexture || !updateProgram || !isVisible || mode === 'disabled') return;

      const saved = saveGLState(gl);

      try {
        const readTexture = readFromA ? particleStateA : particleStateB;
        const writeFBO = readFromA ? fboB : fboA;

        // Disable all attribs to prevent MapLibre state leakage
        const maxAttribsPre = gl.getParameter(gl.MAX_VERTEX_ATTRIBS) as number;
        for (let i = 0; i < maxAttribsPre; i++) {
          gl.disableVertexAttribArray(i);
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, writeFBO);
        gl.viewport(0, 0, cfg.particleRes, cfg.particleRes);

        gl.useProgram(updateProgram);

        // Bind particle state texture (read)
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, readTexture);
        gl.uniform1i(gl.getUniformLocation(updateProgram, 'u_particles'), 0);

        // Bind wind velocity texture
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, windTexture);
        gl.uniform1i(gl.getUniformLocation(updateProgram, 'u_wind'), 1);

        // Set uniforms
        gl.uniform2f(gl.getUniformLocation(updateProgram, 'u_wind_res'), windWidth, windHeight);
        gl.uniform1f(gl.getUniformLocation(updateProgram, 'u_speed_factor'), cfg.speedFactor);
        gl.uniform1f(gl.getUniformLocation(updateProgram, 'u_drop_rate'), cfg.dropRate);
        gl.uniform1f(gl.getUniformLocation(updateProgram, 'u_drop_rate_bump'), cfg.dropRateBump);
        gl.uniform1f(gl.getUniformLocation(updateProgram, 'u_rand_seed'), Math.random());
        gl.uniform4f(
          gl.getUniformLocation(updateProgram, 'u_bbox'),
          bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat
        );
        gl.uniform2f(
          gl.getUniformLocation(updateProgram, 'u_particle_res'),
          cfg.particleRes, cfg.particleRes
        );
        // Pass max speed for wind texture decoding (uint8) and dynamic color normalization (float)
        gl.uniform1f(gl.getUniformLocation(updateProgram, 'u_max_speed'), maxSpeed);

        // Draw fullscreen quad for GPGPU update
        gl.disable(gl.BLEND);
        gl.disable(gl.DEPTH_TEST);

        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        const posLoc = gl.getAttribLocation(updateProgram!, 'a_pos');
        const texLoc = gl.getAttribLocation(updateProgram!, 'a_texcoord');
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

        // Unbind textures
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, null);

        // Swap buffers
        readFromA = !readFromA;
      } catch (error) {
        console.error('[ParticleEngine] Update pass failed:', error);
      }

      restoreGLState(gl, saved);
    },

    // RENDER: Draw particles with trail effect
    // Algorithm follows mapbox/webgl-wind: double-buffered screen-space trail accumulation
    render(_glContext, args) {
      if (!initialized || !windTexture || !drawProgram || !fadeProgram || !isVisible || mode === 'disabled') return;

      // Check if trail textures need resizing (canvas size changed)
      const canvasWidth = gl.canvas.width;
      const canvasHeight = gl.canvas.height;
      if (trailTextureWidth !== canvasWidth || trailTextureHeight !== canvasHeight) {
        initTrailTextures(canvasWidth, canvasHeight);
      }

      const saved = saveGLState(gl);

      // CRITICAL: Save MapLibre's framebuffer — it may NOT be null!
      const maplibreFBO = gl.getParameter(gl.FRAMEBUFFER_BINDING);

      try {
        // CRITICAL: Disable depth test at the absolute top of render() so particles
        // are never occluded by MapLibre's 3D depth buffer, regardless of which code
        // path executes. Must come AFTER saveGLState() so the original MapLibre depth
        // state is correctly captured and restored on exit.
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.STENCIL_TEST);

        const currentParticles = readFromA ? particleStateA : particleStateB;
        const readTrailTexture = readFromTrail0 ? trailTexture0 : trailTexture1;
        const writeTrailTexture = readFromTrail0 ? trailTexture1 : trailTexture0;
        const writeTrailFBO = readFromTrail0 ? trailFramebuffer1 : trailFramebuffer0;

        // --- Extract projection matrix ---
        let matrix: Float32Array | Float64Array | number[] | null = null;

        if (args && typeof args === 'object') {
          if ('defaultProjectionData' in args && (args as any).defaultProjectionData?.mainMatrix) {
            matrix = (args as any).defaultProjectionData.mainMatrix;
          } else if ('projectionMatrix' in args && args.projectionMatrix) {
            matrix = args.projectionMatrix as Float32Array;
          }
        }

        if (!matrix) {
          if (debugFrameCount < 5) {
            console.warn('[ParticleEngine] No projection matrix available, args keys:', args ? Object.keys(args) : 'null');
          }
          restoreGLState(gl, saved);
          return;
        }

        const float32Matrix = matrix instanceof Float32Array
          ? matrix
          : new Float32Array(matrix);

        // ===================================================================
        // Query attribute locations fresh each frame (cheap, but bulletproof).
        // These come from bindAttribLocation in createProgram:
        //   fadeProgram:  a_pos → 0, a_texcoord → 1
        //   drawProgram:  a_index → 0
        // ===================================================================
        const fadePosLoc = gl.getAttribLocation(fadeProgram!, 'a_pos');
        const fadeTexLoc = gl.getAttribLocation(fadeProgram!, 'a_texcoord');
        const drawIndexLoc = gl.getAttribLocation(drawProgram!, 'a_index');

        // Get max attribs once for reuse
        const maxAttribs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS) as number;

        // Diagnostic logging (first 3 frames only)
        const isDebugFrame = debugFrameCount < 3;
        if (isDebugFrame) {
          console.log(`[ParticleEngine] ${cfg.id} RENDER frame #${debugFrameCount}`,
            '\n  matrix[0]:', float32Matrix[0].toFixed(2),
            'bbox:', JSON.stringify(bbox), 'maxSpeed:', maxSpeed,
            '\n  attribs: fadePosLoc=', fadePosLoc, 'fadeTexLoc=', fadeTexLoc, 'drawIndexLoc=', drawIndexLoc,
            '\n  textures: particles=', !!currentParticles, 'wind=', !!windTexture, 'colorRamp=', !!colorRampTexture,
            '\n  trails: read=', !!readTrailTexture, 'write=', !!writeTrailTexture, 'writeFBO=', !!writeTrailFBO,
            '\n  maplibreFBO:', maplibreFBO === null ? 'null (expected - canvas default in 2D mode)' : maplibreFBO, 'canvas:', canvasWidth, 'x', canvasHeight,
            '\n  particleRes:', cfg.particleRes, 'numParticles:', cfg.particleRes * cfg.particleRes);
        }

        if (drawIndexLoc < 0) {
          console.error(`[ParticleEngine] FATAL: a_index not found in draw program! Shader may have optimized it out. Aborting render.`);
          restoreGLState(gl, saved);
          return;
        }

        // ===================================================================
        // HELPER: Disable ALL vertex attribs + unbind ALL texture units
        // Called before every draw phase to guarantee zero stale state.
        // This is the "nuclear" reset that prevents attribute leaking between
        // the fade quad and particle draw passes.
        // ===================================================================
        function resetAllGLState() {
          // Disable every vertex attrib array
          for (let i = 0; i < maxAttribs; i++) {
            gl.disableVertexAttribArray(i);
          }
          // Unbind all texture units we use (0, 1, 2)
          gl.activeTexture(gl.TEXTURE2);
          gl.bindTexture(gl.TEXTURE_2D, null);
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, null);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, null);
          // Unbind array buffer
          gl.bindBuffer(gl.ARRAY_BUFFER, null);
          // Unbind active program so MapLibre's tile shaders cannot accidentally
          // inherit our program state. restoreGLState() will re-bind the correct
          // MapLibre program afterward — this null is just a safety firewall.
          gl.useProgram(null);
        }

        // Targeted attrib-only nuclear reset — called immediately BEFORE and AFTER
        // every gl.drawArrays() call to prevent vertex attrib state leaking between
        // the fade quad, particle POINTS, and composite quad passes in the shared
        // MapLibre WebGL context. Separate from resetAllGLState so texture unbinds
        // can be managed explicitly per-pass without double-nulling active textures.
        const disableAllAttribs = () => {
          for (let i = 0; i < maxAttribs; i++) {
            gl.disableVertexAttribArray(i);
          }
        };

        // ===================================================================
        // INITIAL STATE: Full nuclear reset before any drawing
        // (gl.DEPTH_TEST + gl.STENCIL_TEST already disabled at top of try block)
        // ===================================================================
        resetAllGLState();

        // ===================================================================
        // STEP 1: Draw faded previous trail into the WRITE trail FBO
        // Renders readTrailTexture → writeTrailFBO with fade opacity.
        // No blending — this is an opaque write of the faded old trail.
        // ===================================================================
        gl.bindFramebuffer(gl.FRAMEBUFFER, writeTrailFBO);
        gl.viewport(0, 0, trailTextureWidth, trailTextureHeight);
        gl.disable(gl.BLEND);

        gl.useProgram(fadeProgram);

        // Bind ONLY the read trail texture to unit 0
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, readTrailTexture);
        gl.uniform1i(gl.getUniformLocation(fadeProgram!, 'u_screen'), 0);
        gl.uniform1f(gl.getUniformLocation(fadeProgram!, 'u_fade_opacity'), cfg.fadeOpacity);

        // Bind quad buffer and set up attribs for fade pass
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        disableAllAttribs(); // nuclear attrib reset BEFORE enabling only what this pass needs
        gl.enableVertexAttribArray(fadePosLoc);
        gl.vertexAttribPointer(fadePosLoc, 2, gl.FLOAT, false, 16, 0);
        if (fadeTexLoc >= 0) {
          gl.enableVertexAttribArray(fadeTexLoc);
          gl.vertexAttribPointer(fadeTexLoc, 2, gl.FLOAT, false, 16, 8);
        }

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        disableAllAttribs(); // nuclear attrib reset IMMEDIATELY after draw

        // CRITICAL: Full texture + buffer reset after fade quad draw
        resetAllGLState();

        // ===================================================================
        // STEP 2: Draw current particles ON TOP of the faded trail
        // Still rendering into writeTrailFBO.
        // Standard alpha blend (SRC_ALPHA, ONE_MINUS_SRC_ALPHA):
        // Each particle dot feathers onto the trail FBO with proper alpha compositing.
        // Note: Additive blending (ONE) was tested but with 262k particles the FBO
        // saturates to solid white blocks within seconds — 262k particles per frame
        // accumulate too fast for the fade-decay to keep up. Standard blend keeps
        // colors accurate and prevents blow-out.
        // ===================================================================
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        gl.useProgram(drawProgram);

        // Texture unit 0: particle state (positions)
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, currentParticles);
        gl.uniform1i(gl.getUniformLocation(drawProgram!, 'u_particles'), 0);

        // Texture unit 1: wind velocity data (NOT unit 0 — prevents conflict with particles)
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, windTexture);
        gl.uniform1i(gl.getUniformLocation(drawProgram!, 'u_wind'), 1);

        // Texture unit 2: color ramp (256×1)
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, colorRampTexture);
        gl.uniform1i(gl.getUniformLocation(drawProgram!, 'u_color_ramp'), 2);

        // Set draw uniforms
        gl.uniform2f(
          gl.getUniformLocation(drawProgram!, 'u_particles_res'),
          cfg.particleRes, cfg.particleRes
        );
        gl.uniformMatrix4fv(
          gl.getUniformLocation(drawProgram!, 'u_matrix'),
          false,
          float32Matrix
        );
        gl.uniform4f(
          gl.getUniformLocation(drawProgram!, 'u_bbox'),
          bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat
        );
        gl.uniform1f(gl.getUniformLocation(drawProgram!, 'u_point_size'), cfg.pointSize);
        gl.uniform1f(gl.getUniformLocation(drawProgram!, 'u_max_speed'), maxSpeed);

        // Bind the PARTICLE INDEX buffer (NOT the quad buffer!)
        gl.bindBuffer(gl.ARRAY_BUFFER, indexBuffer);
        disableAllAttribs(); // nuclear attrib reset BEFORE enabling only what this pass needs
        gl.enableVertexAttribArray(drawIndexLoc);
        gl.vertexAttribPointer(drawIndexLoc, 2, gl.FLOAT, false, 0, 0);

        // Draw particles as POINTS
        gl.drawArrays(gl.POINTS, 0, cfg.particleRes * cfg.particleRes);
        disableAllAttribs(); // nuclear attrib reset IMMEDIATELY after draw

        // CRITICAL: Full texture + buffer reset after particle draw
        resetAllGLState();

        // ===================================================================
        // STEP 3: Composite trail texture onto MapLibre's canvas
        // CRITICAL texture isolation: explicitly null units 1 and 2 so the
        // wind data texture CANNOT be sampled by the composite quad's fadeProgram.
        // Root cause of "colored cubicles": windTexture leaking on TEXTURE1/2
        // into MapLibre's next tile render pass via the shared WebGL context.
        // ===================================================================
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, null);
        // Unit 0 is the ONLY texture the composite quad samples — the write trail
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, writeTrailTexture);

        gl.bindFramebuffer(gl.FRAMEBUFFER, maplibreFBO);
        gl.viewport(saved.viewport[0], saved.viewport[1], saved.viewport[2], saved.viewport[3]);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied alpha composite over MapLibre tiles
        gl.disable(gl.DEPTH_TEST);

        gl.useProgram(fadeProgram);
        gl.uniform1i(gl.getUniformLocation(fadeProgram!, 'u_screen'), 0);
        gl.uniform1f(gl.getUniformLocation(fadeProgram!, 'u_fade_opacity'), 1.0);

        // Bind quad buffer and set up attribs for composite pass
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        disableAllAttribs(); // nuclear attrib reset BEFORE enabling only what this pass needs
        gl.enableVertexAttribArray(fadePosLoc);
        gl.vertexAttribPointer(fadePosLoc, 2, gl.FLOAT, false, 16, 0);
        if (fadeTexLoc >= 0) {
          gl.enableVertexAttribArray(fadeTexLoc);
          gl.vertexAttribPointer(fadeTexLoc, 2, gl.FLOAT, false, 16, 8);
        }

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        disableAllAttribs(); // nuclear attrib reset IMMEDIATELY after draw

        // ===================================================================
        // STEP 4: Final nuclear cleanup and swap trail buffers
        // ===================================================================
        resetAllGLState();

        gl.disable(gl.BLEND);
        gl.disable(gl.DEPTH_TEST);

        // Swap trail double buffer
        readFromTrail0 = !readFromTrail0;

        if (isDebugFrame) {
          debugFrameCount++;
        }

      } catch (error) {
        console.error('[ParticleEngine] Render failed:', error);
      }

      restoreGLState(gl, saved);

      if (isVisible) {
        map.triggerRepaint();
      }
    },

    onRemove() {
      if (updateProgram) gl.deleteProgram(updateProgram);
      if (drawProgram) gl.deleteProgram(drawProgram);
      if (fadeProgram) gl.deleteProgram(fadeProgram);
      if (particleStateA) gl.deleteTexture(particleStateA);
      if (particleStateB) gl.deleteTexture(particleStateB);
      if (fboA) gl.deleteFramebuffer(fboA);
      if (fboB) gl.deleteFramebuffer(fboB);
      if (trailTexture0) gl.deleteTexture(trailTexture0);
      if (trailTexture1) gl.deleteTexture(trailTexture1);
      if (trailFramebuffer0) gl.deleteFramebuffer(trailFramebuffer0);
      if (trailFramebuffer1) gl.deleteFramebuffer(trailFramebuffer1);
      if (windTexture) gl.deleteTexture(windTexture);
      if (colorRampTexture) gl.deleteTexture(colorRampTexture);
      if (quadBuffer) gl.deleteBuffer(quadBuffer);
      if (indexBuffer) gl.deleteBuffer(indexBuffer);
      initialized = false;
    },
  };

  return layer;
}

export type { ParticleLayer as ParticleLayerType };
