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
uniform sampler2D u_data;       // Swell: R=H0(m), G=T(s), A=valid (TEXTURE0)
uniform sampler2D u_color_ramp; // Breaking-height colour ramp 256×1 (TEXTURE1)
uniform sampler2D u_land_mask;  // Land mask: R>0.5=land (TEXTURE2)
uniform sampler2D u_depth;      // Bathymetry: R=depth(m), A=valid (TEXTURE4)

// ── Uniforms ────────────────────────────────────────────────────────────────
uniform float u_opacity;           // Layer opacity [0,1]
uniform float u_max_breaking_height; // Colour ramp max (m), default 4.0
uniform float u_tide_offset;       // sea_level_height_msl (m) — adds to depth
uniform float u_use_land_mask;     // 1.0 = apply land mask, 0.0 = skip

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

// ── Main ────────────────────────────────────────────────────────────────────
void main() {
  vec2 uv = v_texcoord;

  // ── Swell data ────────────────────────────────────────────────────────────
  vec4 swellSample = texture2D(u_data, uv);
  if (swellSample.a < 0.1) {
    discard;   // No swell data at this pixel
  }
  float H0 = swellSample.r;  // Deep-water height (m)
  float T  = swellSample.g;  // Period (s)

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

  float H_shoaled   = H0 * Ks;           // Kr = 1.0 in Phase 3 (refraction Phase 4)
  float breakingCap = GAMMA * d_eff;
  bool  isBreaking  = H_shoaled > breakingCap;
  float H_final     = isBreaking ? breakingCap : H_shoaled;

  // ── Depth-proximity alpha weighting ─────────────────────────────────────
  // Fade the signal so that:
  //   • shallow water (d → 0)   → full opacity (strong shoaling / breaking)
  //   • transition band (50–200 m) → partial opacity (moderate shoaling)
  //   • approaching 200 m cutoff  → fades to transparent (no perceptible shoaling)
  // sqrt gives a gentler roll-off than linear so the 10–50 m band stays visible.
  float depthFraction  = clamp(d_eff / DEEP_WATER_CUTOFF, 0.0, 1.0); // 0=shore, 1=200m
  float depthAlpha     = 1.0 - sqrt(depthFraction);                   // 1.0 → 0.0

  // Shoaling boost: Ks > 1 means energy is concentrating — reinforce that visually.
  // Extra opacity proportional to how much above 1.0 Ks is, capped at +0.3.
  float shoalingBoost  = clamp((Ks - 1.0) * 0.5, 0.0, 0.3);

  // Breaking bonus: if depth-limited breaking fires, push to full opacity.
  float breakingBonus  = isBreaking ? 0.3 : 0.0;

  float effectAlpha    = clamp(depthAlpha + shoalingBoost + breakingBonus, 0.0, 1.0);

  // Discard pixels where the computed effect is negligible (avoids faint haze
  // at the 200 m boundary and land-adjacent noise).
  if (effectAlpha < 0.05) {
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
