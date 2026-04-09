precision highp float;

uniform sampler2D u_particles;    // Current particle state texture
uniform sampler2D u_wind;         // Wind velocity data texture (R=U, G=V, B=speed, A=valid)

uniform vec2 u_wind_res;          // Wind texture resolution (width, height)
uniform float u_speed_factor;     // Controls particle movement speed
uniform float u_drop_rate;        // Base probability of particle reset per frame
uniform float u_drop_rate_bump;   // Additional drop rate for fast particles
uniform float u_rand_seed;        // Random seed (changes each frame)
uniform vec4 u_bbox;              // [minLon, minLat, maxLon, maxLat] of wind data
uniform vec2 u_particle_res;      // Particle state texture resolution
uniform float u_max_speed;        // Max speed from data — used for dynamic normalization

varying vec2 v_texcoord;          // This particle's texcoord in the state texture

// Pseudo-random number generator
// Returns a value between 0 and 1 based on input coordinates
float rand(vec2 co) {
  return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

// Look up wind velocity at a geographic position (0-1 normalized within bbox)
vec2 lookupWind(vec2 uv) {
  // Clamp to valid range
  vec2 clamped = clamp(uv, vec2(0.0), vec2(1.0));
  vec4 sample_val = texture2D(u_wind, clamped);

  // LOWER THRESHOLD: Allow particles closer to the coastline.
  // Bilinear filtering creates intermediate alpha near coast (0.1-0.8).
  // At 0.3, particles read velocity ~1-2 grid cells closer to shore.
  // Land-kill logic (zero velocity → respawn) still catches particles on land.
  if (sample_val.a < 0.3) return vec2(0.0);

  return vec2(sample_val.r, sample_val.g); // U, V components
}

void main() {
  vec4 particle = texture2D(u_particles, v_texcoord);

  float x = particle.r;   // X position (0-1 within bbox)
  float y = particle.g;   // Y position (0-1 within bbox)
  float age = particle.b; // Current age (0 = new, 1 = about to reset)
  float speed = particle.a; // Cached speed

  // Look up wind at current position
  vec2 velocity = lookupWind(vec2(x, y));
  float currentSpeed = length(velocity);

  // ── LAND KILL: if velocity lookup returned zero (alpha < 0.3 = land/invalid),
  // force an immediate respawn so particles never slide or stall on land.
  // Use a very low threshold (0.0001) to avoid discarding slow ocean currents
  // (~0.01 m/s) which are valid but produce very small velocity vectors.
  if (currentSpeed < 0.0001) {
    vec2 resetSeed = v_texcoord + vec2(u_rand_seed);
    float rx = rand(resetSeed);
    float ry = rand(resetSeed + vec2(1.3, 2.7));
    gl_FragColor = vec4(rx, ry, 0.0, 0.0);
    return;
  }

  // Normalize velocity and apply speed factor.
  // The velocity from the texture is in m/s (raw float).
  // 0.0003 base scale: at 10 m/s * 2.0 speedFactor → moves 0.006 units/frame
  // → crosses a typical 10° viewport (bbox 0→1) in ~167 frames ≈ Windy-style streak length
  vec2 offset = velocity * u_speed_factor * 0.0003;

  // Update position
  float newX = x + offset.x;
  float newY = y + offset.y;

  // Age the particle — longer lifetime = longer visible trails.
  // 400 frames at 60fps = ~6.7 seconds, creating long flowing Windy-style streams.
  float newAge = age + 1.0 / 400.0;

  // Normalize speed to [0,1] range for storage in alpha channel
  // Use dynamic max speed from data (u_max_speed) with a floor of 0.5 m/s.
  // Adapts to both wind (10-30 m/s) and ocean currents (0.1-2 m/s) automatically.
  float effectiveMax = max(u_max_speed * 0.85, 0.5);
  float normalizedSpeed = clamp(currentSpeed / effectiveMax, 0.0, 1.0);

  // Determine if particle should be reset
  // Higher speed = slightly higher drop rate (prevents accumulation in convergence zones)
  float dropRate = u_drop_rate + currentSpeed * u_drop_rate_bump;

  // Generate pseudo-random value for this particle
  // Use time-based seed for continuous entropy injection
  vec2 seed = (v_texcoord + u_rand_seed) * u_particle_res;
  float randomValue = rand(seed);

  // ENTROPY: Low random rebirth (0.2% per frame) to keep screen alive without abrupt popping
  float entropyReset = rand(seed + vec2(u_rand_seed * 2.0, u_rand_seed * 3.0));
  bool randomRebirth = entropyReset > 0.998;

  // Reset conditions: aged out, out of bounds, random drop, or entropy rebirth
  bool shouldReset = newAge > 1.0
    || newX < 0.0 || newX > 1.0
    || newY < 0.0 || newY > 1.0
    || randomValue < dropRate
    || randomRebirth;

  if (shouldReset) {
    // ENTROPY CONSERVATION (from nullprogram article):
    // Don't reset to pure random — preserve some state information
    // Use particle index (v_texcoord) to tease apart overlapping particles
    vec2 resetSeed = v_texcoord + vec2(u_rand_seed);
    newX = rand(resetSeed);
    newY = rand(resetSeed + vec2(1.3, 2.7));
    newAge = 0.0;
    normalizedSpeed = 0.0;
  }

  // Store normalized speed [0,1] in alpha so draw vertex can do color ramp lookup
  gl_FragColor = vec4(newX, newY, newAge, normalizedSpeed);
}
