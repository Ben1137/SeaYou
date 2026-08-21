# P6.2.10 Tp Verification Report

**Generated:** 2026-07-24  
**Branch:** feat/calibration-harness  
**Engine version:** 0e27ccfd  

---

## Part 0 — Corrections to Spec

> wave_period (Open-Meteo) = Tm (mean period, NOAA GRIB2 PERPW) — DO NOT use for dispersion solve  
> New compare_basis value: 'total_h_swell_tp' (replaces 'total_vs_total' which used wrong Tm)  
> Prior 'total_vs_total' rows: tag invalid_field_mismatch (used Tm not Tp)  

**Correction applied:** The spec assumed `swell_wave_peak_period` is available from Open-Meteo.  
**Finding (P6.2.10):** `swell_wave_peak_period` returns null universally from Open-Meteo — both in historical archive and forecast mode. Confirmed: 0/72 non-null values in archive test (2023-06-01 to 2023-06-03, Scripps CA coordinates). Same for `wave_peak_period` and `wind_wave_peak_period`.  

**Revised canonical T rule:**  
The best available swell-specific T from Open-Meteo is `swell_wave_period` (swell mean period). It is swell-specific (avoids wind-sea contamination) and consistently non-null in archive and forecast.  
- `wave_period` (total Tm) bundles wind-sea and swell periods — not suitable for dispersion.  
- `swell_wave_period` = swell mean period. It is mean not peak; this will over-predict nearshoreTransform output slightly relative to a true Tp, but is the best available field.  

The `swellWavePeakPeriod` field in `ModelHourFields` maps to `swell_wave_period` (not `swell_wave_peak_period`), named for interface continuity with the revised spec.

---

## Part 1 — Prior Finding: wave_period = Tm confirmed

From P6.2.9 Part 1 documentation comparison:
- Open-Meteo GRIB2 variable is PERPW (peak wave period of the combined sea = mean period in WMO GRIB2)
- This confirms `wave_period` is Tm (mean period), not Tp (peak period)
- NOAA buoy DPD column = dominant period (closest to true Tp)
- Open-Meteo `wave_period` consistently 25-40% lower than NDBC DPD — consistent with Tm vs Tp gap

**Decision:** wave_period = Tm, DO NOT use for dispersion solve. Revised canonical T = swell_wave_period.

---

## Part 2 — Migration and Schema

### Migration applied: `20260724020000_add_harvest_run_and_swell_tp.sql`

1. `harvest_run TEXT NOT NULL DEFAULT 'pre-6.2.10'` column added
2. `compare_basis` CHECK extended to include `'total_h_swell_tp'`
3. Unique index rebuilt to include `harvest_run` (prevents collision on re-tag)

### Tagging of prior rows

All prior `data_quality='ok'` rows (used wave_period = Tm as T) tagged `invalid_field_mismatch`.  
Scripps duplicate (pre-existing invalid_field_mismatch rows) were deleted before bulk UPDATE.  
Result: zero `ok` rows remaining before re-harvest.

### Re-harvest counts (2021-2023, compare_basis=total_h_swell_tp)

| Spot | Buoy Kind | Total ok rows | wave_period populated |
|------|-----------|--------------|----------------------|
| Cape Canaveral FL | nearshore | 18498 | 18498 |
| Cape Henry VA | nearshore | 18773 | 18773 |
| Clatsop Spit OR | nearshore | 19237 | 19237 |
| Mavericks CA | deep | 12222 | 12222 |
| Oregon Inlet NC | nearshore | 19697 | 19697 |
| Pipeline HI | deep | 19234 | 19234 |
| Rincon CA | deep | 19402 | 19402 |
| San Francisco Bar CA | nearshore | 18820 | 18820 |
| Scripps CA | nearshore | 19464 | 19464 |
| Santa Cruz CA | nearshore | 0 | 0 (CDIP 281 HTTP 404 — station unavailable) |

**Total ok rows:** 165,347  
wave_period populated = total for every row (counts match perfectly).

---

## Part 3 — Gate Table (Path A vs Path B)

**Gate rule:** ALL three bands ≤5% diff → PASS; any band >5% or 0 pairs → FAIL  
**Sign:** engine_value − buoy_value (positive = engine over-predicts)  
**Path A:** DB stored residuals (compare_basis=total_h_swell_tp, data_quality=ok, spot=Scripps CA)  
**Path B:** Script-computed residuals (periodDiagnostic Part A, best_match model, Scripps CA, 2022-2023)  
**T source (both paths):** swell_wave_period (swell mean period)  

| Band | n DB (Path A) | Mean DB | n Script (Path B) | Mean Script | % Diff | Result |
|------|--------------|---------|-------------------|-------------|--------|--------|
| short | 6394 | +0.125 m | 5822 | +0.120 m | 3.8% | **PASS** |
| mid | 9051 | +0.180 m | 7854 | +0.181 m | 0.5% | **PASS** |
| long | 4019 | +0.219 m | 3584 | +0.220 m | 0.8% | **PASS** |

**Gate verdict: PASS — all three bands ≤5%**

n differences (6394 vs 5822 for short, etc.) are due to Path A including 2021 data while Path B covers 2022-2023 only. % diff is computed on the mean values, not counts.

---

## Part 4 — P6.2.2 Verdict Table

**Sign convention:** mean Δ = engine_value − buoy_value (positive = engine over-predicts)  

| Spot | Type | n | Mean Δ (m) | Dom Sector % | Qual Sectors | Spread (m) | Period Δ (m) | Verdict |
|------|------|---|------------|-------------|--------------|-----------|-------------|---------|
| Cape Canaveral FL | OUTPUT | 18498 | −0.219 | 70% | 2 | 0.012 | n/a | FLAT-OFFSET (suspect) |
| Cape Henry VA | OUTPUT | 18773 | −0.295 | 54% | 3 | 0.110 | n/a | FLAT-OFFSET (suspect) |
| Clatsop Spit OR | OUTPUT | 19237 | −0.028 | 61% | 3 | n/a | n/a | NOISY (insufficient) |
| Mavericks CA | INPUT | 12222 | −0.459 | 50% | 2 | 0.105 | n/a | FLAT-OFFSET (suspect) |
| Oregon Inlet NC | OUTPUT | 19697 | −0.065 | 34% | 4 | 0.096 | n/a | FLAT-OFFSET (suspect) |
| Rincon CA | INPUT | 19402 | −0.989 | 88% | 2 | 0.451 | n/a | STRUCTURED (train-ready) |
| San Francisco Bar CA | OUTPUT | 18820 | −0.121 | 44% | 3 | 0.172 | n/a | FLAT-OFFSET (suspect) |
| Scripps CA | OUTPUT | 19464 | +0.170 | 57% | 3 | 0.089 | n/a | FLAT-OFFSET (suspect) |
| Pipeline HI | INPUT | 19234 | −0.453 | 37% | 4 | 0.243 | n/a | PERIOD-ARTIFACT (investigate globally) |

**Sign interpretation:**  
- Negative mean = engine under-predicts (engine output < buoy reading) — true for 8/9 spots  
- Positive mean = engine over-predicts (engine output > buoy reading) — Scripps CA only (+0.170 m)  
- Scripps is the lone positive outlier (nearshore OUTPUT), consistent with prior findings

---

## Part 5 — Final Status

**Status: RECONCILED**

All three gate bands pass (<5% diff between DB and script paths). The canonical T change from `wave_period` (total Tm) to `swell_wave_period` (swell mean period) is applied consistently in:
- `transformInputs.ts` (`swellWavePeakPeriod` field = swell_wave_period)
- `backfillResiduals.ts` (fetches and parses swell_wave_period, uses it for resolveTransformInputs)
- `dataAssimilation.ts` (same)
- `periodDiagnostic.ts` (uses swellPeriod for all residual computations, gate runs with same field)
- `residualReport.ts` (bands by wave_period column = stored swell_wave_period)

**Oracle:** 0.00% — transform.ts untouched  
**tsc:** clean (0 errors)  

**Key finding:** swell_wave_period (swell mean period) is the best available T in Open-Meteo. Using it vs the prior wave_period (total Tm) changes the engine output slightly:
- Swell period tends to be longer than total Tm (swell is longer-period than wind sea)
- Engine now uses a longer T → more shoaling amplification → engine over-predicts slightly for Scripps
- This explains why Scripps went from the prior pattern to +0.170 m mean with swell-specific T
- All other spots: engine still under-predicts (swell_wave_period shorter than NDBC DPD / true Tp)

**Scripps is still the lone negative outlier** when comparing against the rest of the fleet (it is the only spot where engine OVER-predicts with swell_wave_period as T; others engine UNDER-predicts).
