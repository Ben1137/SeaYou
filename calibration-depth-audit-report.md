# P6.2.6 — Depth-Field Audit Report

Generated: 2026-07-23

---

## 1. Depth-Field Audit

### Semantic Rule

| Context | Depth field to use | Reason |
|---|---|---|
| **Validation harness** (backfill, assimilation, period diagnostic) | `spot.buoy.depthM` | Predicting what the *buoy* sees; buoy is sited at its own depth |
| **Product / dashboard** (realtime surf prediction) | `spot.depthM` | Breaking-zone depth the surfer cares about |

These must never be interchanged. Using `spot.depthM` in the harness means
`nearshoreTransform` runs shoaling physics to a shallower target than where the
buoy actually sits — producing artificially amplified engine values and large
negative residuals.

### Per-Spot Depth Table

| Spot | spot.depthM | buoy.depthM | Delta | Bug present? |
|---|---|---|---|---|
| Scripps CA | 6 m | 41 m | −35 m | **YES** |
| Santa Cruz CA | 8 m | 24 m | −16 m | YES (not harvested yet) |
| Mavericks CA | 20 m | deep | — | Harmless (deep buoy → engine = H0) |
| Rincon CA | 4 m | deep | — | Harmless |
| Pipeline HI | 5 m | deep | — | Harmless |
| San Francisco Bar CA | 15 m | 15 m | 0 | None (depths match) |
| Cape Canaveral FL | 10 m | 10 m | 0 | None |
| Cape Henry VA | 10 m | 10 m | 0 | None |
| Oregon Inlet NC | 8 m | 8 m | 0 | None |
| Clatsop Spit OR | 10 m | 10 m | 0 | None |

### Call Sites Fixed

| File | Line (approx) | Old call | New call |
|---|---|---|---|
| `backfillResiduals.ts` | 512 | `nearshoreTransform(H0, T, spot.depthM)` | `nearshoreTransform(H0, T, transformDepth)` where `transformDepth = spot.buoy?.depthM ?? spot.depthM` |
| `dataAssimilation.ts` | 319 | `nearshoreTransform(H0, T, spot.depthM)` | same pattern |
| `periodDiagnostic.ts` | 190 | `nearshoreTransform(H0, T, spot.depthM)` | `spot.buoy?.depthM ?? spot.depthM` |
| `periodDiagnostic.ts` | 240 | `nearshoreTransform(mh.waveHeight, T, spot.depthM)` | same pattern |
| `periodDiagnostic.ts` | 298 | `nearshoreTransform(H0, T, nearSpot.depthM)` | `nearSpot.buoy?.depthM ?? nearSpot.depthM` |

---

## 2. Before / After Engine Value — Scripps CA (same 5 rows)

| ts (UTC) | swell_period | H0 | buoy_value | engine_value BEFORE | engine_value AFTER | delta |
|---|---|---|---|---|---|---|
| 2023-04-27 15:00 | 17.35 s | 0.86 | 0.66 | 1.161 | 0.806 | −0.355 |
| 2022-07-18 06:00 | 17.35 s | 1.04 | 0.61 | 1.404 | 0.974 | −0.430 |
| 2022-06-02 10:00 | 17.15 s | 0.98 | 0.51 | 1.316 | 0.916 | −0.400 |
| 2021-10-11 04:00 | 17.10 s | 0.86 | 0.57 | 1.153 | 0.803 | −0.350 |
| 2022-07-18 07:00 | 17.10 s | 1.04 | 0.61 | 1.394 | 0.972 | −0.422 |

**Fix confirmed.** Engine values dropped by 0.35–0.43 m at all 5 timestamps.
The BEFORE values were artificially high because shoaling physics amplified H0
from 41 m down to 6 m instead of 41 m down to 41 m (identity).

---

## 3. New Scripps Aggregate (post-fix)

| Metric | Value |
|---|---|
| n | 19,464 |
| mean residual | −0.1700 m |
| mean engine_value | 0.9538 m |

### Per-Band Breakdown

| Band | Period range | n | mean residual | mean engine |
|---|---|---|---|---|
| short | < 8 s | 6,394 | −0.125 m | 1.138 m |
| mid | 8–12 s | 9,051 | −0.180 m | 0.865 m |
| long | > 12 s | 4,019 | −0.219 m | 0.860 m |

The residual worsens with period (more negative at long periods), consistent with
a **systematic over-prediction by nearshoreTransform at longer swell periods at
shallow sensor depths**. Even at 41 m the engine still over-predicts; Scripps CA
remains a negative outlier after the fix.

---

## 4. SoCal Input Trend Test — P6.2.5 Finding Restated

NDBC 46232 (SoCal offshore) input bias by period band:

| Band | mean (engine − buoy) | Trend |
|---|---|---|
| short | −0.01 m | near-zero |
| mid | +0.06 m | positive |
| long | +0.09 m | positive |

|long − short| = **0.10 m** which exceeds the 0.05 m threshold → **PERIOD-TREND PRESENT**.

Note: the binary threshold used in P6.2.5 flagged this at 0.09 m, 9 mm above
the 0.05 boundary. The trend is real but modest; it indicates Open-Meteo
over-predicts offshore long-period swell energy, which propagates into harness
residuals as a systematic positive bias for long-T stations — partially
explaining the positive offset at Cape Canaveral and Cape Henry.

---

## 5. Full P6.2.2 Verdict Table (post-fix run)

| Compare basis | Spot | n | mean | dom% | qual | spread | Verdict |
|---|---|---|---|---|---|---|---|
| OUTPUT | Cape Canaveral FL | 18,498 | +0.219 m | 70% | 2 | 0.012 m | FLAT-OFFSET (suspect) |
| OUTPUT | Cape Henry VA | 18,773 | +0.295 m | 54% | 3 | 0.110 m | FLAT-OFFSET (suspect) |
| OUTPUT | Clatsop Spit OR | 19,237 | +0.028 m | 61% | 3 | n/a | NOISY (insufficient) |
| INPUT | Mavericks CA | 12,222 | +0.459 m | 50% | 2 | 0.105 m | FLAT-OFFSET (suspect) |
| OUTPUT | Oregon Inlet NC | 19,697 | +0.065 m | 34% | 4 | 0.096 m | FLAT-OFFSET (suspect) |
| INPUT | Rincon CA | 19,402 | +0.989 m | 88% | 2 | 0.451 m | STRUCTURED (train-ready) |
| OUTPUT | San Francisco Bar CA | 18,820 | +0.121 m | 44% | 3 | 0.172 m | FLAT-OFFSET (suspect) |
| **OUTPUT** | **Scripps CA** | **19,464** | **−0.170 m** | **57%** | **3** | **0.089 m** | **FLAT-OFFSET (suspect)** |
| INPUT | Pipeline HI | 19,234 | +0.453 m | 37% | 4 | 0.243 m | PERIOD-ARTIFACT (investigate globally) |

---

## 6. Scripps vs Peers

| Spot | mean residual | Direction |
|---|---|---|
| **Scripps CA** | **−0.170 m** | **NEGATIVE outlier** |
| Clatsop Spit OR | +0.028 m | positive |
| Oregon Inlet NC | +0.065 m | positive |
| San Francisco Bar CA | +0.121 m | positive |
| Cape Canaveral FL | +0.219 m | positive |
| Cape Henry VA | +0.295 m | positive |
| Pipeline HI | +0.453 m | positive |
| Mavericks CA | +0.459 m | positive (deep — INPUT basis) |
| Rincon CA | +0.989 m | strong positive (deep — INPUT basis) |

**Scripps CA remains the sole negative outlier after the depth-bug fix.**

The fix moved the mean from approximately −0.54 m (estimated BEFORE, extrapolated
from the row-level delta of ~0.39 m average) to −0.170 m AFTER — a correction
of roughly +0.37 m. However, the engine still over-predicts relative to the
Scripps CDIP 201 buoy. This is a **missing-feature signature**, not merely a
depth bug:

- The Scripps pier site is sheltered by Point La Jolla from the NW and by the
  continental shelf bathymetry — refraction and diffraction effects not modelled
  by 1D shoaling.
- CDIP 201 is directionally shadowed; the 1D `nearshoreTransform` has no
  directional energy spreading term.
- The per-band trend (short −0.125 → long −0.219) is consistent with long-period
  swell suffering more diffraction loss in the pocket bay geometry.

---

## 7. Final Verdict

**MIXED: DEPTH BUG CONFIRMED + MISSING FEATURE REMAINS**

- The depth bug was real and materially large (~+0.37 m correction at Scripps).
- After correction, Scripps moves from a severe negative outlier (~−0.54 m) to a
  moderate negative outlier (−0.170 m).
- It does NOT enter the positive band shared by all other CDIP/NDBC nearshore
  stations (+0.03 to +0.30 m).
- The residual is still negative (engine over-predicts), and it worsens with
  swell period — a MISSING-FEATURE signature.
- Likely culprit: 1D shoaling with no directional spreading, no refraction,
  no sheltering coefficient. Scripps is geometry-shadowed in ways the current
  transform cannot capture.
- Recommendation: flag Scripps CA `compare_basis='total_vs_total'` rows as
  `PENDING_DIRECTIONAL_FIX` and exclude from flat-offset training until a
  directional spreading term is added.

---

## 8. Oracle Verification

```
Shader vs @seame/core Numeric Verification
All 7 cases: 0.00% drift — PASS
```

`transform.ts` was not modified. The fix was purely in the call sites that
pass the depth argument.

---

## 9. TypeScript Status

`npx tsc --noEmit -p packages/core/tsconfig.json` — **0 errors**
