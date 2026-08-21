# P6.2.4 Input Validation Report — Matched-Depth INPUT vs TRANSFORM Fork

**Generated:** 2026-07-24T09:07:24.217Z  

---

## Part 1 — Matched-Depth Input Check

> Open-Meteo sampled AT EACH DEEP BUOY'S lat/lon vs that buoy's own WVHT.
> Positive Δ = Open-Meteo over-predicts. Both period-bucketing conventions shown.

### Mavericks CA — NDBC 46012 (lat=37.363, lon=-122.881, depth=206m)

**best_match** — bucketed by model wave_period:
| Band | n | Mean Δ (m) | Median Δ | StdDev |
|------|---|-----------|----------|--------|
| short | 1321 | 0.093 | 0.100 | 0.230 |
| mid | 6841 | 0.066 | 0.075 | 0.230 |
| long | 1860 | 0.041 | 0.050 | 0.315 |

**best_match** — bucketed by buoy DPD:
| Band | n | Mean Δ (m) | Median Δ | StdDev |
|------|---|-----------|----------|--------|
| short | 1041 | 0.072 | 0.080 | 0.229 |
| mid | 3604 | 0.078 | 0.085 | 0.245 |
| long | 5377 | 0.055 | 0.065 | 0.254 |

**era5_ocean** — bucketed by model wave_period:
| Band | n | Mean Δ (m) | Median Δ | StdDev |
|------|---|-----------|----------|--------|
| short | 2409 | 0.102 | 0.110 | 0.258 |
| mid | 6743 | -0.098 | -0.045 | 0.301 |
| long | 870 | -0.311 | -0.270 | 0.395 |

**era5_ocean** — bucketed by buoy DPD:
| Band | n | Mean Δ (m) | Median Δ | StdDev |
|------|---|-----------|----------|--------|
| short | 1041 | 0.116 | 0.110 | 0.255 |
| mid | 3604 | -0.051 | -0.020 | 0.292 |
| long | 5377 | -0.116 | -0.050 | 0.337 |

### Rincon CA — NDBC 46054 (lat=34.274, lon=-120.459, depth=464m)

**best_match** — bucketed by model wave_period:
| Band | n | Mean Δ (m) | Median Δ | StdDev |
|------|---|-----------|----------|--------|
| short | 3684 | 0.037 | 0.050 | 0.183 |
| mid | 10877 | 0.071 | 0.080 | 0.210 |
| long | 2641 | 0.013 | 0.035 | 0.285 |

**best_match** — bucketed by buoy DPD:
| Band | n | Mean Δ (m) | Median Δ | StdDev |
|------|---|-----------|----------|--------|
| short | 2851 | 0.045 | 0.060 | 0.179 |
| mid | 6493 | 0.058 | 0.060 | 0.216 |
| long | 7882 | 0.056 | 0.080 | 0.235 |

**era5_ocean** — bucketed by model wave_period:
| Band | n | Mean Δ (m) | Median Δ | StdDev |
|------|---|-----------|----------|--------|
| short | 4747 | -0.149 | -0.135 | 0.251 |
| mid | 11371 | -0.166 | -0.130 | 0.291 |
| long | 1108 | -0.446 | -0.380 | 0.424 |

**era5_ocean** — bucketed by buoy DPD:
| Band | n | Mean Δ (m) | Median Δ | StdDev |
|------|---|-----------|----------|--------|
| short | 2851 | -0.122 | -0.100 | 0.229 |
| mid | 6493 | -0.191 | -0.170 | 0.270 |
| long | 7882 | -0.191 | -0.140 | 0.340 |

### Pipeline HI — NDBC 51001 (lat=24.475, lon=-162.03, depth=3430m)

**best_match** — bucketed by model wave_period:
| Band | n | Mean Δ (m) | Median Δ | StdDev |
|------|---|-----------|----------|--------|
| short | 3511 | 0.054 | 0.060 | 0.121 |
| mid | 12338 | 0.057 | 0.065 | 0.173 |
| long | 1433 | -0.024 | 0.010 | 0.367 |

**best_match** — bucketed by buoy DPD:
| Band | n | Mean Δ (m) | Median Δ | StdDev |
|------|---|-----------|----------|--------|
| short | 2927 | 0.060 | 0.060 | 0.120 |
| mid | 8389 | 0.059 | 0.065 | 0.151 |
| long | 5990 | 0.031 | 0.060 | 0.253 |

**era5_ocean** — bucketed by model wave_period:
| Band | n | Mean Δ (m) | Median Δ | StdDev |
|------|---|-----------|----------|--------|
| short | 5094 | 0.005 | 0.020 | 0.164 |
| mid | 11368 | 0.032 | 0.070 | 0.265 |
| long | 844 | -0.179 | -0.133 | 0.551 |

**era5_ocean** — bucketed by buoy DPD:
| Band | n | Mean Δ (m) | Median Δ | StdDev |
|------|---|-----------|----------|--------|
| short | 2927 | 0.034 | 0.040 | 0.153 |
| mid | 8389 | 0.019 | 0.035 | 0.219 |
| long | 5990 | -0.004 | 0.060 | 0.355 |

---

## Part 2 — Three-Point Chain (Scripps CA only)

> Santa Cruz CA: CDIP 281 (Soquel Cove South) started Dec 2024 — no 2022-2023 archive. Scripps only.

> Chain: A=Open-Meteo@deep-buoy-coords | B=deep-buoy WVHT | C=engine HFinal@Scripps | D=CDIP-201 Hs

> A−B = input error at matched depth | C−D = engine output error | (C−D)−(A−B) = transform contribution

| Period band | n | A−B (input @ matched depth) | C−D (engine output error) | Transform contrib | Verdict |
|-------------|---|-----------------------------|--------------------------|-------------------|---------|
| short | 1388 | 0.110 | 0.091 | -0.042 | **INPUT-dominant** |
| mid | 12080 | 0.068 | 0.135 | 0.059 | **INPUT-dominant** |
| long | 3816 | 0.040 | 0.248 | 0.197 | **TRANSFORM-BORN** |

> A−B uses the closest deep buoy (NDBC 46012 / Mavericks, ~350km north of Scripps) as the offshore reference.
> A perfect spatial match is unavailable; directional bias at each location may differ.

---

## Part 3 — Depth-Config Audit & Scripps vs Santa Cruz Divergence

### Configured depthM vs actual buoy water depth

| Spot | Buoy | Configured depthM | Actual depth | Discrepancy | Notes |
|------|------|------------------|-------------|-------------|-------|
| Scripps CA | CDIP-201 | 41m | 41m | 0.0m | Corrected in P6.2.4 pre-flight (was 10m; now matches THREDDS 41.0m) |
| Santa Cruz CA | CDIP-028→281 | 24m | 23.5m | 0.5m | CDIP 028 was wrong station (387m deep at Catalina); corrected to CDIP 281 (Soquel Cove South, 23.5m). CDIP 281 data starts Dec 2024 only — no 2022-2023 backfill possible. |

### Why Scripps and Santa Cruz showed ~2× different biases in P6.2.3

P6.2.3 reported Santa Cruz long-period bias ~+1.0m (best_match), Scripps ~+0.51m — roughly 2× difference.
This analysis reveals three compounding sources for this divergence:

1. **Wrong station identity (CDIP 028):** The "Santa Cruz" residuals in P6.2.1–P6.2.3 were actually
   CDIP 028 located at Catalina Island/San Pedro (~33.85N/118.63W), 340 km from Steamer Lane.
   The "bias" was almost entirely a geographic mismatch, not a physics residual at all.
   All prior period-bias numbers for "Santa Cruz CA" in P6.2.2 and P6.2.3 are **invalid** and should be discarded.

2. **Wrong depthM for Scripps (was 10m, actual 41m):** nearshoreTransform(H0, T, 10) applies much
   more shoaling than nearshoreTransform(H0, T, 41). The 4× depth error inflated the engine output
   and made the residual appear larger than it truly is.

3. **No clean nearshore archive for Santa Cruz:** CDIP 281 (the correct replacement station)
   only started recording in Dec 2024. There is no 2022-2023 nearshore ground truth for Steamer Lane.
   The two-station comparison driving the P6.2.2 "both nearshore spots show the same pattern"
   conclusion was based on a wrong station — that conclusion must be revisited once real archive data exists.

**Implication for the period-bias diagnosis:**
Only Scripps CA (CDIP-201, corrected depth=41m) is a valid nearshore OUTPUT validator with 2022-2023 archive.
The period-monotonic signal observed in P6.2.2 was partly an artifact of wrong station identity and wrong depth.
P6.2.2's "PERIOD-ARTIFACT (investigate globally)" verdict for Scripps may still stand, but the cross-station
"this is a global effect confirmed by two stations" claim is invalidated until a real Santa Cruz archive exists.

---

## Final Recommendation

_(To be filled after reviewing the tables: one of INPUT FIX CONFIRMED / TRANSFORM QUESTION / MIXED / SITE-SPECIFIC)_

**Key facts going in:**
- CDIP 028 "Santa Cruz" was a wrong-station identity. All prior Santa Cruz residuals are invalid.
- Scripps depth was 4× wrong (10m vs 41m). Prior Scripps residuals used nearshoreTransform at wrong depth.
- Only Scripps CA (corrected) is a valid nearshore OUTPUT validator for 2022-2023.
- P6.2.2's "two nearshore spots confirm global period artifact" rests on one real station, not two.

_Analysis only — transform.ts untouched, oracle 0.00%, no model trained._