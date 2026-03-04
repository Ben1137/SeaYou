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
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.FLOAT, data);
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
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.FLOAT, data as Float32Array);
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

/**
 * Save and restore MapLibre's GL state around custom rendering.
 * Call saveGLState before your custom rendering, restoreGLState after.
 * CRITICAL: Must save ALL state that our custom rendering touches,
 * otherwise MapLibre's rendering breaks.
 */
export interface GLState {
  program: WebGLProgram | null;
  activeTexture: number;
  texture0: WebGLTexture | null;
  texture1: WebGLTexture | null;
  texture2: WebGLTexture | null;
  framebuffer: WebGLFramebuffer | null;
  arrayBuffer: WebGLBuffer | null;
  elementBuffer: WebGLBuffer | null;
  blend: boolean;
  blendSrcRGB: number;
  blendDstRGB: number;
  blendSrcAlpha: number;
  blendDstAlpha: number;
  depthTest: boolean;
  depthMask: boolean;
  stencilTest: boolean;
  cullFace: boolean;
  viewport: Int32Array;
  enabledVertexAttribs: boolean[];
}

export function saveGLState(gl: WebGLRenderingContext): GLState {
  const activeTexture = gl.getParameter(gl.ACTIVE_TEXTURE);

  // Save texture bindings for units 0, 1, 2
  gl.activeTexture(gl.TEXTURE0);
  const texture0 = gl.getParameter(gl.TEXTURE_BINDING_2D);
  gl.activeTexture(gl.TEXTURE1);
  const texture1 = gl.getParameter(gl.TEXTURE_BINDING_2D);
  gl.activeTexture(gl.TEXTURE2);
  const texture2 = gl.getParameter(gl.TEXTURE_BINDING_2D);
  gl.activeTexture(activeTexture);

  // Save vertex attrib array enabled state (MapLibre typically uses 0-7)
  const maxAttribs = Math.min(gl.getParameter(gl.MAX_VERTEX_ATTRIBS) as number, 16);
  const enabledVertexAttribs: boolean[] = [];
  for (let i = 0; i < maxAttribs; i++) {
    enabledVertexAttribs.push(gl.getVertexAttrib(i, gl.VERTEX_ATTRIB_ARRAY_ENABLED) as boolean);
  }

  return {
    program: gl.getParameter(gl.CURRENT_PROGRAM),
    activeTexture,
    texture0,
    texture1,
    texture2,
    framebuffer: gl.getParameter(gl.FRAMEBUFFER_BINDING),
    arrayBuffer: gl.getParameter(gl.ARRAY_BUFFER_BINDING),
    elementBuffer: gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING),
    blend: gl.isEnabled(gl.BLEND),
    blendSrcRGB: gl.getParameter(gl.BLEND_SRC_RGB),
    blendDstRGB: gl.getParameter(gl.BLEND_DST_RGB),
    blendSrcAlpha: gl.getParameter(gl.BLEND_SRC_ALPHA),
    blendDstAlpha: gl.getParameter(gl.BLEND_DST_ALPHA),
    depthTest: gl.isEnabled(gl.DEPTH_TEST),
    depthMask: gl.getParameter(gl.DEPTH_WRITEMASK),
    stencilTest: gl.isEnabled(gl.STENCIL_TEST),
    cullFace: gl.isEnabled(gl.CULL_FACE),
    viewport: gl.getParameter(gl.VIEWPORT),
    enabledVertexAttribs,
  };
}

export function restoreGLState(gl: WebGLRenderingContext, state: GLState): void {
  gl.useProgram(state.program);
  gl.bindFramebuffer(gl.FRAMEBUFFER, state.framebuffer);

  // Restore texture bindings for all units we touch
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, state.texture0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, state.texture1);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, state.texture2);
  gl.activeTexture(state.activeTexture);

  gl.bindBuffer(gl.ARRAY_BUFFER, state.arrayBuffer);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, state.elementBuffer);
  if (state.blend) gl.enable(gl.BLEND); else gl.disable(gl.BLEND);
  gl.blendFuncSeparate(state.blendSrcRGB, state.blendDstRGB, state.blendSrcAlpha, state.blendDstAlpha);
  if (state.depthTest) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
  gl.depthMask(state.depthMask);
  if (state.stencilTest) gl.enable(gl.STENCIL_TEST); else gl.disable(gl.STENCIL_TEST);
  if (state.cullFace) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE);
  gl.viewport(state.viewport[0], state.viewport[1], state.viewport[2], state.viewport[3]);

  // Restore vertex attrib array enabled state
  for (let i = 0; i < state.enabledVertexAttribs.length; i++) {
    if (state.enabledVertexAttribs[i]) {
      gl.enableVertexAttribArray(i);
    } else {
      gl.disableVertexAttribArray(i);
    }
  }
}
