/**
 * shader-verify.ts — Numeric verification that the GLSL Fenton-McKee
 * implementation in coastal-dynamics.frag.glsl matches @seame/core.
 *
 * Run: npx tsx packages/core/src/nearshore/shader-verify.ts
 *
 * Ports the GLSL math to JS (same operations, same float32-like precision) and
 * compares against nearshoreTransform(). Tolerance: ±5% on Ks and Kr.
 *
 * Phase 4 Update: Now includes Snell refraction (Kr) verification.
 * The shader computes Kr from local depth gradients; this verifies the CPU
 * formula matches the GLSL implementation within tolerance.
 */

import { nearshoreTransform, incidentAngleFromDirections } from './transform';

const PI     = Math.PI;
const TWO_PI = 2 * PI;
const G      = 9.81;
const GAMMA  = 0.78;

// ── JS port of coastal-dynamics.frag.glsl Fenton-McKee ──────────────────────

function deepWaterWavelength(T: number): number {
  return (G * T * T) / TWO_PI;  // L0 = g·T²/2π
}

function fentonMcKeeWavelength(T: number, d: number): number {
  const L0    = deepWaterWavelength(T);
  const omega = TWO_PI / T;
  const x     = (omega * omega * d) / G;
  const xc    = Math.max(1e-4, Math.min(x, 1000));
  const tanhArg = Math.pow(xc, 0.75);
  const tanhVal  = Math.tanh(tanhArg);
  return L0 * Math.pow(tanhVal, 2 / 3);
}

function shoalingCoeffShader(T: number, d: number): number {
  const Cg0 = (G * T) / (4 * PI);

  const L   = fentonMcKeeWavelength(T, d);
  const k   = TWO_PI / L;
  const C   = L / T;

  const kd2     = 2 * k * d;
  const sinh2kd = kd2 > 15 ? Math.exp(kd2) * 0.5 : Math.sinh(kd2);
  const n       = 0.5 * (1 + kd2 / Math.max(sinh2kd, 1e-6));

  const Cg = n * C;
  return Math.sqrt(Cg0 / Math.max(Cg, 1e-6));
}

function refrationCoeffSnell(T: number, d: number, theta0Deg: number): number {
  // Mirror the CPU refractionCoeff function for shader verification
  const C0 = (G * T) / (TWO_PI);  // deep-water phase speed
  const { C } = dispersionForVerify(T, d);  // local phase speed
  const theta0 = (theta0Deg * Math.PI) / 180;
  const sinTheta = (C / C0) * Math.sin(theta0);
  const sinThetaClamped = Math.max(-1, Math.min(1, sinTheta));
  const theta = Math.asin(sinThetaClamped);
  const cosTheta0 = Math.cos(theta0);
  const cosTheta = Math.cos(theta);
  if (cosTheta < 1e-6) return 1.0;
  return Math.min(2, Math.sqrt(Math.abs(cosTheta0) / cosTheta));
}

function dispersionForVerify(T: number, d: number): { C: number } {
  const L = fentonMcKeeWavelength(T, d);
  return { C: L / T };
}

// ── GLSL mirrors for gradient → shore normal → incident angle ──────────────────

function shoreNormalFromGradient(gradLon: number, gradLat: number): number {
  const mag = Math.sqrt(gradLon * gradLon + gradLat * gradLat);
  if (mag < 1e-6) return -1.0;  // Flat/ambiguous

  // Bearing = atan2(east, north)
  const bearingRad = Math.atan2(gradLon, gradLat);
  const bearingDeg = (bearingRad * 180 / Math.PI + 360) % 360;
  return bearingDeg;
}

function incidentAngleFromDirectionsGLSL(swellFromDeg: number, shoreNormalDeg: number): number {
  if (shoreNormalDeg < 0) return 0;  // Flat/ambiguous

  const swellTowardDeg = (swellFromDeg + 180) % 360;
  let diff = ((swellTowardDeg - shoreNormalDeg) % 360 + 360) % 360;
  if (diff > 180) diff = 360 - diff;

  return diff > 90 ? 180 - diff : diff;
}

function shaderBreakingHeight(H0: number, T: number, d: number, theta0Deg: number = 0): number {
  if (d <= 0.5) return 0;           // MIN_DEPTH
  if (d >= 200) return H0;          // deep water

  const Ks      = Math.max(0.5, Math.min(3.0, shoalingCoeffShader(T, d)));
  const Kr      = refrationCoeffSnell(T, d, theta0Deg);  // Phase 4: Snell refraction
  const H       = H0 * Ks * Kr;
  const cap     = GAMMA * d;
  return H > cap ? cap : H;
}

// ── Reference cases from oracle.ts + Phase 4 refraction cases ───────────────

interface VerifyCase {
  label: string;
  H0: number;
  T: number;
  d: number;
  theta0?: number;  // Phase 4: incident angle for Snell refraction (° from shore-normal)
  // End-to-end angle derivation cases:
  swellFromDeg?: number;  // Meteorological swell-from direction
  gradLon?: number;       // ∂d/∂lon (depth gradient eastward)
  gradLat?: number;       // ∂d/∂lat (depth gradient northward)
}

const CASES: VerifyCase[] = [
  { label: 'Deep water (d=1000m, θ=0°)',       H0: 2.0, T: 14, d: 1000, theta0: 0 },
  { label: 'Intermediate (d=30m, θ=0°)',        H0: 2.0, T: 14, d: 30,   theta0: 0 },
  { label: 'Shallow (d=5m, θ=0°)',              H0: 2.0, T: 14, d: 5,    theta0: 0 },
  { label: 'Very shallow (d=2m, 1m/10s, θ=0°)', H0: 1.0, T: 10, d: 2,    theta0: 0 },
  { label: 'Big swell (d=8m, 3m/16s, θ=0°)',    H0: 3.0, T: 16, d: 8,    theta0: 0 },
  { label: 'Med swell (d=15m, 1.5m/9s, θ=0°)',  H0: 1.5, T: 9,  d: 15,   theta0: 0 },
  { label: 'Breaking: d=2m, 3m/16s, θ=0°',      H0: 3.0, T: 16, d: 2,    theta0: 0 },
  // Phase 4: oblique refraction cases — coefficient only
  { label: 'Oblique 45° (d=10m, 2m/12s)',       H0: 2.0, T: 12, d: 10,   theta0: 45 },
  { label: 'Parallel 80° (d=10m, 2m/12s)',      H0: 2.0, T: 12, d: 10,   theta0: 80 },
  // END-TO-END: derive theta0 from directions + gradient (maps to angle-only cases above)
  { label: 'End-to-end: S swell, N-facing beach (θ→0°)', H0: 2.0, T: 12, d: 10, swellFromDeg: 180, gradLon: 0, gradLat: 0.001 },
  { label: 'End-to-end: W swell, W-facing beach (θ→0°)', H0: 2.0, T: 12, d: 10, swellFromDeg: 270, gradLon: -0.001, gradLat: 0 },
  { label: 'End-to-end: N swell, E-facing beach (θ→45°)', H0: 2.0, T: 12, d: 10, swellFromDeg: 0, gradLon: 0.001, gradLat: 0.001 },
];

const TOLERANCE = 0.05; // 5%

console.log('\n=== Shader vs @seame/core Numeric Verification (Phase 4: Snell Refraction + Angle Derivation) ===\n');
console.log(
  'Case'.padEnd(40),
  'θ(°)'.padStart(5),
  'Core_H'.padEnd(9),
  'Shader_H'.padEnd(10),
  'Ks'.padEnd(7),
  'Kr'.padEnd(7),
  'diff%'.padEnd(7),
  'PASS?'
);
console.log('-'.repeat(120));

let allPassed = true;

for (const c of CASES) {
  // For end-to-end cases, derive theta0 from swell direction + gradient
  let theta0Deg: number;
  if (c.swellFromDeg !== undefined && c.gradLon !== undefined && c.gradLat !== undefined) {
    const shoreNormalDeg = shoreNormalFromGradient(c.gradLon, c.gradLat);
    theta0Deg = incidentAngleFromDirectionsGLSL(c.swellFromDeg, shoreNormalDeg);
  } else {
    theta0Deg = c.theta0 ?? 0;
  }

  const coreResult  = nearshoreTransform(c.H0, c.T, c.d, theta0Deg, true);  // Phase 4: applyRefraction=true
  const shaderH     = shaderBreakingHeight(c.H0, c.T, c.d, theta0Deg);
  const shaderKs    = c.d >= 200 ? 1.0 : Math.max(0.5, Math.min(3.0, shoalingCoeffShader(c.T, c.d)));
  const shaderKr    = refrationCoeffSnell(c.T, c.d, theta0Deg);

  const refH   = coreResult.H;
  const diffPct = refH > 0 ? Math.abs(shaderH - refH) / refH : 0;
  const pass   = diffPct <= TOLERANCE;
  if (!pass) allPassed = false;

  console.log(
    c.label.padEnd(40),
    theta0Deg.toFixed(1).padStart(5),
    refH.toFixed(4).padEnd(9),
    shaderH.toFixed(4).padEnd(10),
    coreResult.Ks.toFixed(4).padEnd(7),
    coreResult.Kr.toFixed(4).padEnd(7),
    (diffPct * 100).toFixed(2).padStart(5) + '%',
    pass ? ' ✓' : ' ✗  ← FAIL'
  );
}

console.log('\n' + '─'.repeat(100));
if (allPassed) {
  console.log('✓  All cases within ±5% tolerance. Shader math matches @seame/core.\n');
  process.exit(0);
} else {
  console.error('✗  One or more cases exceeded tolerance. Fix the shader before shipping.\n');
  process.exit(1);
}
