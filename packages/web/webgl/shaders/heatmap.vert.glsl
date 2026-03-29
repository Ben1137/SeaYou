// heatmap.vert.glsl - Vertex shader for heatmap layers (NDC fullscreen quad)
//
// Offscreen Canvas Source architecture:
//   The engine renders to its OWN canvas with its OWN WebGL context.
//   MapLibre's CanvasSource drapes the canvas texture onto the globe.
//   No u_matrix, no projectTile() — just a simple NDC fullscreen quad.
//
// Vertex layout (stride 16 bytes):
//   offset 0: a_pos      [-1..1] NDC position
//   offset 8: a_texcoord [0..1]  Data texture UV
//
precision highp float;

attribute vec2 a_pos;       // NDC position [-1, 1]
attribute vec2 a_texcoord;  // UV coordinate for data texture [0, 1]

varying vec2 v_texcoord;

void main() {
  v_texcoord = a_texcoord;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
