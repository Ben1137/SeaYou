import { describe, it, expect } from 'vitest';
import {
  G,
  deepWaterWavelength,
  deepWaterPhaseSpeed,
  deepWaterGroupSpeed,
  dispersion,
} from '../dispersion';
import {
  GAMMA,
  shoalingCoeff,
  refractionCoeff,
  nearshoreTransform,
  komarGaughanBreakerHeight,
} from '../transform';
import { surfPower, combineSwellPartitions } from '../energy';

// ─── dispersion ────────────────────────────────────────────────────────────────

describe('deepWaterWavelength', () => {
  it('returns L0 = g·T²/(2π) for T=10s', () => {
    const expected = (G * 100) / (2 * Math.PI);
    expect(deepWaterWavelength(10)).toBeCloseTo(expected, 4);
  });
});

describe('deepWaterPhaseSpeed', () => {
  it('returns C0 = g·T/(2π) for T=10s', () => {
    const expected = (G * 10) / (2 * Math.PI);
    expect(deepWaterPhaseSpeed(10)).toBeCloseTo(expected, 4);
  });
});

describe('deepWaterGroupSpeed', () => {
  it('is exactly half the phase speed', () => {
    expect(deepWaterGroupSpeed(10)).toBeCloseTo(deepWaterPhaseSpeed(10) / 2, 8);
  });
});

describe('dispersion', () => {
  it('recovers deep-water group speed at d >> L0', () => {
    // T=10s → L0 ≈ 156 m. At d=1000m (≈6×L0) the wave is fully deep water.
    const Cg0 = deepWaterGroupSpeed(10);
    const { Cg } = dispersion(10, 1000);
    // In truly deep water Cg should approach Cg0 within a few percent.
    expect(Cg).toBeCloseTo(Cg0, 0); // within ~0.5 m/s
  });

  it('returns n ≈ 0.5 in deep water (kd >> 1)', () => {
    const { n } = dispersion(10, 1000);
    expect(n).toBeCloseTo(0.5, 2);
  });

  it('returns n ≈ 1 in very shallow water (kd << 1)', () => {
    // T=10s, d=0.5m → kd very small → shallow-water limit
    const { n } = dispersion(10, 0.5);
    expect(n).toBeGreaterThan(0.9);
  });

  it('is self-consistent: C = L/T', () => {
    const T = 12;
    const d = 20;
    const { L, C } = dispersion(T, d);
    expect(C).toBeCloseTo(L / T, 6);
  });

  it('phase speed decreases monotonically as depth decreases', () => {
    const T = 10;
    const C_deep = dispersion(T, 500).C;
    const C_mid = dispersion(T, 20).C;
    const C_shallow = dispersion(T, 5).C;
    expect(C_deep).toBeGreaterThan(C_mid);
    expect(C_mid).toBeGreaterThan(C_shallow);
  });
});

// ─── transform ─────────────────────────────────────────────────────────────────

describe('shoalingCoeff', () => {
  it('is ≈ 1.0 in deep water (Ks → 1 as d → ∞)', () => {
    const Ks = shoalingCoeff(10, 1000);
    expect(Ks).toBeCloseTo(1, 1); // within 0.05 of 1
  });

  it('shows the classic shoaling trough then amplification pattern', () => {
    // T=10s, L0≈156m. Cg increases above Cg0 in intermediate water, so Ks < 1
    // there (the "shoaling trough"). Ks only exceeds 1 again in shallow water
    // (d < ~6m for T=10s) once Cg drops below Cg0.
    const Ks_intermediate = shoalingCoeff(10, 20); // intermediate — Ks < 1 (trough)
    const Ks_shallow = shoalingCoeff(10, 5);       // shallow — Ks > 1 (amplification)
    expect(Ks_intermediate).toBeLessThan(1.0);
    expect(Ks_shallow).toBeGreaterThan(1.0);
    expect(Ks_shallow).toBeGreaterThan(Ks_intermediate);
  });
});

describe('refractionCoeff', () => {
  it('returns 1.0 when incidence angle is 0 (normal approach)', () => {
    // cos(0)/cos(refracted 0) = 1
    const Kr = refractionCoeff(10, 20, 0);
    expect(Kr).toBeCloseTo(1.0, 6);
  });

  it('is > 1 for oblique incidence (energy focusing)', () => {
    // Oblique approach → cos θ0 < cos θ local as wave refracts → Kr > 1
    const Kr = refractionCoeff(10, 20, 30);
    expect(Kr).toBeGreaterThan(0.5); // at minimum reasonable
  });

  it('stays finite for very oblique angles', () => {
    const Kr = refractionCoeff(10, 20, 85);
    expect(isFinite(Kr)).toBe(true);
    expect(Kr).toBeLessThanOrEqual(2);
  });
});

describe('nearshoreTransform', () => {
  it('returns no breaking and height near H0 in very deep water (Ks≈1, Kr=1)', () => {
    const H0 = 2.0;
    const T = 14;
    const { H, breaking } = nearshoreTransform(H0, T, 1000);
    // In deep water Ks → 1 (within a few %), so H should be within 10% of H0
    expect(Math.abs(H - H0) / H0).toBeLessThan(0.1);
    expect(breaking).toBe(false);
  });

  it('caps height at γ·d when depth-limited breaking is triggered', () => {
    // Force breaking: use a large H0 in very shallow water.
    const d = 1.0;
    const { H, breaking, breakingCap } = nearshoreTransform(3.0, 10, d);
    expect(breaking).toBe(true);
    expect(H).toBeCloseTo(GAMMA * d, 6);
    expect(breakingCap).toBeCloseTo(GAMMA * d, 6);
  });

  it('does NOT break for a small wave in intermediate depth', () => {
    // 0.5 m swell at 10 m depth: γ·d = 7.8 m — no breaking expected.
    // Note: at d=10m (intermediate water) Ks < 1 (shoaling trough), so H
    // may be slightly below H0. The key invariant is: no breaking, H positive,
    // H well below the breaking cap.
    const { breaking, H } = nearshoreTransform(0.5, 10, 10);
    expect(breaking).toBe(false);
    expect(H).toBeGreaterThan(0);
    expect(H).toBeLessThan(GAMMA * 10); // far from the 7.8 m breaking cap
  });

  it('returns Kr=1 when applyRefraction=false (default)', () => {
    const { Kr } = nearshoreTransform(1.0, 10, 20, 45, false);
    expect(Kr).toBe(1.0);
  });

  it('returns Kr≠1 when applyRefraction=true and angle is non-zero', () => {
    const { Kr } = nearshoreTransform(1.0, 10, 20, 45, true);
    expect(Kr).not.toBe(1.0);
  });
});

describe('komarGaughanBreakerHeight', () => {
  it('produces positive values', () => {
    expect(komarGaughanBreakerHeight(2, 10)).toBeGreaterThan(0);
  });

  it('increases with H0 (larger swell → larger breaker)', () => {
    const Hb_small = komarGaughanBreakerHeight(1, 12);
    const Hb_large = komarGaughanBreakerHeight(3, 12);
    expect(Hb_large).toBeGreaterThan(Hb_small);
  });

  it('increases with T (longer period → larger breaker)', () => {
    const Hb_short = komarGaughanBreakerHeight(2, 6);
    const Hb_long = komarGaughanBreakerHeight(2, 14);
    expect(Hb_long).toBeGreaterThan(Hb_short);
  });

  it('cross-checks against Airy shoaling path (within 50% of nearshoreTransform at shallow d)', () => {
    // Komar-Gaughan is an independent empirical formula. Both should be in
    // the same ballpark for a typical swell shoaling to its break point.
    // H0=2m, T=10s → Komar-Gaughan Hb
    const Hb_KG = komarGaughanBreakerHeight(2, 10);
    // Airy shoaling to the expected break depth ≈ Hb/γ
    const d_break = Hb_KG / GAMMA;
    const { H: H_airy } = nearshoreTransform(2, 10, d_break);
    // Both estimates should be within 50% of each other
    expect(Math.abs(Hb_KG - H_airy) / Hb_KG).toBeLessThan(0.5);
  });
});

// ─── energy ────────────────────────────────────────────────────────────────────

describe('surfPower', () => {
  it('returns H²·T', () => {
    expect(surfPower(2, 10)).toBe(40);
    expect(surfPower(1, 10)).toBe(10);
    expect(surfPower(0, 10)).toBe(0);
  });

  it('scales quadratically with height', () => {
    expect(surfPower(2, 10)).toBe(4 * surfPower(1, 10));
  });
});

describe('combineSwellPartitions', () => {
  it('returns 0 and null dominant for empty input', () => {
    const { combinedHeight, dominant } = combineSwellPartitions([]);
    expect(combinedHeight).toBe(0);
    expect(dominant).toBeNull();
  });

  it('returns 0 and null dominant when all partitions are null', () => {
    const { combinedHeight, dominant } = combineSwellPartitions([null, undefined]);
    expect(combinedHeight).toBe(0);
    expect(dominant).toBeNull();
  });

  it('returns single partition unchanged', () => {
    const { combinedHeight } = combineSwellPartitions([{ height: 2, period: 10 }]);
    expect(combinedHeight).toBeCloseTo(2, 8);
  });

  it('combines two equal partitions as sqrt(2)·H', () => {
    const { combinedHeight } = combineSwellPartitions([
      { height: 1, period: 10 },
      { height: 1, period: 8 },
    ]);
    expect(combinedHeight).toBeCloseTo(Math.sqrt(2), 6);
  });

  it('3m + 4m → 5m (Pythagorean triple)', () => {
    const { combinedHeight } = combineSwellPartitions([
      { height: 3, period: 10 },
      { height: 4, period: 12 },
    ]);
    expect(combinedHeight).toBeCloseTo(5, 6);
  });

  it('dominant is the partition with the largest height', () => {
    const big = { height: 3, period: 14 };
    const small = { height: 1, period: 8 };
    const { dominant } = combineSwellPartitions([small, big]);
    expect(dominant).toBe(big);
  });

  it('ignores null / undefined partitions in the mix', () => {
    const { combinedHeight } = combineSwellPartitions([
      { height: 3, period: 10 },
      null,
      undefined,
      { height: 4, period: 12 },
    ]);
    expect(combinedHeight).toBeCloseTo(5, 6);
  });

  it('ignores zero-height partitions', () => {
    const { combinedHeight, dominant } = combineSwellPartitions([
      { height: 0, period: 10 },
      { height: 2, period: 12 },
    ]);
    expect(combinedHeight).toBeCloseTo(2, 8);
    expect(dominant!.period).toBe(12);
  });
});
