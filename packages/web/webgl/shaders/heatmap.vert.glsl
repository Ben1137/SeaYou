// heatmap.vert.glsl - Vertex shader for wave heatmap
precision highp float;

attribute vec2 a_pos;      // Quad vertex position (-1 to 1)
attribute vec2 a_texcoord; // Texture coordinate (0 to 1)

varying vec2 v_texcoord;

void main() {
  v_texcoord = a_texcoord;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
