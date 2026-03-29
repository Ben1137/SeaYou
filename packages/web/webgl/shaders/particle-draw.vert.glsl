// particle-draw.vert.glsl - Vertex shader for particle drawing (Float32 mode)
//
// Offscreen Canvas Source architecture:
//   Particles render to their own canvas in NDC [-1,1] space.
//   MapLibre's CanvasSource drapes the canvas onto the globe.
//   No u_matrix, no projectTile(), no Mercator conversion.
//
precision highp float;

attribute vec2 a_index;

uniform sampler2D u_particles;
uniform sampler2D u_wind;
uniform vec2 u_particles_res;
uniform vec4 u_bbox;
uniform float u_point_size;
uniform float u_max_speed;

varying float v_speed;
varying float v_speed_norm;
varying float v_age;

void main() {
  vec2 texcoord = (a_index + 0.5) / u_particles_res;
  vec4 particle = texture2D(u_particles, texcoord);

  float x = particle.r;  // [0, 1] data space
  float y = particle.g;

  v_age = particle.b;
  v_speed_norm = clamp(particle.a, 0.0, 1.0);
  v_speed = v_speed_norm * u_max_speed;

  // Map [0, 1] data space directly to NDC [-1, 1]
  gl_Position = vec4(x * 2.0 - 1.0, y * 2.0 - 1.0, 0.0, 1.0);

  // Speed-based size: slow particles are small, fast ones grow larger
  float speedCurve = pow(v_speed_norm, 0.6);
  float sizeMultiplier = mix(0.7, 3.5, speedCurve);

  // Age fade: consistent size until near end of life
  float ageFade = 1.0 - smoothstep(0.80, 1.0, v_age);
  gl_PointSize = u_point_size * sizeMultiplier * ageFade;
}
