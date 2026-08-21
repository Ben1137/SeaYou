# P6.2.11 Calibration Parity Report

**Generated:** 2026-07-24  
**Branch:** feat/calibration-harness  

---

## 1. Part 0 Corrections (six items applied)

No Part 0 corrections were required in P6.2.11. The six items below summarise the cleanups applied in this pass:

1. **No-Tp caveat block** added to `transformInputs.ts` (Part 2)
2. **Field rename** `swellWavePeakPeriod` → `swellWavePeriod` in all harness files (Part 3)
3. **Stale T-field comments** updated in `backfillResiduals.ts` and `dataAssimilation.ts` (Part 3)
4. **harvest_run migration** applied — backfill + DROP DEFAULT (Part 4)
5. **Report sign convention** corrected in `calibration-Tp-verification-report.md` (Part 5)
6. **Santa Cruz CA** notes updated to reflect genuine station unavailability (Part 6)

---

## 2. Parity Table

| Path | H0 field | T field | Depth arg |
|---|---|---|---|
| Harness (`backfillResiduals.ts`) | `wave_height` (total Hs) | `swell_wave_period` (swell mean period, via `m.swellPeriod`) | `buoy.depthM` |
| Production (web) — `CoastalDynamicsLayerML.tsx` | swell_wave_height if swell dominant, else wave_height | `swellPeriod` → mapped from `swell_wave_period?.[gi]` in Dashboard.tsx | `spot.depthM` (breaking zone) |
| Production (web) — `useCoastalReading.ts` / `deriveSwellInputs` | swell_wave_height if swell>0.1m, else wave_height | `swellPeriod` → same Open-Meteo `swell_wave_period` field | `centreDepth` from Terrarium bathymetry |

**T field in both paths:** `swell_wave_period` (Open-Meteo hourly field = swell mean period, NOAA GRIB2 SWPER).  
**Depth difference:** Expected and correct — harness uses `buoy.depthM` (measurement depth), production uses `spot.depthM` / live bathymetry (breaking-zone depth for surfers).  

**VERDICT: PARITY CONFIRMED** — T fields match across harness and production.

---

## 3. No-Tp Constraint Comment Added to transformInputs.ts

Added a 20-line standing-caveat comment block above `export type PeriodBand` in:

`packages/core/src/nearshore/transformInputs.ts`

Content: documents that `wave_peak_period`, `swell_wave_peak_period`, and `wind_wave_peak_period` all return null universally from Open-Meteo (0/72 non-null tested); that canonical T is `swell_wave_period` = NOAA GRIB2 SWPER (swell mean period, not peak); and that the Tm-vs-Tp gap is a provider limitation, not a per-round bug.

---

## 4. Field Rename swellWavePeakPeriod → swellWavePeriod

Renamed across the following files:

| File | Occurrences renamed |
|---|---|
| `packages/core/src/nearshore/transformInputs.ts` | 4 (interface field, 2 uses in `resolveTransformInputs`, 1 comment reference) |
| `packages/core/src/nearshore/backfillResiduals.ts` | 3 (interface field, struct initialiser `swellWavePeriod: swtp`, call site `swellWavePeriod: m.swellPeriod`) |
| `packages/core/src/nearshore/dataAssimilation.ts` | 2 (interface field, struct initialiser `swellWavePeriod: swtp`) |

Additional comment corrections:
- Stale "= swell_wave_peak_period (true Tp)" comments in `wave_period` column assignments updated to "= swell_wave_period (swell mean Tm)" in both files.
- `TransformInputs.T` JSDoc updated from "swell_wave_peak_period (true Tp)" to "swell_wave_period (swell mean Tm — best available swell-specific period)".

Files NOT containing `swellWavePeakPeriod`: `periodDiagnostic.ts`, `inputValidation.ts`, `h0Semantics.ts` — no changes needed.

---

## 5. harvest_run Fix + Re-tag Proof

### Migration applied
`supabase/migrations/20260724030000_fix_harvest_run_uniqueness.sql`

Actions:
1. Backfilled all rows with `harvest_run = 'pre-6.2.10'` to `'pre-6.2.10-' || id::text` (per-row unique).
2. Dropped the constant DEFAULT from `harvest_run` column.

Post-migration state:
- 165,347 active rows all have `harvest_run = '0e27ccfd'` (distinct per-harvest SHA).
- Remaining 'pre-6.2.10-X' rows: handful of individually uniquified legacy rows.

### Re-tag test (reversible UPDATE)

Test: UPDATE 5 rows from Scripps CA `data_quality='ok'` → `'invalid_field_mismatch'`  
**Result: 5 rows updated, NO constraint error.**  
IDs updated: 334382, 334383, 334384, 334385, 334386  

Revert: UPDATE same 5 rows back to `data_quality='ok'`  
**Result: 5 rows reverted successfully.**  

**CONCLUSION: harvest_run is now discriminating. Re-tagging works without collision.**

---

## 6. Sign Correction Status

File: `calibration-Tp-verification-report.md` — present at project root.

Patch applied: Part 4 header changed from:
- Old: `residual = buoy_value − engine_value (positive = engine under-predicts)` with inconsistent interpretive text
- New: `mean Δ = engine_value − buoy_value (positive = engine over-predicts)` — consistent with residualReport stdout convention

Values in the table are unchanged (correct):
- Scripps CA: **+0.170** (engine over-predicts)
- All other 8 spots: negative (engine under-predicts)

---

## 7. Santa Cruz Status + Active Nearshore Validator Count

CDIP 281 (Soquel Cove South) notes updated to record that the station returns HTTP 404 across all tested windows (2021, 2022, 2023 archive and recent 7-day forecast). Not merely archive-limited; genuinely unavailable. The `notes` field now documents this as a nearshore OUTPUT validation gap.

No `buoyUnavailable` flag added to the interface — the notes field is sufficient; a boolean flag would require interface changes across callers.

### Active nearshore OUTPUT validators (kind='nearshore', station reachable)

| Spot | CDIP ID | Status |
|---|---|---|
| Scripps CA | 201 | Active |
| San Francisco Bar CA | 142 | Active |
| Cape Canaveral FL | 143 | Active |
| Cape Henry VA | 147 | Active |
| Clatsop Spit OR | 162 | Active |
| Oregon Inlet NC | 192 | Active |
| Santa Cruz CA | 281 | UNAVAILABLE (HTTP 404) |

**Active nearshore OUTPUT validators: 6**

---

## 8. Final Status

| Check | Result |
|---|---|
| Part 1 — T field parity | PARITY CONFIRMED (both use swell_wave_period) |
| tsc compile | CLEAN (0 errors) |
| Oracle shader-verify | 0.00% deviation (transform.ts untouched) |
| harvest_run re-tag test | PASSED (5 rows tagged + reverted, no constraint error) |
| swellWavePeakPeriod → swellWavePeriod | Done (3 files, 9 occurrences) |
| No-Tp caveat comment | Added to transformInputs.ts |
| Sign correction | Applied to calibration-Tp-verification-report.md |
| Santa Cruz marked unavailable | Done |

**OVERALL STATUS: PARITY CONFIRMED — all six cleanups applied cleanly.**
