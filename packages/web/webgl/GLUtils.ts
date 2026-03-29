/**
 * GLUtils.ts - WebGL Utility Functions for Custom Layers
 * Phase 2: Wave Heatmap + Phase 3: GPGPU Particle System
 */

export function createShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compilation failed: ${info}`);
  }

  return shader;
}

export function createProgram(
  gl: WebGLRenderingContext,
  vertexSource: string,
  fragmentSource: string
): WebGLProgram {
  const vs = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);

  // CRITICAL: Bind attribute locations BEFORE linking for deterministic layout.
  // This prevents attribute location aliasing issues between different programs
  // and ensures MapLibre's own attributes don't collide with ours.
  // We scan the vertex source for known attribute names and assign fixed locations.
  if (vertexSource.includes('a_index')) {
    gl.bindAttribLocation(program, 0, 'a_index');
  }
  if (vertexSource.includes('a_pos')) {
    gl.bindAttribLocation(program, 0, 'a_pos');
  }
  if (vertexSource.includes('a_texcoord')) {
    gl.bindAttribLocation(program, 1, 'a_texcoord');
  }

  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program linking failed: ${info}`);
  }

  // Clean up individual shaders (they're now linked into program)
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  return program;
}

/**
 * Detect whether the given context is WebGL 2.
 * Used to select correct internal format for float textures (RGBA vs RGBA32F).
 */
export function isWebGL2Context(gl: WebGLRenderingContext): gl is WebGL2RenderingContext {
  return typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
}

/**
 * Get the correct internal format for RGBA float textures.
 * WebGL 1: gl.RGBA (with OES_texture_float extension)
 * WebGL 2: gl.RGBA32F (float textures are built-in, but require explicit sized format)
 *
 * Using gl.RGBA + gl.FLOAT on WebGL 2 causes GL_INVALID_OPERATION (silent failure).
 */
function getFloatInternalFormat(gl: WebGLRenderingContext): number {
  if (isWebGL2Context(gl)) {
    return (gl as WebGL2RenderingContext).RGBA32F;
  }
  return gl.RGBA;
}

/**
 * Create a data texture for GPGPU computation.
 * Uses NEAREST filtering (mandatory for data textures — LINEAR would interpolate encoded values).
 * Uses CLAMP_TO_EDGE (prevents wrap-around artifacts).
 */
export function createDataTexture(
  gl: WebGLRenderingContext,
  data: Float32Array | null,
  width: number,
  height: number
): WebGLTexture {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, getFloatInternalFormat(gl), width, height, 0, gl.RGBA, gl.FLOAT, data);
  return texture;
}

/**
 * Create a texture suitable for bilinear interpolation (like wave heatmap display).
 * Uses LINEAR filtering for smooth interpolation.
 */
export function createInterpolatedTexture(
  gl: WebGLRenderingContext,
  data: Float32Array | Uint8Array | null,
  width: number,
  height: number,
  isFloat: boolean = true
): WebGLTexture {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  if (isFloat) {
    gl.texImage2D(gl.TEXTURE_2D, 0, getFloatInternalFormat(gl), width, height, 0, gl.RGBA, gl.FLOAT, data as Float32Array);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data as Uint8Array);
  }

  return texture;
}

/**
 * Create a framebuffer object attached to a texture (for render-to-texture / ping-pong).
 */
export function createFramebuffer(
  gl: WebGLRenderingContext,
  texture: WebGLTexture
): WebGLFramebuffer {
  const fb = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error(`Framebuffer not complete: ${status}`);
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return fb;
}

/**
 * Create a fullscreen quad vertex buffer.
 * Used for GPGPU update passes and heatmap rendering.
 */
export function createQuadBuffer(gl: WebGLRenderingContext): WebGLBuffer {
  const buffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      // Two triangles forming a fullscreen quad
      // Position (xy)  Texcoord (uv)
      -1, -1,  0, 0,
       1, -1,  1, 0,
      -1,  1,  0, 1,
      -1,  1,  0, 1,
       1, -1,  1, 0,
       1,  1,  1, 1,
    ]),
    gl.STATIC_DRAW
  );
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  return buffer;
}

/**
 * Create the particle index buffer for vertex pulling.
 * Each particle gets a unique 2D index used to look up its position in the state texture.
 */
export function createParticleIndexBuffer(
  gl: WebGLRenderingContext,
  particleRes: number
): WebGLBuffer {
  const indices = new Float32Array(particleRes * particleRes * 2);
  for (let y = 0; y < particleRes; y++) {
    for (let x = 0; x < particleRes; x++) {
      const i = (y * particleRes + x) * 2;
      indices[i] = x;
      indices[i + 1] = y;
    }
  }
  const buffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  return buffer;
}

