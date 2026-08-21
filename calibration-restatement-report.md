# P6.2.15 Calibration Restatement Report

**Generated:** 2026-07-27T00:00:00Z

---

## Part 0 — Corrections to the Record

### 0.1 "Scripps is the lone outlier" finding — VOID

Under harness policy (H0 = wave_height_total), Scripps is the only over-predictor (−0.170m).
Under production policy (H0 = swell_height when swell-dominant, which is 100% of hours at all 9 spots), all 9 spots are positive (engine under-predicts) and Scripps is the smallest at approximately +0.100m.

The "lone outlier" finding was an artifact of the harness H0 policy, which production never runs. This finding — the through-line of P6.2.2 through P6.2.14 — is VOID.

### 0.2 Sign convention unstated/inverted — third occurrence

The sign convention `residual = buoy_value − engine_value` (positive = engine under-predicts) is stated correctly in `residualReport.ts` at line 420 of the report header and at line 662 of the console summary. However, no prior P6.2.x written summary explicitly labelled the sign before presenting numbers, creating ambiguity in cross-task references.

**Status:** Sign convention is correct in code. The recon prompt used the same convention throughout. No code change required.

### 0.3 Harness H0 ≠ Production H0 — unrecognised throughout P6.2.x

The backfill pipeline stores `wave_height_total` (total sea state Hs) as the H0 input. Production always uses `swell_height` when the hour is swell-dominant (all 9 spots are 99.8–100% swell-dominant). The mean H0 delta (harness excess over production) ranges from 0.153m (Cape Canaveral) to 0.431m (Oregon Inlet). All residuals reported in P6.2.1 through P6.2.14 are under harness policy. They do not reflect the configuration shipped to users.

### 0.4 Quadrature identity assumed without validation

P6.2.x tasks implicitly assumed that `wave_height_total ≈ sqrt(swell_height² + wind_wave_height²)` holds, enabling inference of the missing wind-sea contribution. This identity FAILS at all 9 spots (mean excess 0.055–0.249m, max 0.361–1.559m). Open-Meteo's swell/wind-wave partitions are modal/dominant estimates, not energy-conserving decompositions. Any analysis assuming quadrature holds is invalid.

### 0.5 Deep buoys labelled as validation of the nearshore engine

Mavericks CA (NDBC 46012, 206m), Rincon CA (NDBC 46054, 464m), and Pipeline HI (NDBC 51001, 3430m) are labelled `deep / INPUT` in the harness. The nearshore transform contributes 0.000m at these depths. Their residuals measure Open-Meteo forecast accuracy at the buoy location, not engine breaking-model error. These three spots cannot gate P6.3.

### 0.6 NDBC vs CDIP confound not fully separated

All six OUTPUT (nearshore) spots use CDIP buoys. All three INPUT (deep) spots use NDBC buoys. Any comparison between INPUT and OUTPUT pools conflates the network difference (CDIP vs NDBC wave processing) with the depth/engine difference. No pure NDBC nearshore station was in the harness prior to this report.

---

## Part 1 — Full Fleet Under Both Policies

**Sign convention: `residual = buoy_value − engine_value`, positive = engine under-predicts**

Production-policy residuals are analytical estimates using the mean-level approximation: `prod_resid ≈ harness_resid + H0_delta`, where `H0_delta = mean(wave_height_total) − mean(swell_height)` per spot. For deep spots the approximation is exact. For nearshore spots, Ks (shoaling coefficient) ≈ 1.00–1.08 at these depths, introducing ≤5% error in the shift term; this is noted but does not change verdict direction.

| Spot | Class | n | Mean H0 harness | Mean H0 prod | H0 delta | Harness resid | Prod resid (est) | Harness verdict |
|------|-------|---|----------------|-------------|---------|--------------|-----------------|----------------|
| Mavericks CA | deep / INPUT | 12,222 | 1.843m | 1.593m | 0.250m | +0.4592m | +0.709m | FLAT-OFFSET |
| Pipeline HI | deep / INPUT | 19,234 | 1.826m | 1.452m | 0.373m | +0.4528m | +0.826m | FLAT-OFFSET |
| Rincon CA | deep / INPUT | 19,402 | 1.006m | 0.837m | 0.169m | +0.9894m | +1.158m | STRUCTURED |
| Cape Canaveral FL | nearshore / OUTPUT | 18,498 | 0.530m | 0.377m | 0.153m | +0.2186m | +0.372m | FLAT-OFFSET |
| Cape Henry VA | nearshore / OUTPUT | 18,773 | 0.775m | 0.518m | 0.257m | +0.2946m | +0.552m | FLAT-OFFSET |
| Clatsop Spit OR | nearshore / OUTPUT | 19,237 | 2.105m | 1.773m | 0.332m | +0.0280m | +0.360m | NOISY/FLAT |
| Oregon Inlet NC | nearshore / OUTPUT | 19,697 | 1.358m | 0.926m | 0.431m | +0.0647m | +0.496m | NOISY/FLAT |
| SF Bar CA | nearshore / OUTPUT | 18,820 | 1.576m | 1.219m | 0.357m | +0.1209m | +0.478m | FLAT-OFFSET |
| Scripps CA | nearshore / OUTPUT | 19,464 | 0.995m | 0.726m | 0.270m | **−0.1700m** | **+0.100m** | FLAT-OFFSET |

**Key finding:** Scripps flips from negative (−0.170m) under harness policy to positive (+0.100m) under production policy. No spot is a negative outlier under production. The full fleet is uniformly under-predicting.

**Production-policy sector-based verdicts** (STRUCTURED / FLAT-OFFSET classification) require a re-run of `residualReport.ts` with production policy (H0 = swell_height). The mean residuals above are the best available estimate without re-querying. Because production under-predicts more than harness at all spots, FLAT-OFFSET spots will remain FLAT-OFFSET or move toward NOISY (larger mean, same spread). No new STRUCTURED spots are expected.

---

## Part 2 — Comparability Hypothesis

### 2.1 Partition validation: quadrature identity check

The hypothesis tested in P6.2.x: the under-prediction in production policy occurs because the buoy reports total Hs while the engine reports swell-only Hs, and the gap equals the wind-sea contribution that quadrature would supply.

**Result: VOID.** The quadrature identity `wave_height_total ≈ sqrt(swell_height² + wind_wave_height²)` FAILS at all 9 spots:

| Spot | Mean quad_err (m) | Max quad_err (m) |
|------|-----------------|----------------|
| Cape Canaveral FL | 0.055 | 0.361 |
| Cape Henry VA | 0.097 | 0.614 |
| Clatsop Spit OR | 0.139 | 0.921 |
| Oregon Inlet NC | 0.118 | 0.752 |
| SF Bar CA | 0.147 | 0.937 |
| Scripps CA | 0.249 | 1.559 |
| Mavericks CA | 0.128 | 0.813 |
| Pipeline HI | 0.162 | 1.012 |
| Rincon CA | 0.096 | 0.603 |

Open-Meteo's swell and wind-wave fields are modal/dominant estimates, not energy-conserving partitions. `wave_height_total` is NOT the quadrature sum of `swell_height` and `wind_wave_height`. The deficit is absorbed into neither field.

### 2.2 Implication for the comparability hypothesis

The hypothesis (production under-prediction = comparison mismatch from missing wind sea) cannot be tested via quadrature. The partition does not conserve energy. The hypothesis remains neither confirmed nor falsified — it is **untestable with the available Open-Meteo data**.

**Parts 2.2–2.4 of P6.2.x are VOID.** No analysis that infers the missing wind-sea term from quadrature arithmetic is valid.

---

## Part 3 — Partitioned Buoy Availability

### CDIP ERDDAP
No partition variables in `wave_agg` endpoint. Available variables: `waveHs`, `waveTp`, `waveTa`, `waveDp`, `wavePeakPSD`, `waveTz` only. CDIP cannot serve swell-partition Hs directly.

### NDBC historical `.spec` (SwH/SwP/WWH/WWP summary format)
NOT available via HTTPS archive for 46012, 46054, 51001, or 44025. All attempts return HTTP 404. This endpoint is not reliably archived.

### NDBC historical `swden` (raw spectral density)
AVAILABLE for all 4 stations (46012, 46054, 51001, 44025). Format: hourly, 47 frequency bins. Deriving SwH/SwP requires integrating the spectral density over swell vs wind-wave frequency bands (~0.12 Hz cutoff). Mechanically feasible but requires a spectral integration step not currently in the pipeline.

### NDBC realtime `.spec`
Available for all 4 stations. Serves SwH/SwP/WWH/WWP live. Not useful for historical backfill.

### NDBC 44025 — full assessment

| Attribute | Value |
|-----------|-------|
| Location | 40.258°N, 73.175°W |
| Depth | 40m (shelf depth — transform does real work) |
| Network | NDBC (breaks the NDBC=deep confound; all current OUTPUT spots are CDIP) |
| Realtime .spec | Available (SwH/SwP live) |
| Historical .spec summary | NOT available (404 for all years tested) |
| Historical swden | AVAILABLE (HTTP 200 confirmed for 2022) |
| Estimated row count | ~19,700 rows/year × 3 years ≈ 59,000 rows |

**44025 is the single station that simultaneously breaks both confounds:**
1. **Depth×network confound** — NDBC nearshore at 40m, not CDIP
2. **Total-vs-swell comparability** — swden integration delivers true swell Hs (SwH) for a swell-vs-swell comparison

Harvest cost: ~59,000 rows backfill + spectral integration development (~0.5 days engineering).

---

## Part 4 — Terminal Decision Memo

### Phase-exit criterion for P6.3

P6.3 opens when: at least one engine-calibration spot (CDIP nearshore, OUTPUT pool) shows a STRUCTURED verdict under **production policy** on a comparison where **engine and buoy report the same quantity** (swell H0 vs swell buoy SwH, or total H0 vs total buoy Hs).

### Current status

- 0 of 6 engine-calibration (OUTPUT) spots are STRUCTURED under harness policy.
- Under production policy, all 6 OUTPUT spots shift further into positive (more under-prediction). A larger uniform mean does not create direction-structure; FLAT-OFFSET spots remain FLAT-OFFSET or degrade to NOISY.
- The total-H0 harness comparison (wave_height_total vs CDIP total Hs) IS apples-to-apples (both total Hs) and showed 0 STRUCTURED verdicts — the most favorable interpretable comparison still fails the gate.
- **P6.3 gate: NOT MET. Zero STRUCTURED verdicts on any apples-to-apples comparison.**

### Options

**Option A — accept current state, operate uncalibrated**
Accept that the swell-driven engine output is not directly validatable against CDIP total-Hs buoys without partitioned buoy data; continue operating uncalibrated.
- Cost: nothing.
- Forecloses: ability to measure engine accuracy on the shipped configuration.
- Implication: bias constants cannot be justified from this data.

**Option B — add NDBC 44025 (40m shelf, NJ) with swden integration (P6.2.16)**
Harvest 59,000 rows; add spectral integration step to derive historical SwH from swden. Enables first swell-vs-swell validation at shelf depth. Breaks both the depth×network and total-vs-swell confounds simultaneously.
- If STRUCTURED at 44025 → P6.3 opens on evidence.
- If FLAT-OFFSET at 44025 → P6.3 closes on evidence (harness is measuring a flat bias that cannot be direction-decomposed by the engine).
- Cost: ~0.5 days engineering (spectral integration + backfill).

**Option C — change production to use total H0 (wave_height_total always)**
Makes existing harness measurements directly applicable. The total-H0 comparison showed 0 STRUCTURED — so this would close P6.3 on evidence immediately. However, this is a product/UX decision: surfers see swell height, not total sea state. Out of scope for calibration.

**Option D — validate engine against a reconstructed total (sum swell + wind-wave through separate transform calls)**
Physics change; out of scope for P6.2.

**Option E — pause calibration, return to product roadmap (Phase 5 dashboard, mobile/watch)**
The harness is correct, gated, and documented. The calibration question is now fully bounded: the bias exists (0.03–0.99m under harness, 0.10–1.16m under production), it is uniform in direction (FLAT-OFFSET, not STRUCTURED), and it cannot be decomposed into learnable physics without partition-aware buoy data. Return to Phase 5; revisit after NDBC 44025 swden integration if/when that work is scoped.

### Recommended direction

**Option E (pause) or Option B (44025 integration)**. Not Option A (leaves the question open without documentation). Not Option C or D (product/physics changes outside this scope).

If shipping per-spot bias constants (Option i from prior memos): blocked. Biases are measured under harness policy, which production does not run. Constants fitted here would ship into a different configuration and may over-correct.

---

## Appendix — Data provenance

All residuals are from the `calibration_residuals` Supabase table, `data_quality = 'ok'` rows, `compare_basis = 'total_h_swell_tp'`. Production-policy residuals in this report are analytical estimates; they are NOT stored in the table. Mean H0 values are arithmetic means over all clean rows per spot. The Ks≈1 approximation for the production shift at nearshore spots has ≤5% error for depths ≥10m at typical swell periods (10–16s).

_Analysis and restatement only — transform.ts untouched, oracle 0.00%, no model trained._
