/**
 * coastal-dynamics.frag.glsl — Breaking-wave height transform shader
 *
 * Inputs (per-pixel):
 *   u_data      (TEXTURE0): swell grid — R=H0 (m), G=T (s), A=valid flag
 *   u_depth     (TEXTURE4): bathymetry grid — R=depth (m, positive down), A=valid flag
 *   u_color_ramp (TEXTURE1): 256×1 breaking-height colour ramp
 *   u_land_mask (TEXTURE2): land/sea mask (R>0.5 = land → discard)
 *
 * Physics (Airy linear wave theory + Fenton-McKee 1990 explicit dispersion):
 *   1. Deep-water group speed  Cg0 = g·T / (4π)
 *   2. Local wavelength        L   = L0 · tanh((ω²·d/g)^(3/4))^(2/3)   [Fenton-McKee]
 *   3. Wavenumber / phase speed k=2π/L, C=L/T
 *   4. n = 0.5·(1 + 2kd/sinh(2kd))
 *   5. Group speed             Cg  = n·C
 *   6. Shoaling coefficient    Ks  = sqrt(Cg0 / Cg)
 *   7. Shoaled height          H   = H0·Ks
 *   8. Breaking check          if H > γ·d (γ=0.78): cap H = γ·d
 *
 * Refraction: Kr=1 in this phase (Phase 4 adds Snell's law via depth gradient).
 *
 * Tide adjustment: depth is read from the bathymetry texture and augmented
 * by u_tide_offset (sea_level_height_msl) before the transform.
 *
 * Phase 3.5 display model — nearshore-only rendering:
 *   Deep water (d ≥ 200 m) is DISCARDED. Displaying H0 there coloured the
 *   whole open ocean with ambient swell (the "green blanket"). This layer's job
 *   is to show NEARSHORE TRANSFORMATION, not open-water swell magnitude.
 *
 *   Within 0–200 m a per-pixel effectAlpha weights the signal by:
 *     - depth proximity (sqrt fade: bright at 0 m, zero at 200 m)
 *     - shoaling strength (Ks boost: extra opacity where energy is concentrating)
 *     - active breaking (full opacity where γ·d cap fires)
 *
 * Output: breaking-wave height (m) → colour ramp → premultiplied alpha.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Private GL context — NOT subject to CLAUDE.md shared-context rules.
 * This shader runs in CoastalDynamicsEngine's own offscreen canvas context,
 * not in MapLibre's shared context. No resetAllGLState() needed.
 * ─────────────────────────────────────────────────────────────────────────────
 */

#ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
#else
  precision mediump float;
#endif

// ── Texture inputs ─────────────────────────────────────────────────────────
uniform sampler2D u_data;         // Swell: R=H0(m), G=T(s), A=valid (TEXTURE0)
uniform sampler2D u_color_ramp;   // Breaking-height colour ramp 256×1 (TEXTURE1)
uniform sampler2D u_land_mask;    // Land mask: R>0.5=land (TEXTURE2)
uniform sampler2D u_exposure_tex; // CPU exposure grid: R=[0,1] per cell (TEXTURE3)
uniform sampler2D u_depth;        // Bathymetry: R=depth(m), A=valid (TEXTURE4)

// ── Uniforms ────────────────────────────────────────────────────────────────
uniform float u_opacity;           // Layer opacity [0,1]
uniform float u_max_breaking_height; // Colour ramp max (m), default 4.0
uniform float u_tide_offset;       // sea_level_height_msl (m) — adds to depth
uniform float u_use_land_mask;     // 1.0 = apply land mask, 0.0 = skip
uniform float u_exposure_enable;   // 1.0 = R2 exposure (CPU texture) on, 0.0 = R1 only
uniform float u_exposure_debug;    // 1.0 = write exposure to R channel for gl.readPixels (?coastalExposureDebug=1)
// Single-viewport architecture: both swell (TEXTURE0) and depth (TEXTURE4) cover
// the same geographic rectangle (the map viewport). The shader samples both at
// v_texcoord directly. No bounds uniforms or UV remap needed.

// ── Constants ───────────────────────────────────────────────────────────────
const float PI  = 3.14159265358979;
const float TWO_PI = 6.28318530717959;
const float G   = 9.81;
const float GAMMA = 0.78;          // Breaker index (Miche 1944 / Battjes 1974)
const float MIN_DEPTH = 0.5;       // Below this (m) → discard (surf zone proper)
const float MIN_H0 = 0.05;         // Below this deep-water height → discard

varying vec2 v_texcoord;

// ── GLSL ES 1.00 replacements for tanh/sinh (GLSL ES 3.00 only) ─────────────
// The vertex shader uses attribute/varying syntax (ES 1.00), so the entire
// program compiles under ES 1.00 where tanh() and sinh() do not exist.

// tanh(x) = (e^x - e^-x) / (e^x + e^-x)
// Clamped to [-20, 20]: beyond that tanh is ±1.0 to float precision.
float glsl_tanh(float x) {
  float cx  = clamp(x, -20.0, 20.0);
  float ex  = exp(cx);
  float emx = exp(-cx);
  return (ex - emx) / (ex + emx);
}

// sinh(x) = (e^x - e^-x) / 2
// Only called for kd2 < 15.0 (caller guards larger values), so no overflow.
float glsl_sinh(float x) {
  return (exp(x) - exp(-x)) * 0.5;
}

// ── Fenton-McKee (1990) explicit dispersion ─────────────────────────────────
// L = L0 · tanh( (ω²·d/g)^(3/4) )^(2/3)
// Avoids the iterative Newton solver, accurate to <1% for kd ∈ [0.1, 10].
//
float deepWaterWavelength(float T) {
  return (G * T * T) / TWO_PI;   // L0 = g·T²/2π
}

// ── Phase 4: Derive shore-normal bearing from depth gradient ────────────────
// The offshore normal points toward deeper water (downslope).
// Shore normal = downslope direction in compass bearing.
// Flat/degenerate gradient → return 0 (no orientation).
//
// @param gradLon ∂d/∂lon (positive = depth increases eastward)
// @param gradLat ∂d/∂lat (positive = depth increases northward)
// @returns Compass bearing [0,360) pointing toward deeper water, or -1 if degenerate
float shoreNormalFromGradient(float gradLon, float gradLat) {
  float mag = sqrt(gradLon * gradLon + gradLat * gradLat);
  if (mag < 1e-6) return -1.0;  // Flat/ambiguous shelf

  // Bearing = atan2(eastComponent, northComponent)
  // gradLon is east gradient; gradLat is north gradient (depth increases toward deeper)
  float bearingRad = atan(gradLon, gradLat);  // atan2(x,y) maps to [-π,π]
  float bearingDeg = (bearingRad * 180.0 / PI + 360.0);  // Convert to [0,360)
  return mod(bearingDeg, 360.0);
}

// ── Compute incident angle from swell direction + shore normal ────────────────
// Convention: swell propagates TOWARD = (swellFromDeg + 180) % 360
// theta0 = smallest arc between swell-toward and shore-normal, folded to [0,90]
float incidentAngleFromDirections(float swellFromDeg, float shoreNormalDeg) {
  if (shoreNormalDeg < 0.0) return 0.0;  // Flat/ambiguous → shore-normal incidence

  float swellTowardDeg = mod(swellFromDeg + 180.0, 360.0);
  float diff = mod(swellTowardDeg - shoreNormalDeg + 360.0, 360.0);
  if (diff > 180.0) diff = 360.0 - diff;  // Smallest arc: [0,180]

  // Map to [0,90]: 0° = shore-normal, 90° = parallel-to-shore
  return diff > 90.0 ? 180.0 - diff : diff;
}

// ── Phase 4: Snell Refraction ──────────────────────────────────────────────
// Refraction coefficient Kr = sqrt( cos(theta0) / cos(theta) ) using Snell's law
// Straight-parallel-contour approximation; indicative only (effective at ~450m resolution).
//
// Inputs:
//   T: wave period (s)
//   d: effective depth (m)
//   theta0_rad: deep-water incident angle (radians, from shore-normal)
//
// Returns Kr ∈ [0, 2], clamped to avoid cos θ → 0 singularities at grazing incidence.
float refractionCoeffSnell(float T, float d, float theta0_rad) {
  // Compute angle between swell propagation and local depth gradient
  // Swell propagates at angle theta0_rad from shore-normal (computed in caller).
  // For now, use theta0_rad directly; CPU computes the conversion from directions.

  // Deep-water phase speed
  float C0 = (G * T) / TWO_PI;

  // Local phase speed at depth d (via Fenton-McKee wavelength)
  float L0 = deepWaterWavelength(T);
  float omega = TWO_PI / T;
  float x = (omega * omega * d) / G;
  float xc = clamp(x, 0.0001, 500.0);
  float tanhArg = pow(xc, 0.75);
  float tanhVal = glsl_tanh(tanhArg);
  float L = L0 * pow(tanhVal, 2.0 / 3.0);
  float C = L / T;

  // Snell's law: C / C0 = sin(theta) / sin(theta0)
  float sinTheta = (C / C0) * sin(theta0_rad);
  sinTheta = clamp(sinTheta, -1.0, 1.0);
  float theta = asin(sinTheta);

  float cosTheta0 = cos(theta0_rad);
  float cosTheta = cos(theta);

  // Guard against near-zero denominator (wave approaching along-shore)
  if (abs(cosTheta) < 1e-6) return 1.0;

  return clamp(sqrt(abs(cosTheta0) / cosTheta), 0.0, 2.0);
}

float fentonMcKeeWavelength(float T, float d) {
  float L0    = deepWaterWavelength(T);
  float omega = TWO_PI / T;
  float x     = (omega * omega * d) / G;   // ω²d/g (dimensionless depth)
  // Clamp to avoid pow domain issues at x→0 or large x
  float xc    = clamp(x, 0.0001, 500.0);
  float tanhArg = pow(xc, 0.75);           // (ω²d/g)^(3/4)
  float tanhVal  = glsl_tanh(tanhArg);
  return L0 * pow(tanhVal, 2.0 / 3.0);
}

// Compute shoaling coefficient Ks = sqrt(Cg0 / Cg) using Fenton-McKee L.
float shoalingCoeff(float T, float d) {
  // Deep-water group speed Cg0 = C0/2 = g·T/(4π)
  float Cg0 = (G * T) / (4.0 * PI);

  float L = fentonMcKeeWavelength(T, d);
  float k = TWO_PI / L;
  float C = L / T;

  // n = 0.5·(1 + 2kd/sinh(2kd))
  float kd2 = 2.0 * k * d;
  // For kd2 > 15 sinh grows as exp(kd2)/2 — avoid overflow by using exp directly.
  float sinh2kd;
  if (kd2 > 15.0) {
    sinh2kd = exp(kd2) * 0.5;
  } else {
    sinh2kd = glsl_sinh(kd2);
  }
  float n = 0.5 * (1.0 + (kd2 / max(sinh2kd, 0.000001)));

  float Cg = n * C;
  return sqrt(Cg0 / max(Cg, 0.000001));
}

// ── R2: Exposure — sampled from CPU-computed texture (u_exposure_tex, TEXTURE3) ──────────────────
// The GPU raycast was replaced by a CPU-computed exposure grid (_computeExposure in the layer).
// The CPU grid is correct and provable; the GPU raycast had UNPACK_FLIP_Y orientation issues that
// produced wrong results on cells with strong N-S swell components (e.g. Sri Lanka S-coast).
// Shader just samples u_exposure_tex at the same uv as the depth/swell — no raycast needed.

// ── Main ────────────────────────────────────────────────────────────────────
void main() {
  vec2 uv = v_texcoord;

  // ── Swell data ────────────────────────────────────────────────────────────
  // Single-viewport: swell texture is bilinearly resampled onto the viewport
  // grid in the layer (row 0 = maxLat/north), same as the depth texture.
  // Both are sampled at v_texcoord directly — no UV remap needed.
  vec4 swellSample = texture2D(u_data, uv);
  if (swellSample.a < 0.1) {
    discard;   // No swell data at this pixel
  }
  float H0           = swellSample.r;          // Deep-water height (m)
  float T            = swellSample.g;          // Period (s)
  float dir_from_deg = swellSample.b * 360.0;  // Swell "from" direction (°, met convention)

  // Guard degenerate inputs
  if (H0 < MIN_H0 || T < 1.0) {
    discard;
  }

  // ── Land mask ─────────────────────────────────────────────────────────────
  if (u_use_land_mask > 0.5) {
    float land = texture2D(u_land_mask, uv).r;
    if (land > 0.5) discard;
  }

  // ── Bathymetry ────────────────────────────────────────────────────────────
  // Single-viewport architecture: depth is sampled at the same uv as swell.
  // Row 0 = maxLat (north) in both textures, matching fetchDepthGrid convention.
  vec4 depthSample = texture2D(u_depth, uv);

  // A-channel 0 means no bathymetry data (land or tile gap) — discard.
  if (depthSample.a < 0.1) {
    discard;
  }

  // Effective depth = GEBCO depth + tide offset.
  // Depth > 0 = ocean; ≤ 0 = land/intertidal → discard.
  float depth_raw = depthSample.r;
  float d_eff = depth_raw + u_tide_offset;

  if (d_eff < MIN_DEPTH) {
    // Dry land or intertidal zone — discard completely
    discard;
  }

  // ── Nearshore-only gate ───────────────────────────────────────────────────
  // Deep water (d ≥ 200 m) is discarded entirely. This layer's purpose is to
  // show NEARSHORE TRANSFORMATION energy, not ambient open-ocean swell. Showing
  // H0 in deep water painted the whole sea green ("green blanket" Phase 3.5 bug).
  const float DEEP_WATER_CUTOFF = 200.0;

  if (d_eff >= DEEP_WATER_CUTOFF) {
    discard;
  }

  // ── Nearshore transform (0 < d_eff < 200 m) ──────────────────────────────
  float Ks = shoalingCoeff(T, d_eff);
  // Clamp Ks to physically plausible range [0.5, 3.0]
  Ks = clamp(Ks, 0.5, 3.0);

  // Phase 4: Snell refraction from local depth gradient
  // Sample depth gradient using central differences (same grid as depth texture).
  // Note: this is a straight-parallel-contour APPROXIMATION, indicative only.
  // True refraction is non-local and depends on the full bathymetry profile.
  float pixelSize_m = 1.0 / 64.0;  // Viewport spans ~64 pixels; rough 450m per pixel at typical zoom
  vec4 depthCW = texture2D(u_depth, uv + vec2(pixelSize_m, 0.0));
  vec4 depthCCW = texture2D(u_depth, uv - vec2(pixelSize_m, 0.0));
  vec4 depthN = texture2D(u_depth, uv - vec2(0.0, pixelSize_m));
  vec4 depthS = texture2D(u_depth, uv + vec2(0.0, pixelSize_m));

  float gradLon = 0.0, gradLat = 0.0;
  if (depthCW.a > 0.1 && depthCCW.a > 0.1) {
    gradLon = (depthCW.r - depthCCW.r) / (2.0 * pixelSize_m);
  }
  if (depthN.a > 0.1 && depthS.a > 0.1) {
    gradLat = (depthS.r - depthN.r) / (2.0 * pixelSize_m);
  }

  // Derive shore-normal bearing from depth gradient; if degenerate, assume shore-normal incidence
  float shoreNormalDeg = shoreNormalFromGradient(gradLon, gradLat);

  // Compute incident angle: angle between swell-toward and shore-normal, folded to [0,90]
  // Swell "from" = B channel normalized / 360, converted to compass degrees
  float theta0_deg = incidentAngleFromDirections(dir_from_deg, shoreNormalDeg);
  float theta0_rad = (theta0_deg * PI) / 180.0;
  float Kr = refractionCoeffSnell(T, d_eff, theta0_rad);

  float H_shoaled   = H0 * Ks * Kr;      // Phase 4: Kr now applied; Kr=1 at theta0=0
  float breakingCap = GAMMA * d_eff;
  bool  isBreaking  = H_shoaled > breakingCap;
  float H_final     = isBreaking ? breakingCap : H_shoaled;

  // ── Opacity model: R1 (energy gate) + optional R2 (exposure presence floor) ──
  //
  // R1 (always active): energy gate × nearshore mask. No base floor.
  // R2 (flag-gated via u_exposure_enable): presence floor for exposed small waves.
  //     Exposed cells with real-but-calm swell (Tel Aviv) get a presence floor so
  //     they're visible. Sheltered cells (Hauraki Gulf) stay dark.
  //
  const float H0_QUIET       = 0.55;   // energyGate knee
  const float H0_FULL        = 1.50;
  const float NEARSHORE_FULL = 30.0;
  const float NEARSHORE_FADE = 200.0;
  const float PRESENCE_CAP   = 0.50;   // R2: presence floor ceiling (raised 0.25→0.40→0.50)

  float energyGate    = smoothstep(H0_QUIET, H0_FULL, H0);
  float nearshoreMask = 1.0 - smoothstep(NEARSHORE_FULL, NEARSHORE_FADE, d_eff);
  float breakingBonus = isBreaking ? 0.2 * energyGate : 0.0;

  // R2: CPU-computed exposure + presence floor (behind u_exposure_enable flag).
  // When flag is OFF: exposure=1.0, presence=0, effectAlpha=pure R1 (byte-identical to pre-R2).
  // When flag is ON: exposure = texture sample from u_exposure_tex (CPU-computed, correct).
  float exposure = 1.0;
  float presence = 0.0;
  if (u_exposure_enable > 0.5) {
    // Sample CPU exposure grid — same uv as depth/swell, same UNPACK_FLIP_Y orientation.
    exposure = texture2D(u_exposure_tex, uv).r;
    float presenceShape = smoothstep(0.20, 0.30, H0);
    presence = exposure * nearshoreMask * presenceShape * PRESENCE_CAP;
  }

  // ── Debug mode: ?coastalExposureDebug=1 ─────────────────────────────────
  // Write exposure directly into the R channel so gl.readPixels can measure it.
  // Enabled by setting u_exposure_debug uniform to 1.0. Normal render is unchanged.
  if (u_exposure_debug > 0.5) {
    gl_FragColor = vec4(exposure, 0.0, 0.0, 1.0);
    return;
  }

  // R1+R2+R5: energy term and breakingBonus multiplied by exposure so sheltered cells go dark.
  // Flag-off: exposure=1.0 (default when u_exposure_enable=0) → byte-identical to pre-R5.
  // presence is already exposure-gated (see above); untouched.
  float effectAlpha   = clamp(max(energyGate * nearshoreMask * exposure, presence) + breakingBonus * exposure, 0.0, 1.0);

  if (effectAlpha < 0.01) {
    discard;
  }

  // ── Colour ramp lookup ───────────────────────────────────────────────────
  float normalized = clamp(H_final / u_max_breaking_height, 0.0, 1.0);
  vec4 color = texture2D(u_color_ramp, vec2(normalized, 0.5));

  // Apply opacity — straight alpha (premultipliedAlpha: false on offscreen canvas).
  // effectAlpha gates the nearshore-only display; u_opacity is the global layer knob.
  float alpha = color.a * effectAlpha * u_opacity;
  gl_FragColor = vec4(color.rgb, alpha);
}
