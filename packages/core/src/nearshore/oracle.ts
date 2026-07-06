/**
 * nearshore-oracle.ts — CPU reference values for shader numeric verification.
 *
 * Run: npx tsx packages/core/src/nearshore/oracle.ts
 *
 * Prints a table of (H0, T, depth) → { Ks, H_shoaled, breaking, H_final }
 * from the canonical @seame/core nearshoreTransform(). The GPU shader must
 * reproduce these values within ±5% tolerance.
 *
 * Test cases chosen to cover:
 *   1. Deep water — Ks ≈ 1 (shoaling trough), no breaking
 *   2. Intermediate water (transition zone) — Ks > 1, no breaking
 *   3. Shallow water breaking — H > γ·d cap fires
 *   4. Very shallow — strong breaking cap
 *   5. Secondary swell interaction — energy combination
 */

import { nearshoreTransform, komarGaughanBreakerHeight } from './transform';
import { combineSwellPartitions } from './energy';

interface OracleCase {
  label: string;
  H0: number;  // deep-water swell height (m)
  T: number;   // wave period (s)
  depth: number; // effective depth in m (positive = below surface)
  thetaDeg?: number; // deep-water approach angle (deg from shore-normal)
  straightContour?: boolean;
}

const CASES: OracleCase[] = [
  { label: 'Deep water (d=1000m, 2m/14s)',    H0: 2.0, T: 14, depth: 1000 },
  { label: 'Intermediate (d=30m, 2m/14s)',     H0: 2.0, T: 14, depth: 30 },
  { label: 'Shallow (d=5m, 2m/14s) — breaks', H0: 2.0, T: 14, depth: 5 },
  { label: 'Very shallow (d=2m, 1m/10s)',      H0: 1.0, T: 10, depth: 2 },
  { label: 'Big swell (d=8m, 3m/16s)',         H0: 3.0, T: 16, depth: 8 },
  { label: 'Oblique 45° (d=10m, 2m/12s)',      H0: 2.0, T: 12, depth: 10, thetaDeg: 45 },
  { label: 'Oblique 60° (d=10m, 2m/12s)',      H0: 2.0, T: 12, depth: 10, thetaDeg: 60 },
  { label: 'Med swell (d=15m, 1.5m/9s)',       H0: 1.5, T: 9,  depth: 15 },
  { label: 'Breaking: d=2m, 3m/16s (γ·d=1.56)', H0: 3.0, T: 16, depth: 2 },
];

console.log('\n=== Nearshore Oracle — CPU Reference Values ===\n');
console.log(
  'Case'.padEnd(42),
  'H0(m)',
  'T(s)',
  'd(m)',
  'Ks'.padEnd(7),
  'Kr'.padEnd(7),
  'H_final(m)',
  'breaking',
  'H_KG(m)'
);
console.log('-'.repeat(110));

for (const c of CASES) {
  const result = nearshoreTransform(c.H0, c.T, c.depth, c.thetaDeg ?? 0, c.straightContour ?? false);
  const H_kg = komarGaughanBreakerHeight(c.H0, c.T);
  console.log(
    c.label.padEnd(42),
    c.H0.toFixed(1).padStart(5),
    c.T.toFixed(0).padStart(4),
    c.depth.toFixed(0).padStart(5),
    result.Ks.toFixed(4).padStart(7),
    result.Kr.toFixed(4).padStart(7),
    result.H.toFixed(3).padStart(10),
    result.breaking ? 'YES' : 'no ',
    H_kg.toFixed(3).padStart(7)
  );
}

// Multi-swell energy combination example
console.log('\n=== Multi-Swell Energy Combination ===\n');
const primary   = { H: 2.0, T: 14, direction: 270 };
const secondary = { H: 1.5, T: 8,  direction: 260 };

const primary_d15   = nearshoreTransform(primary.H,   primary.T,   15);
const secondary_d15 = nearshoreTransform(secondary.H, secondary.T, 15);
const combined = combineSwellPartitions([
  { height: primary_d15.H,   period: primary.T,   directionDeg: primary.direction   },
  { height: secondary_d15.H, period: secondary.T, directionDeg: secondary.direction },
]);

console.log(`Primary   @ d=15m: H=${primary_d15.H.toFixed(3)}m  breaking=${primary_d15.breaking}`);
console.log(`Secondary @ d=15m: H=${secondary_d15.H.toFixed(3)}m  breaking=${secondary_d15.breaking}`);
console.log(`Combined  H_sig=${combined.combinedHeight.toFixed(3)}m  dominant_T=${combined.dominant?.period ?? 'null'}s`);

// Export reference table for automated shader comparison
export const ORACLE_CASES = CASES.map(c => {
  const result = nearshoreTransform(c.H0, c.T, c.depth, c.thetaDeg ?? 0, c.straightContour ?? false);
  return {
    label: c.label,
    H0: c.H0,
    T: c.T,
    depth: c.depth,
    Ks: result.Ks,
    Kr: result.Kr,
    H_final: result.H,
    breaking: result.breaking,
    breakingCap: result.breakingCap,
  };
});
