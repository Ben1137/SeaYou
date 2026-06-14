/**
 * StarfieldLayer — Native WebGL custom layer for the globe void starfield.
 *
 * Renders ~3000 white gl.POINTS in NDC clip space at z=0.9999 (far plane),
 * so map tiles at closer depths composite cleanly on top.
 *
 * Uses renderingMode:'3d' to participate in MapLibre's globe depth pipeline.
 * State is cleaned up after every draw per the nuclear-reset pattern.
 */
import type maplibregl from 'maplibre-gl';

const STAR_COUNT = 3000;
const FLOATS_PER_STAR = 4; // x, y, opacity, size

const VERT_SRC = `
attribute vec2 a_pos;
attribute float a_opacity;
attribute float a_size;
varying float v_opacity;
void main() {
  // z=0.9999 puts stars at the far depth plane — behind all map tiles
  gl_Position = vec4(a_pos, 0.9999, 1.0);
  gl_PointSize = a_size;
  v_opacity = a_opacity;
}
`;

const FRAG_SRC = `
precision mediump float;
varying float v_opacity;
void main() {
  // Circular point sprite — discard square corners
  vec2 pc = gl_PointCoord - 0.5;
  if (dot(pc, pc) > 0.25) discard;
  gl_FragColor = vec4(1.0, 1.0, 1.0, v_opacity);
}
`;

// Generate star data once at module load — positions are fixed
const starData = (() => {
  const buf = new Float32Array(STAR_COUNT * FLOATS_PER_STAR);
  for (let i = 0; i < STAR_COUNT; i++) {
    const base = i * FLOATS_PER_STAR;
    buf[base]     = Math.random() * 2.0 - 1.0;                        // NDC x
    buf[base + 1] = Math.random() * 2.0 - 1.0;                        // NDC y
    buf[base + 2] = 0.2 + Math.random() * 0.8;                        // opacity 0.2–1.0
    buf[base + 3] = 1.0 + Math.random() * 2.0;                        // size 1.0–3.0
  }
  return buf;
})();

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`[StarfieldLayer] Shader compile error: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

interface StarfieldState {
  program: WebGLProgram;
  buffer: WebGLBuffer;
  posLoc: number;
  opacityLoc: number;
  sizeLoc: number;
}

let state: StarfieldState | null = null;

export const starfieldLayer: maplibregl.CustomLayerInterface = {
  id: 'seayou-starfield',
  type: 'custom',
  renderingMode: '3d',

  onAdd(_map: maplibregl.Map, gl: WebGLRenderingContext) {
    const vert = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
    const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    const program = gl.createProgram()!;
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`[StarfieldLayer] Program link error: ${gl.getProgramInfoLog(program)}`);
    }
    gl.deleteShader(vert);
    gl.deleteShader(frag);

    const buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, starData, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    state = {
      program,
      buffer,
      posLoc:     gl.getAttribLocation(program, 'a_pos'),
      opacityLoc: gl.getAttribLocation(program, 'a_opacity'),
      sizeLoc:    gl.getAttribLocation(program, 'a_size'),
    };

    console.log('[StarfieldLayer] Initialized — ', STAR_COUNT, 'stars');
  },

  render(gl: WebGLRenderingContext) {
    if (!state) return;
    const { program, buffer, posLoc, opacityLoc, sizeLoc } = state;
    const STRIDE = FLOATS_PER_STAR * 4; // bytes

    gl.useProgram(program);

    // Blend: standard SRC_ALPHA so faint stars fade correctly
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Disable depth write so stars don't occlude map tiles
    gl.depthMask(false);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, STRIDE, 0);

    gl.enableVertexAttribArray(opacityLoc);
    gl.vertexAttribPointer(opacityLoc, 1, gl.FLOAT, false, STRIDE, 2 * 4);

    gl.enableVertexAttribArray(sizeLoc);
    gl.vertexAttribPointer(sizeLoc, 1, gl.FLOAT, false, STRIDE, 3 * 4);

    gl.drawArrays(gl.POINTS, 0, STAR_COUNT);

    // Nuclear reset — prevent state leaking into MapLibre's own passes
    gl.disableVertexAttribArray(posLoc);
    gl.disableVertexAttribArray(opacityLoc);
    gl.disableVertexAttribArray(sizeLoc);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.depthMask(true);
    // Restore MapLibre's expected premultiplied-alpha composite blend
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  },

  onRemove(_map: maplibregl.Map, gl: WebGLRenderingContext) {
    if (!state) return;
    gl.deleteProgram(state.program);
    gl.deleteBuffer(state.buffer);
    state = null;
    console.log('[StarfieldLayer] Removed');
  },
};
