# Coastal Dynamics Engine — Validation Evidence

*Branch: feat/calibration-harness · Last updated: 2026-07-27*

This document records what was measured, how, and what it demonstrates.
It makes no accuracy claim beyond what the data supports.

---

## Method

**Engine:** `packages/core/src/nearshore/transform.ts` — `nearshoreTransform(H0, T, d)`.
Linear shoaling coefficient (Fenton-McKee 1990 approximation) plus depth-limited breaking cap (γ = 0.78, Battjes & Janssen 1974). Read-only throughout this phase (oracle 0.00%).

**Sign convention:** `residual = buoy_value − engine_value` · positive = engine under-predicts.

**Input (harness policy):** H0 = Open-Meteo `wave_height` (total combined Hs) · T = `swell_wave_period` (SWPER, swell mean period) · depth = buoy deployment depth.

**Comparison basis:** `total_h_swell_tp`. Deep buoys (NDBC) validate the input ingestion path; nearshore buoys (CDIP) validate the transform output.

**Window:** October 2021 – December 2023 (Open-Meteo marine archive starts ~Oct 2021).

**Networks:** NDBC (3 deep stations), CDIP (6 nearshore stations).

---

## Transform Contribution

Computed from model inputs and engine output alone — not affected by the NDBC/CDIP network difference.

| Pool | Contribution |
|------|-------------|
| Deep NDBC (3 stations, 206–3430 m) | 0.000 m — the transform is **inert** in deep water, as the physics requires |
| Nearshore CDIP (6 stations, 10–41 m) | +0.03 to +0.14 m — **measurable shoaling amplification** |

The engine behaves correctly in both limits.

---

## Like-for-Like Agreement (total H0 vs CDIP total Hs)

| Spot | Depth (m) | n | Window | Mean Δ (buoy−engine) |
|------|-----------|---|--------|----------------------|
| Clatsop Spit OR (CDIP-162) | 25 | 19,237 | Oct 2021–Dec 2023 | **+0.028 m** |
| Oregon Inlet NC (CDIP-192) | 18 | 19,697 | Oct 2021–Dec 2023 | **+0.065 m** |
| SF Bar CA (CDIP-142) | 15 | 18,820 | Oct 2021–Dec 2023 | +0.121 m |
| Cape Canaveral FL (CDIP-143) | 10 | 18,498 | Oct 2021–Dec 2023 | +0.219 m |
| Cape Henry VA (CDIP-147) | 18 | 18,773 | Oct 2021–Dec 2023 | +0.295 m |
| Scripps CA (CDIP-201) | 41 | 19,464 | Oct 2021–Dec 2023 | −0.170 m |

These comparisons are total-vs-total (same quantity on both sides). The +0.028 m at Clatsop Spit and +0.065 m at Oregon Inlet are the phase's most reliable per-spot numbers.

---

## What This Claims

- The engine is **physically correct in both limits**: inert at depth, amplifying nearshore.
- Agreement within **+0.028–0.065 m** at two stations over two years, on a like-for-like basis.
- These results **do not** constitute a calibrated accuracy claim for the shipped product configuration (which uses swell H0, not total H0 — see Caveats).

---

## Caveats

### 1. Tm-vs-Tp provider constraint (permanent)
Open-Meteo serves no usable peak period (`wave_peak_period`, `swell_wave_peak_period`, `wind_wave_peak_period` all return null universally). The engine's dispersion solve nominally expects Tp; it always receives `swell_wave_period` = SWPER = mean period of the swell partition (NOAA GRIB2 4-2-10-0 entry 9). Measured effect at Scripps (d=41m): Tp−Tm gap ≈ +0.59 s, Ks shift ≈ 0.01–0.03 m — one to two orders of magnitude below the observed biases. Provider limitation; not re-litigable per round.

### 2. Depth × network confound
All three deep stations are NDBC; all six nearshore stations are CDIP. The INPUT/OUTPUT residual contrast cannot currently be attributed to model accuracy vs. network calibration differences — the comparison is confounded. No current station in the fleet breaks this.

### 3. Modal partition semantics
Open-Meteo's swell and wind-wave partitions are modal estimates, verified not energy-conserving against the provider's own total (`sqrt(swell² + wind²)` misses `wave_height` by mean 0.06–0.25 m, max 1.56 m). The shipped engine uses the swell partition as H0 in the swell-dominant branch (which is ~100% of hours at ocean locations). The like-for-like numbers above use total H0 and do not describe the shipped configuration.

### 4. Shipped configuration not validated
Production uses `H0 = swell_wave_height` when `swell_wave_height > 0.1 m`. CDIP buoys report total Hs, not swell Hs. The comparison is apples-to-oranges and no verdict on the shipped engine can be drawn from total-H0 buoy comparisons without swell-partitioned buoy data.

---

## Data Access

**Harness:** `packages/core/src/nearshore/backfillResiduals.ts`
**DB:** Supabase `calibration_residuals` table · `data_quality = 'ok'` · `compare_basis = 'total_h_swell_tp'`
**Gate:** `npx tsx packages/core/src/nearshore/periodDiagnostic.ts` (two-path gate, all three bands ≤5% → PASS)
**Oracle:** `npx tsx packages/core/src/nearshore/shader-verify.ts` (must read 0.00%)
