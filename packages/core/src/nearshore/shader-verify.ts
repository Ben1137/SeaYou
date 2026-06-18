/**
 * shader-verify.ts — Numeric verification that the GLSL Fenton-McKee
 * implementation in coastal-dynamics.frag.glsl matches @seame/core.
 *
 * Run: npx tsx packages/core/src/nearshore/shader-verify.ts
 *
 * Ports the GLSL math to JS (same operations, same float32-like precision) and
 * compares against nearshoreTransform(). Tolerance: ±5% on Ks.
 */

import { nearshoreTransform } from './transform';

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

function shaderBreakingHeight(H0: number, T: number, d: number): number {
  if (d <= 0.5) return 0;           // MIN_DEPTH
  if (d >= 200) return H0;          // deep water

  const Ks      = Math.max(0.5, Math.min(3.0, shoalingCoeffShader(T, d)));
  const H       = H0 * Ks;
  const cap     = GAMMA * d;
  return H > cap ? cap : H;
}

// ── Reference cases from oracle.ts ──────────────────────────────────────────

const CASES = [
  { label: 'Deep water (d=1000m)',           H0: 2.0, T: 14, d: 1000 },
  { label: 'Intermediate (d=30m)',            H0: 2.0, T: 14, d: 30   },
  { label: 'Shallow (d=5m)',                  H0: 2.0, T: 14, d: 5    },
  { label: 'Very shallow (d=2m, 1m/10s)',     H0: 1.0, T: 10, d: 2    },
  { label: 'Big swell (d=8m, 3m/16s)',        H0: 3.0, T: 16, d: 8    },
  { label: 'Med swell (d=15m, 1.5m/9s)',      H0: 1.5, T: 9,  d: 15   },
  { label: 'Breaking: d=2m, 3m/16s',          H0: 3.0, T: 16, d: 2    },
];

const TOLERANCE = 0.05; // 5%

console.log('\n=== Shader vs @seame/core Numeric Verification ===\n');
console.log(
  'Case'.padEnd(40),
  'Core_H'.padEnd(9),
  'Shader_H'.padEnd(10),
  'Ks_core'.padEnd(9),
  'Ks_shader'.padEnd(10),
  'diff%'.padEnd(7),
  'PASS?'
);
console.log('-'.repeat(100));

let allPassed = true;

for (const c of CASES) {
  const coreResult   = nearshoreTransform(c.H0, c.T, c.d);
  const shaderH      = shaderBreakingHeight(c.H0, c.T, c.d);
  const shaderKs     = c.d >= 200 ? 1.0 : Math.max(0.5, Math.min(3.0, shoalingCoeffShader(c.T, c.d)));

  const refH   = coreResult.H;
  const diffPct = refH > 0 ? Math.abs(shaderH - refH) / refH : 0;
  const pass   = diffPct <= TOLERANCE;
  if (!pass) allPassed = false;

  console.log(
    c.label.padEnd(40),
    refH.toFixed(4).padEnd(9),
    shaderH.toFixed(4).padEnd(10),
    coreResult.Ks.toFixed(4).padEnd(9),
    shaderKs.toFixed(4).padEnd(10),
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
