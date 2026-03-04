/**
 * particle-draw-uint8.vert.glsl - Vertex Shader for Uint8 Particle Drawing
 * Decodes particle positions from R8G8B8A8 encoded textures
 * Looks up wind speed from velocity texture for color/fade
 */
precision highp float;

attribute vec2 a_index;           // 2D index of this particle in the state texture

uniform sampler2D u_particles;    // Particle state texture (Uint8 encoded)
uniform sampler2D u_wind;         // Wind velocity texture (Uint8 normalized)
uniform vec2 u_particles_res;     // Particle state texture resolution
uniform mat4 u_matrix;            // MapLibre's projection matrix

uniform vec4 u_bbox;              // [minLon, minLat, maxLon, maxLat]
uniform float u_point_size;       // Base particle point size in pixels
uniform float u_max_speed;        // Maximum speed for denormalizing wind texture

varying float v_speed;
varying float v_speed_norm;       // Normalized speed 0-1
varying float v_age;

// ============================================================
// R8G8B8A8 DECODE
// Decodes 16-bit value from two 8-bit channels
// channels = [low, high] normalized [0,1] in texture -> [0,255] bytes
// Reconstruct: v = low + high * 256
// ============================================================
const float BASE = 256.0;
const float OFFSET = 32768.0;
const float POS_SCALE = 32767.0;

// Decode 2 bytes back to float
// Input channels are normalized [0,1] values from texture
float decodeFloat(vec2 channels, float scale) {
  vec2 bytes = channels * 255.0;  // Denormalize from [0,1] to [0,255]
  float v = bytes.x + bytes.y * BASE;  // Reconstruct: low + high * 256
  return (v - OFFSET) / scale;
}

vec4 decodeParticle(vec4 encoded) {
  float x = decodeFloat(encoded.rg, POS_SCALE) + 0.5;
  float y = decodeFloat(encoded.ba, POS_SCALE) + 0.5;
  return vec4(x, y, 0.0, 0.0);
}

// ============================================================
// Convert degrees to radians
// ============================================================
float radians_custom(float degrees) {
  return degrees * 3.141592653589793 / 180.0;
}

// ============================================================
// MAIN
// ============================================================
void main() {
  // VERTEX PULLING: Read encoded position from texture
  vec2 texcoord = (a_index + 0.5) / u_particles_res;
  vec4 encoded = texture2D(u_particles, texcoord);
  vec4 particle = decodeParticle(encoded);

  float x = particle.r;
  float y = particle.g;

  // Uint8 mode doesn't store age in texture (all 4 bytes used for x,y positions).
  // Synthesize a pseudo-age using the particle's texcoord as a stable seed.
  // This distributes particles across all life stages, giving natural-looking
  // age-fade even without explicit age tracking. Each particle gets a fixed
  // "birth offset" that makes it fade at a different point in the animation cycle.
  float ageBase = fract(sin(dot(texcoord, vec2(127.1, 311.7))) * 43758.5453);
  // Combine with a slowly-changing random to animate the age
  float agePhase = fract(ageBase + fract(a_index.x * 0.0013 + a_index.y * 0.0079));
  v_age = agePhase;

  // Look up actual wind speed at this particle's position
  vec2 windUV = clamp(vec2(x, y), vec2(0.0), vec2(1.0));
  vec4 windSample = texture2D(u_wind, windUV);
  if (windSample.a > 0.5) {
    // B channel stores normalized speed: speed / maxSpeed * 255 -> [0,1]
    v_speed = windSample.b * u_max_speed;
  } else {
    v_speed = 0.0;
  }

  // Normalize speed for color ramp lookup
  v_speed_norm = clamp(v_speed / u_max_speed, 0.0, 1.0);

  // Convert from data-normalized (0-1) to geographic coordinates
  float lon = mix(u_bbox.x, u_bbox.z, x);
  float lat = mix(u_bbox.y, u_bbox.w, y);

  // Convert to Web Mercator
  float mercX = (lon + 180.0) / 360.0;
  float latRad = radians_custom(lat);
  float mercY = (1.0 - log(tan(latRad) + 1.0 / cos(latRad)) / 3.141592653589793) / 2.0;

  gl_Position = u_matrix * vec4(mercX, mercY, 0.0, 1.0);

  // Dynamic point size: slow particles are small dots, fast ones are larger.
  // Linear mix gives a clean Windy-style size ramp without over-engineering.
  gl_PointSize = mix(1.0, 3.0, v_speed_norm);
}
