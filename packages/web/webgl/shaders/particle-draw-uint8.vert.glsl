/**
 * particle-draw-uint8.vert.glsl - Vertex shader for Uint8 particle drawing
 *
 * Offscreen Canvas Source architecture:
 *   Particles render to their own canvas in NDC [-1,1] space.
 *   MapLibre's CanvasSource drapes the canvas onto the globe.
 *   No u_matrix, no projectTile(), no Mercator conversion.
 */
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

// R8G8B8A8 decode
const float BASE = 256.0;
const float OFFSET = 32768.0;
const float POS_SCALE = 32767.0;

float decodeFloat(vec2 channels, float scale) {
  vec2 bytes = channels * 255.0;
  float v = bytes.x + bytes.y * BASE;
  return (v - OFFSET) / scale;
}

vec4 decodeParticle(vec4 encoded) {
  float x = decodeFloat(encoded.rg, POS_SCALE) + 0.5;
  float y = decodeFloat(encoded.ba, POS_SCALE) + 0.5;
  return vec4(x, y, 0.0, 0.0);
}

void main() {
  vec2 texcoord = (a_index + 0.5) / u_particles_res;
  vec4 encoded = texture2D(u_particles, texcoord);
  vec4 particle = decodeParticle(encoded);

  float x = particle.r;  // [0, 1] data space
  float y = particle.g;

  // Synthesize pseudo-age from texcoord
  float ageBase = fract(sin(dot(texcoord, vec2(127.1, 311.7))) * 43758.5453);
  float agePhase = fract(ageBase + fract(a_index.x * 0.0013 + a_index.y * 0.0079));
  v_age = agePhase;

  // Wind speed lookup
  vec2 windUV = clamp(vec2(x, y), vec2(0.0), vec2(1.0));
  vec4 windSample = texture2D(u_wind, windUV);
  if (windSample.a > 0.5) {
    v_speed = windSample.b * u_max_speed;
  } else {
    v_speed = 0.0;
  }
  v_speed_norm = clamp(v_speed / u_max_speed, 0.0, 1.0);

  // Map [0, 1] data space directly to NDC [-1, 1]
  gl_Position = vec4(x * 2.0 - 1.0, y * 2.0 - 1.0, 0.0, 1.0);

  // Dynamic point size
  gl_PointSize = mix(1.0, 3.0, v_speed_norm);
}
