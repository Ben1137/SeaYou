# P6.2.5 Input Validation v2 — Co-located + Pure-Math Ks

**Generated:** 2026-07-23T13:08:15.424Z  

---

## Part 1 — Co-located SoCal Input Check

> Open-Meteo at each buoy's OWN lat/lon vs that buoy's own WVHT — matched depth.

> 46086 (San Clemente Basin, 32.504N/118.029W) and 46232 (Point Loma South, 32.517N/117.425W)

> Both stations are inside the Southern California Bight — the same wave environment as Scripps.

### NDBC 46086 — San Clemente Basin (lat=32.504, lon=-118.029)
Buoy observations: 17421 hourly (2022-2023)

**best_match** — bucketed by model wave_period:
| Band | n | Mean Δ (m) | Median Δ | StdDev |
|------|---|-----------|----------|--------|
| short | 1392 | -0.036 | -0.022 | 0.170 |
| mid | 12463 | 0.016 | 0.020 | 0.150 |
| long | 3542 | 0.032 | 0.030 | 0.187 |

**best_match** — bucketed by buoy DPD:
| Band | n | Mean Δ (m) | Median Δ | StdDev |
|------|---|-----------|----------|--------|
| short | 1770 | -0.013 | -0.010 | 0.164 |
| mid | 4596 | 0.002 | 0.010 | 0.171 |
| long | 11055 | 0.025 | 0.030 | 0.154 |

**era5_ocean** — bucketed by model wave_period:
| Band | n | Mean Δ (m) | Median Δ | StdDev |
|------|---|-----------|----------|--------|
| short | 2577 | -0.058 | -0.040 | 0.204 |
| mid | 13672 | -0.041 | 0.005 | 0.220 |
| long | 1172 | -0.193 | -0.130 | 0.336 |

**era5_ocean** — bucketed by buoy DPD:
| Band | n | Mean Δ (m) | Median Δ | StdDev |
|------|---|-----------|----------|--------|
| short | 1770 | -0.036 | -0.025 | 0.160 |
| mid | 4596 | -0.097 | -0.070 | 0.216 |
| long | 11055 | -0.039 | 0.020 | 0.244 |

### NDBC 46232 — Point Loma South (lat=32.517, lon=-117.425)
Buoy observations: 16951 hourly (2022-2023)

**best_match** — bucketed by model wave_period:
| Band | n | Mean Δ (m) | Median Δ | StdDev |
|------|---|-----------|----------|--------|
| short | 892 | -0.013 | -0.000 | 0.187 |
| mid | 12065 | 0.056 | 0.055 | 0.136 |
| long | 3970 | 0.091 | 0.075 | 0.161 |

**best_match** — bucketed by buoy DPD:
| Band | n | Mean Δ (m) | Median Δ | StdDev |
|------|---|-----------|----------|--------|
| short | 933 | -0.009 | 0.000 | 0.176 |
| mid | 3536 | 0.054 | 0.060 | 0.159 |
| long | 12482 | 0.067 | 0.060 | 0.140 |

**era5_ocean** — bucketed by model wave_period:
| Band | n | Mean Δ (m) | Median Δ | StdDev |
|------|---|-----------|----------|--------|
| short | 1948 | 0.042 | 0.055 | 0.171 |
| mid | 13833 | 0.076 | 0.095 | 0.159 |
| long | 1170 | 0.007 | 0.045 | 0.223 |

**era5_ocean** — bucketed by buoy DPD:
| Band | n | Mean Δ (m) | Median Δ | StdDev |
|------|---|-----------|----------|--------|
| short | 933 | 0.026 | 0.035 | 0.151 |
| mid | 3536 | 0.030 | 0.050 | 0.178 |
| long | 12482 | 0.081 | 0.100 | 0.162 |

### Part 1 Interpretation

> **Open-Meteo is accurate in the SoCal Bight at all period bands (mean Δ < 0.10m).**
> The input is genuinely clean near Scripps. The excess at the nearshore buoy is real energy loss.
> Proceed to Part 2 to assess whether the shoaling law is correct before concluding TRANSFORM-BORN.

---

## Part 2 — Pure-Math Ks Verification

> Engine uses Fenton-McKee (1990) approximation. This check uses iterative Newton-Raphson dispersion.
> A 2% tolerance is applied: >2% divergence = implementation concern; <2% = law is correct, not the bug.

### Ks at depth d = 10 m

| T (s) | L (m) | kd | n | Ks_theory | Ks_engine | Δ% | Assessment |
|-------|-------|----|----|-----------|-----------|-----|------------|
| 8 | 70.9 | 0.886 | 0.8101 | 0.9326 | 0.9254 | -0.77% | ✓ within 2% |
| 10 | 92.4 | 0.680 | 0.8736 | 0.9835 | 0.9738 | -0.99% | ✓ within 2% |
| 12 | 113.3 | 0.555 | 0.9105 | 1.0438 | 1.0341 | -0.93% | ✓ within 2% |
| 15 | 144.1 | 0.436 | 0.9418 | 1.1374 | 1.1288 | -0.76% | ✓ within 2% |
| 18 | 174.6 | 0.360 | 0.9593 | 1.2288 | 1.2214 | -0.60% | ✓ within 2% |

> Breaking cap (γ·d) at d=10m = 7.80m. For typical swell Hs=1-3m, breaking **does NOT fire** (cap >> Hs) at this depth.

### Ks at depth d = 20 m

| T (s) | L (m) | kd | n | Ks_theory | Ks_engine | Δ% | Assessment |
|-------|-------|----|----|-----------|-----------|-----|------------|
| 8 | 88.8 | 1.416 | 0.6675 | 0.9181 | 0.9223 | 0.46% | ✓ within 2% |
| 10 | 121.2 | 1.037 | 0.7649 | 0.9174 | 0.9133 | -0.45% | ✓ within 2% |
| 12 | 152.3 | 0.825 | 0.8290 | 0.9433 | 0.9351 | -0.87% | ✓ within 2% |
| 15 | 197.5 | 0.636 | 0.8868 | 1.0013 | 0.9914 | -0.98% | ✓ within 2% |
| 18 | 241.6 | 0.520 | 0.9200 | 1.0665 | 1.0570 | -0.89% | ✓ within 2% |

> Breaking cap (γ·d) at d=20m = 15.60m. For typical swell Hs=1-3m, breaking **does NOT fire** (cap >> Hs) at this depth.

### Ks at depth d = 41 m

| T (s) | L (m) | kd | n | Ks_theory | Ks_engine | Δ% | Assessment |
|-------|-------|----|----|-----------|-----------|-----|------------|
| 8 | 98.8 | 2.607 | 0.5284 | 0.9781 | 0.9852 | 0.73% | ✓ within 2% |
| 10 | 147.0 | 1.753 | 0.6054 | 0.9365 | 0.9449 | 0.89% | ✓ within 2% |
| 12 | 194.9 | 1.322 | 0.6889 | 0.9148 | 0.9172 | 0.26% | ✓ within 2% |
| 15 | 263.9 | 0.976 | 0.7828 | 0.9220 | 0.9165 | -0.59% | ✓ within 2% |
| 18 | 330.2 | 0.780 | 0.8429 | 0.9532 | 0.9444 | -0.93% | ✓ within 2% |

> Breaking cap (γ·d) at d=41m = 31.98m. For typical swell Hs=1-3m, breaking **does NOT fire** (cap >> Hs) at this depth.

### Ks at depth d = 60 m

| T (s) | L (m) | kd | n | Ks_theory | Ks_engine | Δ% | Assessment |
|-------|-------|----|----|-----------|-----------|-----|------------|
| 8 | 99.8 | 3.778 | 0.5040 | 0.9966 | 0.9991 | 0.26% | ✓ within 2% |
| 10 | 153.8 | 2.452 | 0.5364 | 0.9727 | 0.9805 | 0.81% | ✓ within 2% |
| 12 | 212.2 | 1.776 | 0.6019 | 0.9380 | 0.9465 | 0.91% | ✓ within 2% |
| 15 | 299.0 | 1.261 | 0.7038 | 0.9135 | 0.9145 | 0.12% | ✓ within 2% |
| 18 | 382.2 | 0.986 | 0.7798 | 0.9211 | 0.9158 | -0.57% | ✓ within 2% |

> Breaking cap (γ·d) at d=60m = 46.80m. For typical swell Hs=1-3m, breaking **does NOT fire** (cap >> Hs) at this depth.

### Ks shape analysis at d=41m (the Scripps buoy depth)

Expected per linear wave theory: Ks ≤ 1 throughout intermediate water at 41m (engine should predict LESS than offshore H0).

All Ks ≤ 1 at d=41m? **YES — correct**

| T (s) | Ks_theory | Engine over-predicts offshore? |
|-------|-----------|-------------------------------|
| 8 | 0.9781 | No (Ks<1, correct) |
| 10 | 0.9365 | No (Ks<1, correct) |
| 12 | 0.9148 | No (Ks<1, correct) |
| 15 | 0.9220 | No (Ks<1, correct) |
| 18 | 0.9532 | No (Ks<1, correct) |

**Implication:** If Ks < 1 at 41m for all long-period T, then the engine ALREADY predicts less than offshore H0 due to shoaling physics.
If the output still over-predicts the nearshore buoy (C−D > 0), that cannot be caused by an over-aggressive Ks — the input H0 must itself be inflated relative to what reaches that buoy location.
This is consistent with a MISSING FEATURE (island shadowing / La Jolla canyon refraction) in the input field, not a transform bug.

---

## Final Recommendation

_(Auto-populated from Part 1 result — see Part 1 Interpretation section above)_

- If Part 1 shows Open-Meteo over-predicts in SoCal Bight: **INPUT FIX (regional model/resolution) — no physics change**
- If Part 1 shows accurate SoCal input AND Part 2 shows Ks_engine > Ks_theory (>2%): **IMPLEMENTATION BUG in shoaling approximation**
- If Part 1 shows accurate SoCal input AND Ks_engine matches theory: **MISSING FEATURE (island shadowing / canyon refraction) — P6.3 ML candidate, not a Ks edit**

> **Rule:** Do NOT edit transform.ts unless Part 2 confirms a genuine implementation bug (>2% Ks divergence).
> A per-location correction for refraction/shadowing belongs in P6.3, not in the shoaling law.

_Analysis only — transform.ts untouched, oracle 0.00%, no model trained._