# Calibration Phase 6 — State at Pause

*Paused: 2026-07-27 · Branch: feat/calibration-harness · 16 rounds (P6.0–P6.2.16)*

Phase 6 calibration is paused. Development returns to Phase 5 (dashboard, mobile/watch).
This file is the re-entry point. Everything needed to pick it up cold is here.

---

## Where It Stopped and Why

**0 of 6 engine-calibration spots** (CDIP nearshore) show a STRUCTURED verdict under either harness or production policy. All are FLAT-OFFSET or NOISY. The dataset shows no directional structure to learn from at current fleet coverage and comparison quality.

Root cause: the harness uses `H0 = wave_height` (total Hs) while production uses `H0 = swell_wave_height` (modal estimate) in the swell-dominant branch, which fires at ~100% of ocean hours. The calibration corpus describes a configuration the engine has never run in production.

**Flat offsets exist but are not actionable as ML targets:**
- A flat per-spot offset is corrected by a constant, not a learned model.
- A constant fitted on total-H0 residuals would ship into an engine running swell-H0.
- No engine-calibration spot is STRUCTURED under production policy.

---

## Current Schema

Table: `calibration_residuals` in Supabase project `mxuvijlowneokmzeompn`.

| Column | Verified meaning | Source expression |
|--------|-----------------|-------------------|
| `ts` | UTC hour of the observation | buoy timestamp |
| `spot` | Spot name from CALIBRATION_SPOTS | literal |
| `lat`, `lon` | Spot coordinates | CALIBRATION_SPOTS |
| `swell_dir` | `swell_wave_direction` (deg) | Open-Meteo API |
| `swell_period` | `swell_wave_period` (swell mean Tm, SWPER) | Open-Meteo API |
| `swell_height` | `swell_wave_height` (modal swell Hs) | Open-Meteo API |
| `wave_height_total` | `wave_height` (total combined Hs) | Open-Meteo API |
| `wind_wave_height` | `wind_wave_height` | Open-Meteo API |
| `wave_period` | `swell_wave_period` (canonical T for transform) | Open-Meteo API — **NOT** `wave_period` |
| `wave_period_tm` | `wave_period` (total spectral mean Tm, PERPW) | Open-Meteo API |
| `wind_wave_period` | `wind_wave_period` | Open-Meteo API |
| `wind_wave_direction` | `wind_wave_direction` (deg) | Open-Meteo API |
| `wind_from_deg` | `wind_direction_10m` (ERA5) | Open-Meteo archive API |
| `wind_speed` | `wind_speed_10m` (ERA5) | Open-Meteo archive API |
| `buoy_hs` | buoy total Hs (= `buoy_value`) | NDBC WVHT / CDIP waveHs |
| `buoy_tp` | buoy peak period | NDBC DPD / CDIP waveTp |
| `buoy_tm` | buoy mean period | NDBC APD / **null for CDIP** |
| `buoy_direction` | buoy wave direction | NDBC MWD / CDIP waveDp |
| `buoy_value` | buoy total Hs | NDBC WVHT / CDIP waveHs |
| `engine_value` | `nearshoreTransform(wave_height_total, swell_wave_period, buoy.depthM).H` for nearshore; `wave_height_total` for deep | computed |
| `residual` | `buoy_value − engine_value` | computed — positive = engine under-predicts |
| `source_buoy_id` | `{network}-{id}` | CALIBRATION_SPOTS |
| `engine_version` | git SHA of transform.ts at harvest time | git |
| `compare_basis` | `'total_h_swell_tp'` — H0=total Hs, T=swell mean period | literal |
| `data_quality` | `'ok'` for clean rows | managed |
| `harvest_run` | `{gitSHA}@{ISO8601}` — unique per harvest batch | generated at main() |
| `input_source` | `'reanalysis'` (backfill) / `'live_forecast'` (forward assimilation) | literal |
| `transform_depth_m` | `spot.buoy.depthM ?? spot.depthM` — actual depth passed to transform | CALIBRATION_SPOTS |

### Why `data_quality` is NOT in the unique index
A mutable label (validity status) should not be part of an observation's identity.
Unique index: `(ts, spot, buoy_kind, input_source, compare_basis, harvest_run)`.
Re-tagging a row to `invalid_*` and inserting a new `ok` row with the same identity (but a new `harvest_run`) is the correct workflow. With `data_quality` in the key, the insert would collide.

---

## How to Run It Cold

```bash
# Full backfill (resumable from .calibration-backfill-checkpoint.json)
npx tsx packages/core/src/nearshore/backfillResiduals.ts --from 2021-01-01 --to 2023-12-31

# One spot / one year (smoke test)
npx tsx packages/core/src/nearshore/backfillResiduals.ts --spot "Scripps CA" --from 2022-01-01 --to 2022-12-31

# Dry run (no writes)
npx tsx packages/core/src/nearshore/backfillResiduals.ts --dry-run --spot "Mavericks CA" --from 2023-01-01 --to 2023-01-07

# Residual report (P6.2.2 logic — FLAT-OFFSET / STRUCTURED / NOISY verdicts)
npx tsx packages/core/src/nearshore/residualReport.ts

# Two-path gate (bands by wave_period, DB vs independent script recompute)
npx tsx packages/core/src/nearshore/periodDiagnostic.ts

# Physics oracle (MUST be 0.00% — if not, do not harvest, do not ship)
npx tsx packages/core/src/nearshore/shader-verify.ts

# gateCheck (DB self-consistency — NOT a reconciliation gate)
npx tsx packages/core/src/nearshore/gateCheck.ts
```

---

## The Six Definitional Traps — Do Not Rediscover

1. **`wave_period` (Open-Meteo) is Tm** — NOAA GRIB2 Table 4-2-10-0 entry 11: PERPW = "Primary Wave Mean Period". It is NOT Tp. Measured Tm-vs-Tp gap at Scripps: +0.59 s, Ks effect 0.01–0.03 m — immaterial.

2. **`swell_wave_period` is also Tm** — NOAA GRIB2 entry 9: SWPER = "Mean Period of Swell Waves". Both Open-Meteo period fields are mean periods. There is no peak period available on any Open-Meteo marine endpoint.

3. **Open-Meteo serves NO peak period** — `wave_peak_period`, `swell_wave_peak_period`, and `wind_wave_peak_period` all return null universally (0/72 non-null tested). Do not try again.

4. **`swell_height` was historically heterogeneous** — Before P6.2.14, `backfillResiduals.ts` wrote `wave_height` (total) into `swell_height`, while `dataAssimilation.ts` wrote `swell_wave_height`. One column, two quantities, by writer. Rows with `data_quality = 'superseded_full_inputs'` carry the wrong value. Fixed in P6.2.14.

5. **The partitions are modal, not energy-conserving** — `sqrt(swell_wave_height² + wind_wave_height²)` misses `wave_height` by mean 0.06–0.25 m, max 1.56 m. You cannot infer the missing wind-sea contribution from the partition pair.

6. **Harness and production H0 policies differ** — Harness: `H0 = wave_height` always. Production: `H0 = swell_wave_height` when `swell_wave_height > 0.1 m` (which is 100% of ocean hours). Residuals computed under harness policy describe a configuration production never runs. Any per-spot constant fitted on harness residuals would ship into the wrong H0.

---

## Void Findings

| Finding | Round | Why void |
|---------|-------|----------|
| "Scripps is the lone outlier" | P6.2.2–P6.2.14 | Artefact of harness H0. Under production policy all spots are positive and Scripps is the smallest (+0.10 m). |
| Tm→Tp explains the bias | P6.2.12 premise | Measured at 0.01–0.03 m Ks effect — 1–2 orders below observed biases of 0.1–0.3 m. |
| P6.2.13 H0 shift = 0.000 m | P6.2.13 Part 4 | Compared total-Hs against total-Hs (column was mislabelled). Not evidence that H0 policy is immaterial. |
| P6.2.9 gate PASS | P6.2.9 | The gate was tautological: re-ran nearshoreTransform on stored inputs and compared to stored `engine_value`, which was produced by exactly that call. Proves only float round-trip. |
| "TRANSFORM-BORN (long period)" | P6.2.4 | Computed at wrong depth (spot.depthM=6m vs buoy.depthM=41m). At correct depth the three-point chain is dominated by INPUT. |

---

## Re-entry Points

Ranked by: (1) closeness to an actionable result, (2) cost, (3) preconditions.

### A. NDBC 44025 + swden integration (highest ROI if swell-vs-swell is the goal)
**What it makes measurable:** The only current station that breaks BOTH the depth×network confound (NDBC nearshore at 40m shelf) AND enables swell-vs-swell comparison (historical `swden` spectral density available, SwH derivable by integrating over the swell frequency band ≤0.12 Hz).
**Precondition:** Implement `swden` spectral integration to derive hourly SwH (non-trivial but mechanical).
**Cost:** ~59,000 rows harvest + spectral integration step.
**Known risk:** Open-Meteo `swell_wave_height` is a modal estimate; NDBC SwH from spectral integration is energy-based. Comparing them is a different definition of "swell" — the same class of mismatch that consumed rounds 8–15. Budget to discover and document this, not to assume it away.

### B. Mediterranean station from the Part 1 registry
**What it makes measurable:** The home market (Eastern Mediterranean) is completely untested. The app was already shipping a live defect there (flat-calm null inputs, identified in P6.2.14 unification). An Eastern Mediterranean nearshore buoy validates the engine in its highest-value regime.
**Precondition:** A public, no-auth buoy near the Israeli or Turkish coastline with Hs and depth metadata. The registry (Part 1 of this round) scopes the options.
**Cost:** Depends on network; if ERDDAP-served, near-zero marginal integration.

### C. Resolve the swell-vs-total product decision
**What it makes measurable:** If production switches to `H0 = wave_height` (total), the harness corpus becomes valid for the shipped engine. The like-for-like results (Clatsop +0.028 m, Oregon Inlet +0.065 m) become directly applicable.
**Precondition:** A product decision — surfers vs mariners vs beachgoers persona routing. Not a calibration decision.
**Cost:** One config change + a test to confirm the harness and production now match.

---

## Process Lessons

1. **A gate compares two independently computed values.** Recomputing stored inputs with the same function is a self-consistency check, not a gate. These are different outputs requiring different treatment.

2. **A stop condition stops the run.** If a part says "report and halt," halt. Continuing and mentioning it in a summary is a process failure regardless of whether the rest of the output is correct.

3. **Verify a column's meaning against its source expression, never its name.** `swell_height` held total Hs. `wave_period` holds swell_wave_period. `swellWavePeakPeriod` held swell_wave_period. The names were all wrong. Grep the `records.push` block.

4. **Check a mechanism's magnitude before asserting it explains an observation.** The Tm→Tp hypothesis was asserted across multiple rounds before its 0.01–0.03 m magnitude was measured. The P6.2.12 prompt introduced it as a stated cause before its effect size was known.

5. **Report deviations at the point they occur, with reasoning.** In this phase: two unflagged DELETEs, a tautological gate reported as PASS, a stop condition that didn't stop, a cross-depth comparison reported as "matched-depth." Each was caught in a later correction and retracted. Flagging at the time is cheaper.

6. **A finding that kills a hypothesis is a successful outcome.** The Tm→Tp measurement, the quadrature failure, and the 0.000 m gate all killed something. They are results.
