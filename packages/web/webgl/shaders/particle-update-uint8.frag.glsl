/**
 * particle-update-uint8.frag.glsl - GPGPU Update Shader for Uint8 Textures
 * Uses R8G8B8A8 encoding to store float values without OES_texture_float
 * Based on: nullprogram.com/blog/2014/06/29/
 */
precision highp float;

uniform sampler2D u_particles;    // Current particle state (Uint8 encoded)
uniform sampler2D u_wind;         // Wind velocity data texture (Uint8 in this mode)

uniform vec2 u_wind_res;          // Wind texture resolution
uniform float u_speed_factor;     // Particle movement speed
uniform float u_drop_rate;        // Base particle reset rate
uniform float u_drop_rate_bump;   // Additional reset rate for fast particles
uniform float u_rand_seed;        // Random seed
uniform vec4 u_bbox;              // [minLon, minLat, maxLon, maxLat]
uniform vec2 u_particle_res;      // Particle state texture resolution
uniform float u_max_speed;        // Maximum wind speed for decoding Uint8 texture

varying vec2 v_texcoord;

// ============================================================
// R8G8B8A8 ENCODE/DECODE (16-bit precision per value)
// Encoding scheme: 16-bit value split into two 8-bit bytes
// channels = [low, high] where each is [0, 255] stored as normalized [0, 1] in texture
// Reconstruct: v = low + high * 256 (NOT 255!)
// ============================================================
const float BASE = 256.0;         // Use 256 for proper byte decoding
const float OFFSET = 32768.0;     // Midpoint offset

// Encode a single float to 2 bytes (returned as vec2 normalized 0-1)
// Scale determines the range: value * scale should be in [-32768, 32767]
vec2 encodeFloat(float value, float scale) {
  float v = value * scale + OFFSET;
  v = clamp(v, 0.0, 65535.0);
  float low = mod(v, BASE);
  float high = floor(v / BASE);
  return vec2(low, high) / 255.0; // Normalize to [0,1] for texture storage
}

// Decode 2 bytes back to float
// Input channels are normalized [0,1] values from texture
// Convert back to [0,255] byte range, then reconstruct 16-bit value
float decodeFloat(vec2 channels, float scale) {
  vec2 bytes = channels * 255.0;  // Denormalize from [0,1] to [0,255]
  float v = bytes.x + bytes.y * BASE;  // Reconstruct: low + high * 256
  return (v - OFFSET) / scale;
}

// ============================================================
// POSITION SCALE: Maps 0-1 position to 16-bit storage
// Max precision: 1/65535 = ~0.0000153 of the range
// ============================================================
const float POS_SCALE = 32767.0;  // Position range: 0-1 mapped to 16-bit

// Encode particle state (x, y in 0-1 range)
// RG = x position encoded, BA = y position encoded
vec4 encodeParticle(vec2 pos, float age, float speed) {
  vec2 encodedX = encodeFloat(pos.x - 0.5, POS_SCALE);  // Center around 0
  vec2 encodedY = encodeFloat(pos.y - 0.5, POS_SCALE);
  return vec4(encodedX, encodedY);
}

// Decode particle state
// Returns vec4(x, y, age, speed)
vec4 decodeParticle(vec4 encoded) {
  float x = decodeFloat(encoded.rg, POS_SCALE) + 0.5;
  float y = decodeFloat(encoded.ba, POS_SCALE) + 0.5;
  return vec4(x, y, 0.0, 0.0);
}

// ============================================================
// Pseudo-random number generator
// ============================================================
float rand(vec2 co) {
  return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

// ============================================================
// Look up wind velocity at position
// Wind texture is Uint8 encoded: R,G store normalized U,V
// Encoding: value = ((velocity / maxSpeed) * 0.5 + 0.5)
// Decoding: velocity = (value - 0.5) * 2.0 * maxSpeed
// ============================================================
vec2 lookupWind(vec2 uv) {
  vec2 clamped = clamp(uv, vec2(0.0), vec2(1.0));
  vec4 sample_val = texture2D(u_wind, clamped);

  // Alpha < 0.5 means invalid/no data
  if (sample_val.a < 0.5) return vec2(0.0);

  // Decode Uint8 normalized values back to velocity
  // R channel: normalized U (0.5 = 0, 0 = -maxSpeed, 1 = +maxSpeed)
  // G channel: normalized V (same encoding)
  float u = (sample_val.r - 0.5) * 2.0 * u_max_speed;
  float v = (sample_val.g - 0.5) * 2.0 * u_max_speed;

  return vec2(u, v);
}

// ============================================================
// MAIN
// ============================================================
void main() {
  // Decode current particle state from Uint8 texture
  vec4 encoded = texture2D(u_particles, v_texcoord);
  vec4 particle = decodeParticle(encoded);

  float x = particle.r;
  float y = particle.g;

  // Look up wind at current position
  vec2 velocity = lookupWind(vec2(x, y));
  float currentSpeed = length(velocity);

  // Apply movement — match float shader scale (0.0003) for consistent visual speed
  vec2 offset = velocity * u_speed_factor * 0.0003;
  float newX = x + offset.x;
  float newY = y + offset.y;

  // Determine reset (simple age model using pseudo-random)
  vec2 seed = (v_texcoord + u_rand_seed) * u_particle_res;
  float randomValue = rand(seed);
  float dropRate = u_drop_rate + currentSpeed * u_drop_rate_bump;

  // Low entropy rebirth to keep things flowing without abrupt resets
  float entropyReset = rand(seed + vec2(u_rand_seed * 2.0, u_rand_seed * 3.0));

  bool shouldReset = newX < 0.0 || newX > 1.0
    || newY < 0.0 || newY > 1.0
    || randomValue < dropRate
    || entropyReset > 0.997;

  if (shouldReset) {
    vec2 resetSeed = v_texcoord + vec2(u_rand_seed);
    newX = rand(resetSeed);
    newY = rand(resetSeed + vec2(1.3, 2.7));
  }

  // Encode and output new state
  gl_FragColor = encodeParticle(vec2(newX, newY), 0.0, currentSpeed);
}
