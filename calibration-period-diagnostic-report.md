# P6.2.3 Period-Bias Diagnostic Report (P6.2.10 update)

**Generated:** 2026-07-26T10:31:45.296Z  
**Spots registered:** 14  
**T source (P6.2.10):** swell_wave_period (swell mean period — swell_wave_peak_period returns null universally from Open-Meteo)  

---

## Part A — Multi-Model Comparison

> **Open-Meteo archive availability note:**
> - `best_match`: archive from 2021+, full swell decomposition — the only reliable historical model
> - `era5_ocean`: archive from 1950+, wave_height + wave_period only (no swell decomposition)
> - `ecmwf_wam025`, `ncep_gfswave025`: **forecast-window only (~7 days)** — cannot back-fill calibration history
> - `meteofrance_wave_global`, `icon_wave`, `wam025` etc.: **invalid model strings** (API returns error)

### A1 — Archive comparison: best_match vs era5_ocean (2022–2023)

### Scripps CA (CDIP-201, nearshore, OUTPUT validation)
Buoy: 17284 hourly obs, 2022-2023  

| Model | Period | n pairs | Mean Δ (engine−buoy) | StdDev | Interpretation |
|-------|--------|---------|---------------------|--------|----------------|
| best_match | short (<8s / 8-12s / >12s) | 5822 | 0.120 | 0.192 | |
| best_match | mid (<8s / 8-12s / >12s) | 7854 | 0.181 | 0.170 | |
| best_match | long (<8s / 8-12s / >12s) | 3584 | 0.220 | 0.147 | |
| era5_ocean | short | 0 | n/a | n/a | insufficient |
| era5_ocean | mid | 0 | n/a | n/a | insufficient |
| era5_ocean | long | 0 | n/a | n/a | insufficient |

### Santa Cruz CA (CDIP-281, nearshore, OUTPUT validation)
Buoy: 0 hourly obs, 2022-2023  

| Model | Period | n pairs | Mean Δ (engine−buoy) | StdDev | Interpretation |
|-------|--------|---------|---------------------|--------|----------------|
| best_match | short | 0 | n/a | n/a | insufficient |
| best_match | mid | 0 | n/a | n/a | insufficient |
| best_match | long | 0 | n/a | n/a | insufficient |
| era5_ocean | short | 0 | n/a | n/a | insufficient |
| era5_ocean | mid | 0 | n/a | n/a | insufficient |
| era5_ocean | long | 0 | n/a | n/a | insufficient |

### A2 — Recent model snapshot (last 7 days): best_match vs ecmwf_wam025 vs ncep_gfswave025

> Note: ecmwf_wam025 and ncep_gfswave025 serve only the recent forecast window (~7 days).
> This is a live/recent comparison, not a historical calibration comparison.

Window: 2026-07-20 → 2026-07-26  

| Model | Scripps mean Δ (short/mid/long) | Santa Cruz mean Δ (short/mid/long) |
|-------|-------------------------------|----------------------------------|
| best_match | 0.24 / 0.35 / 0.38 | n/a / n/a / n/a |
| ecmwf_wam025 | n/a / n/a / n/a | n/a / n/a / n/a |
| ncep_gfswave025 | n/a / n/a / n/a | n/a / n/a / n/a |

---

## Part B — Input vs Transform Decomposition [RETIRED]

> **RETIRED (P6.2.8):** invalid cross-depth design — Open-Meteo at nearshore spot vs nearshore buoy
> with no deep-water intermediate. This comparison bundles genuine input error with shoaling loss
> and cannot isolate input vs transform contribution. Do not cite results from this section.
> See P6.2.4 (matched-depth input validation) for the valid replacement analysis.

### Scripps CA — Input vs Transform Decomposition
(Using Open-Meteo `best_match` at Scripps CA coords vs CDIP-201 buoy, 2022–mid-2023)  

| Period | n pairs | INPUT Δ (H0−buoy) | OUTPUT Δ (HFinal−buoy) | Born in |
|--------|---------|------------------|----------------------|---------|
| short | 4618 | 0.110 | 0.108 | [RETIRED — cross-depth design, do not cite] |
| mid | 5595 | 0.225 | 0.172 | [RETIRED — cross-depth design, do not cite] |
| long | 2793 | 0.296 | 0.215 | [RETIRED — cross-depth design, do not cite] |

### Santa Cruz CA — Input vs Transform Decomposition
(Using Open-Meteo `best_match` at Santa Cruz CA coords vs CDIP-281 buoy, 2022–mid-2023)  

| Period | n pairs | INPUT Δ (H0−buoy) | OUTPUT Δ (HFinal−buoy) | Born in |
|--------|---------|------------------|----------------------|---------|
| short | 0 | n/a | n/a | n/a |
| mid | 0 | n/a | n/a | n/a |
| long | 0 | n/a | n/a | n/a |

---

## Part C — Nearshore Ground Truth Coverage

Total spots registered: 14  
Nearshore (OUTPUT validation): 7  
Deep (INPUT/Open-Meteo validation): 3  
No public buoy (human-log only): 4  

### Nearshore spots by basin

| Spot | Buoy | Depth | Lat | Lon | Basin | Status |
|------|------|-------|-----|-----|-------|--------|
| Santa Cruz CA | CDIP-281 | 8m | 36.951 | -122.026 | NE Pacific (US West) | CDIP-281 (confirmed) |
| Scripps CA | CDIP-201 | 6m | 32.868 | -117.257 | NE Pacific (US West) | CDIP-201 (confirmed) |
| San Francisco Bar CA | CDIP-142 | 15m | 37.781 | -122.599 | NE Pacific (US West) | CDIP-142 (confirmed) |
| Cape Canaveral FL | CDIP-143 | 10m | 28.4 | -80.533 | NW Atlantic (US East) | CDIP-143 (confirmed) |
| Cape Henry VA | CDIP-147 | 18m | 36.908 | -75.845 | NW Atlantic (US East) | CDIP-147 (confirmed) |
| Clatsop Spit OR | CDIP-162 | 25m | 46.216 | -124.128 | NE Pacific (US West) | CDIP-162 (confirmed) |
| Oregon Inlet NC | CDIP-192 | 18m | 35.75 | -75.33 | NW Atlantic (US East) | CDIP-192 (confirmed) |

### Basins with NO public nearshore buoy — human-log only

| Spot | Region | Gap reason |
|------|--------|-----------|
| Tel Aviv | Sandy Mediterranean beach. Swell arrives from NW. Reference spot per CLAUDE.md. | No public nearshore buoy — output validation via CALIBRATION_LOG.md (human obs) only |
| Hossegor FR | Atlantic beach break, Bay of Biscay. No public buoy — output validation deferred. | No public nearshore buoy — output validation via CALIBRATION_LOG.md (human obs) only |
| Uluwatu ID | Reef break, SW Bali. Indian Ocean swell. No public buoy — output validation deferred. | No public nearshore buoy — output validation via CALIBRATION_LOG.md (human obs) only |
| Jeffreys Bay ZA | SW groundswell, Eastern Cape. No public NDBC/CDIP buoy. | No public nearshore buoy — output validation via CALIBRATION_LOG.md (human obs) only |

> **Note:** Deep-ocean buoys (NDBC) are NOT substituted for missing nearshore truth.
> A deep buoy measures the offshore swell that is our INPUT, not our OUTPUT.
> Regions without a nearshore buoy simply do not have engine-output calibration yet.

### Period-aware correction requirement

The period-monotonic bias confirmed in P6.2.2 means any future correction MUST be:
- **Period-aware:** trained and validated separately on short/mid/long bands (different physical regimes)
- **Multi-basin:** validated on US West Coast + US East Coast + at minimum one non-US basin before any global deployment
- **NOT a single scalar:** a global constant offset correction would bake in the bias for the wrong period band at the wrong location

---

## Recommendation

_(Fill in after reviewing the tables above)_

Based on Part A (model comparison) and Part B (input vs transform), the bias is:
- [ ] **INPUT FIX** — bias varies substantially by wave model → pick a better model per region, no physics change
- [ ] **TRANSFORM FIX** — bias same across all models AND born in transform stage → physics adjustment needed (its own oracle-guarded prompt)
- [ ] **MIXED** — short-period = input-born, long-period = transform-born → fix input first, then re-diagnose
- [ ] **NEED MORE BASINS** — US-only data insufficient to distinguish global vs regional cause

_Analysis only — transform.ts untouched, oracle 0.00%, no model trained._
---

## Reconciliation Gate (P6.2.10)

> **Rule:** ALL three bands ≤5% mean diff → PASS; any band >5% or 0 pairs → FAIL.  
> **Sign:** engine_value − buoy_value (positive = engine over-predicts).  
> **Path A:** DB stored residuals (compare_basis=total_h_swell_tp, data_quality=ok).  
> **Path B:** Script-computed residuals (Part A analysis for Scripps CA, best_match model).  
> **Bands:** wave_period column (= swell_wave_period, swell mean period used for transform).  

| Band | n DB (Path A) | Mean DB | n Script (Path B) | Mean Script | % Diff | Result |
|------|--------------|---------|-------------------|-------------|--------|--------|
| short | 6394 | 0.125 | 5822 | 0.120 | 3.8% | **PASS** |
| mid | 9051 | 0.180 | 7854 | 0.181 | 0.5% | **PASS** |
| long | 4019 | 0.219 | 3584 | 0.220 | 0.8% | **PASS** |

**Gate verdict: PASS — all three bands ≤5%**
