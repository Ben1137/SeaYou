# P6.2.2 Calibration Analysis Report — Corrected P6.3 Gate

**Generated:** 2026-07-24T17:21:30.945Z  
**Total clean rows analysed:** 165347  

**Sign convention:** residual = buoy_value − engine_value (positive = engine under-predicts)  
**Bands:** wave_period column (= swell_wave_peak_period, true Tp used for transform, P6.2.10)  
**compare_basis filter:** total_h_swell_tp only (H0=total Hs, T=swell Tp)  

## Thresholds
| Parameter | Value |
|-----------|-------|
| Min sector share for spread | 8% of pool |
| Min sector absolute size    | 30 samples |
| Min qualifying sectors      | 2 |
| STRUCTURED spread threshold | > 0.3 m |
| FLAT-OFFSET spread ceiling  | < 0.15 m (with |mean| > 0.1 m) |
| PERIOD-ARTIFACT trigger     | |long−short| > 0.25 m AND direction spread < STRUCTURED threshold |

**Verdict precedence:** NOISY → FLAT-OFFSET → PERIOD-ARTIFACT → STRUCTURED  
**P6.3 engine-output gate uses NEARSHORE spots only** (deep buoys measure Open-Meteo error, not engine error).  

---

## 1. Coverage Table

| Spot | Input Source | Basis | Year | Rows |
|------|-------------|-------|------|------|
| Cape Canaveral FL | reanalysis | total_h_swell_tp | 2021 | 2152 |
| Cape Canaveral FL | reanalysis | total_h_swell_tp | 2022 | 7854 |
| Cape Canaveral FL | reanalysis | total_h_swell_tp | 2023 | 8492 |
| Cape Henry VA | reanalysis | total_h_swell_tp | 2021 | 2205 |
| Cape Henry VA | reanalysis | total_h_swell_tp | 2022 | 7832 |
| Cape Henry VA | reanalysis | total_h_swell_tp | 2023 | 8736 |
| Clatsop Spit OR | reanalysis | total_h_swell_tp | 2021 | 1744 |
| Clatsop Spit OR | reanalysis | total_h_swell_tp | 2022 | 8757 |
| Clatsop Spit OR | reanalysis | total_h_swell_tp | 2023 | 8736 |
| Mavericks CA | reanalysis | total_h_swell_tp | 2021 | 2200 |
| Mavericks CA | reanalysis | total_h_swell_tp | 2022 | 8631 |
| Mavericks CA | reanalysis | total_h_swell_tp | 2023 | 1391 |
| Oregon Inlet NC | reanalysis | total_h_swell_tp | 2021 | 2205 |
| Oregon Inlet NC | reanalysis | total_h_swell_tp | 2022 | 8757 |
| Oregon Inlet NC | reanalysis | total_h_swell_tp | 2023 | 8735 |
| Pipeline HI | reanalysis | total_h_swell_tp | 2021 | 1952 |
| Pipeline HI | reanalysis | total_h_swell_tp | 2022 | 8559 |
| Pipeline HI | reanalysis | total_h_swell_tp | 2023 | 8723 |
| Rincon CA | reanalysis | total_h_swell_tp | 2021 | 2200 |
| Rincon CA | reanalysis | total_h_swell_tp | 2022 | 8482 |
| Rincon CA | reanalysis | total_h_swell_tp | 2023 | 8720 |
| San Francisco Bar CA | reanalysis | total_h_swell_tp | 2021 | 2205 |
| San Francisco Bar CA | reanalysis | total_h_swell_tp | 2022 | 7963 |
| San Francisco Bar CA | reanalysis | total_h_swell_tp | 2023 | 8652 |
| Scripps CA | reanalysis | total_h_swell_tp | 2021 | 2204 |
| Scripps CA | reanalysis | total_h_swell_tp | 2022 | 8760 |
| Scripps CA | reanalysis | total_h_swell_tp | 2023 | 8500 |

---

## 2. Per-Spot Verdict Summary

| Spot | Validation | n | Dom. Sector % | Qual. Sectors | Spread (m) | Period Δ (m) | **Verdict** |
|------|-----------|---|--------------|---------------|-----------|--------------|-------------|
| Cape Canaveral FL | OUTPUT | 18498 | 70% | 2 | 0.012 | -0.245 | **FLAT-OFFSET (suspect)** |
| Cape Henry VA | OUTPUT | 18773 | 54% | 3 | 0.110 | 0.016 | **FLAT-OFFSET (suspect)** |
| Clatsop Spit OR | OUTPUT | 19237 | 61% | 3 | n/a | 0.028 | **NOISY (insufficient)** |
| Mavericks CA | INPUT | 12222 | 50% | 2 | 0.105 | -0.025 | **FLAT-OFFSET (suspect)** |
| Oregon Inlet NC | OUTPUT | 19697 | 34% | 4 | 0.096 | 0.029 | **FLAT-OFFSET (suspect)** |
| Rincon CA | INPUT | 19402 | 88% | 2 | 0.451 | 0.290 | **STRUCTURED (train-ready)** |
| San Francisco Bar CA | OUTPUT | 18820 | 44% | 3 | 0.172 | 0.151 | **FLAT-OFFSET (suspect)** |
| Scripps CA | OUTPUT | 19464 | 57% | 3 | 0.089 | -0.093 | **FLAT-OFFSET (suspect)** |
| Pipeline HI | INPUT | 19234 | 37% | 4 | 0.243 | 0.423 | **PERIOD-ARTIFACT (investigate globally)** |

---

## 3. Swell-Direction Sector Breakdown

### Cape Canaveral FL (nearshore, reanalysis)
⚡ OUTPUT — validates breaking model  
Buoy: CDIP-143 · n=18498 · mean Δ=0.219m · σ=0.161m  
Dom. sector share: 70% · Qualifying sectors: 2/8 · Spread (qual. only): 0.012m  
Verdict: **FLAT-OFFSET (suspect)**  

| Sector | n | Share % | Mean Δ (m) | Median Δ (m) | StdDev | Qualifies? |
|--------|---|---------|-----------|-------------|--------|------------|
| N | 68 | 0% | 0.126 | 0.123 | 0.136 | ✗ (minor) |
| NE | 4957 | 27% | 0.207 | 0.193 | 0.135 | ✓ |
| E | 13026 | 70% | 0.219 | 0.199 | 0.166 | ✓ |
| SE | 443 | 2% | 0.348 | 0.302 | 0.225 | ✗ (minor) |
| S | 0 | 0% | n/a | n/a | n/a | ✗ (empty) |
| SW | 0 | 0% | n/a | n/a | n/a | ✗ (empty) |
| W | 0 | 0% | n/a | n/a | n/a | ✗ (empty) |
| NW | 4 | 0% | 0.112 | 0.117 | 0.031 | ✗ (minor) |

**Period bucket breakdown:**

| Period | n | Mean Δ (m) | StdDev |
|--------|---|-----------|--------|
| short (<8s) | 12816 | 0.237 | 0.141 |
| mid (8-12s) | 5524 | 0.183 | 0.176 |
| long (>12s) | 158 | -0.008 | 0.484 |

### Cape Henry VA (nearshore, reanalysis)
⚡ OUTPUT — validates breaking model  
Buoy: CDIP-147 · n=18773 · mean Δ=0.295m · σ=0.197m  
Dom. sector share: 54% · Qualifying sectors: 3/8 · Spread (qual. only): 0.110m  
Verdict: **FLAT-OFFSET (suspect)**  

| Sector | n | Share % | Mean Δ (m) | Median Δ (m) | StdDev | Qualifies? |
|--------|---|---------|-----------|-------------|--------|------------|
| N | 157 | 1% | 0.316 | 0.322 | 0.140 | ✗ (minor) |
| NE | 1958 | 10% | 0.389 | 0.335 | 0.229 | ✓ |
| E | 10124 | 54% | 0.279 | 0.243 | 0.194 | ✓ |
| SE | 6414 | 34% | 0.291 | 0.256 | 0.187 | ✓ |
| S | 69 | 0% | 0.264 | 0.265 | 0.129 | ✗ (minor) |
| SW | 8 | 0% | 0.160 | 0.142 | 0.096 | ✗ (minor) |
| W | 8 | 0% | 0.129 | 0.140 | 0.072 | ✗ (minor) |
| NW | 35 | 0% | 0.213 | 0.190 | 0.121 | ✗ (minor) |

**Period bucket breakdown:**

| Period | n | Mean Δ (m) | StdDev |
|--------|---|-----------|--------|
| short (<8s) | 13073 | 0.291 | 0.182 |
| mid (8-12s) | 5554 | 0.302 | 0.230 |
| long (>12s) | 146 | 0.307 | 0.224 |

### Clatsop Spit OR (nearshore, reanalysis)
⚡ OUTPUT — validates breaking model  
Buoy: CDIP-162 · n=19237 · mean Δ=0.028m · σ=0.260m  
Dom. sector share: 61% · Qualifying sectors: 3/8 · Spread (qual. only): n/a  
Verdict: **NOISY (insufficient)**  

| Sector | n | Share % | Mean Δ (m) | Median Δ (m) | StdDev | Qualifies? |
|--------|---|---------|-----------|-------------|--------|------------|
| N | 0 | 0% | n/a | n/a | n/a | ✗ (empty) |
| NE | 0 | 0% | n/a | n/a | n/a | ✗ (empty) |
| E | 0 | 0% | n/a | n/a | n/a | ✗ (empty) |
| SE | 0 | 0% | n/a | n/a | n/a | ✗ (empty) |
| S | 192 | 1% | -0.018 | 0.020 | 0.200 | ✗ (minor) |
| SW | 2011 | 10% | 0.143 | 0.069 | 0.325 | ✓ |
| W | 11657 | 61% | 0.046 | 0.018 | 0.259 | ✓ |
| NW | 5377 | 28% | -0.053 | -0.052 | 0.210 | ✓ |

**Period bucket breakdown:**

| Period | n | Mean Δ (m) | StdDev |
|--------|---|-----------|--------|
| short (<8s) | 8552 | 0.008 | 0.172 |
| mid (8-12s) | 9634 | 0.045 | 0.311 |
| long (>12s) | 1051 | 0.036 | 0.328 |

### Mavericks CA (deep, reanalysis)
📡 INPUT — validates Open-Meteo ingestion (not the engine)  
Buoy: NDBC-46012 · n=12222 · mean Δ=0.459m · σ=0.351m  
Dom. sector share: 50% · Qualifying sectors: 2/8 · Spread (qual. only): 0.105m  
Verdict: **FLAT-OFFSET (suspect)**  

| Sector | n | Share % | Mean Δ (m) | Median Δ (m) | StdDev | Qualifies? |
|--------|---|---------|-----------|-------------|--------|------------|
| N | 0 | 0% | n/a | n/a | n/a | ✗ (empty) |
| NE | 0 | 0% | n/a | n/a | n/a | ✗ (empty) |
| E | 0 | 0% | n/a | n/a | n/a | ✗ (empty) |
| SE | 0 | 0% | n/a | n/a | n/a | ✗ (empty) |
| S | 393 | 3% | 0.239 | 0.200 | 0.193 | ✗ (minor) |
| SW | 328 | 3% | 0.283 | 0.210 | 0.289 | ✗ (minor) |
| W | 5366 | 44% | 0.416 | 0.350 | 0.337 | ✓ |
| NW | 6135 | 50% | 0.521 | 0.460 | 0.359 | ✓ |

**Period bucket breakdown:**

| Period | n | Mean Δ (m) | StdDev |
|--------|---|-----------|--------|
| short (<8s) | 5250 | 0.417 | 0.320 |
| mid (8-12s) | 5947 | 0.508 | 0.373 |
| long (>12s) | 1025 | 0.392 | 0.325 |

### Oregon Inlet NC (nearshore, reanalysis)
⚡ OUTPUT — validates breaking model  
Buoy: CDIP-192 · n=19697 · mean Δ=0.065m · σ=0.239m  
Dom. sector share: 34% · Qualifying sectors: 4/8 · Spread (qual. only): 0.096m  
Verdict: **FLAT-OFFSET (suspect)**  

| Sector | n | Share % | Mean Δ (m) | Median Δ (m) | StdDev | Qualifies? |
|--------|---|---------|-----------|-------------|--------|------------|
| N | 620 | 3% | 0.089 | 0.063 | 0.173 | ✗ (minor) |
| NE | 4022 | 20% | 0.108 | 0.059 | 0.264 | ✓ |
| E | 6709 | 34% | 0.066 | 0.021 | 0.234 | ✓ |
| SE | 4984 | 25% | 0.059 | 0.007 | 0.243 | ✓ |
| S | 3321 | 17% | 0.012 | -0.011 | 0.210 | ✓ |
| SW | 12 | 0% | 0.072 | -0.022 | 0.325 | ✗ (minor) |
| W | 3 | 0% | 0.122 | 0.148 | 0.238 | ✗ (minor) |
| NW | 26 | 0% | 0.072 | 0.067 | 0.182 | ✗ (minor) |

**Period bucket breakdown:**

| Period | n | Mean Δ (m) | StdDev |
|--------|---|-----------|--------|
| short (<8s) | 14165 | 0.048 | 0.209 |
| mid (8-12s) | 5397 | 0.109 | 0.298 |
| long (>12s) | 135 | 0.077 | 0.304 |

### Rincon CA (deep, reanalysis)
📡 INPUT — validates Open-Meteo ingestion (not the engine)  
Buoy: NDBC-46054 · n=19402 · mean Δ=0.989m · σ=0.476m  
Dom. sector share: 88% · Qualifying sectors: 2/8 · Spread (qual. only): 0.451m  
Verdict: **STRUCTURED (train-ready)**  

| Sector | n | Share % | Mean Δ (m) | Median Δ (m) | StdDev | Qualifies? |
|--------|---|---------|-----------|-------------|--------|------------|
| N | 0 | 0% | n/a | n/a | n/a | ✗ (empty) |
| NE | 0 | 0% | n/a | n/a | n/a | ✗ (empty) |
| E | 0 | 0% | n/a | n/a | n/a | ✗ (empty) |
| SE | 19 | 0% | 0.756 | 0.790 | 0.255 | ✗ (minor) |
| S | 1916 | 10% | 0.591 | 0.565 | 0.257 | ✓ |
| SW | 456 | 2% | 0.688 | 0.650 | 0.355 | ✗ (minor) |
| W | 17002 | 88% | 1.042 | 0.985 | 0.474 | ✓ |
| NW | 9 | 0% | 1.832 | 2.065 | 0.450 | ✗ (minor) |

**Period bucket breakdown:**

| Period | n | Mean Δ (m) | StdDev |
|--------|---|-----------|--------|
| short (<8s) | 10468 | 0.969 | 0.430 |
| mid (8-12s) | 7848 | 0.980 | 0.502 |
| long (>12s) | 1086 | 1.258 | 0.608 |
> ⚠️ Period-monotonic bias flagged: |long−short| = 0.290m > 0.25m threshold.

### San Francisco Bar CA (nearshore, reanalysis)
⚡ OUTPUT — validates breaking model  
Buoy: CDIP-142 · n=18820 · mean Δ=0.121m · σ=0.242m  
Dom. sector share: 44% · Qualifying sectors: 3/8 · Spread (qual. only): 0.172m  
Verdict: **FLAT-OFFSET (suspect)**  

| Sector | n | Share % | Mean Δ (m) | Median Δ (m) | StdDev | Qualifies? |
|--------|---|---------|-----------|-------------|--------|------------|
| N | 1 | 0% | -0.107 | -0.107 | n/a | ✗ (minor) |
| NE | 0 | 0% | n/a | n/a | n/a | ✗ (empty) |
| E | 0 | 0% | n/a | n/a | n/a | ✗ (empty) |
| SE | 0 | 0% | n/a | n/a | n/a | ✗ (empty) |
| S | 1868 | 10% | 0.064 | 0.059 | 0.146 | ✓ |
| SW | 756 | 4% | 0.125 | 0.097 | 0.201 | ✗ (minor) |
| W | 8279 | 44% | 0.211 | 0.172 | 0.258 | ✓ |
| NW | 7916 | 42% | 0.040 | 0.029 | 0.211 | ✓ |

**Period bucket breakdown:**

| Period | n | Mean Δ (m) | StdDev |
|--------|---|-----------|--------|
| short (<8s) | 7779 | 0.011 | 0.186 |
| mid (8-12s) | 9172 | 0.206 | 0.237 |
| long (>12s) | 1869 | 0.162 | 0.286 |

### Scripps CA (nearshore, reanalysis)
⚡ OUTPUT — validates breaking model  
Buoy: CDIP-201 · n=19464 · mean Δ=-0.170m · σ=0.172m  
Dom. sector share: 57% · Qualifying sectors: 3/8 · Spread (qual. only): 0.089m  
Verdict: **FLAT-OFFSET (suspect)**  

| Sector | n | Share % | Mean Δ (m) | Median Δ (m) | StdDev | Qualifies? |
|--------|---|---------|-----------|-------------|--------|------------|
| N | 0 | 0% | n/a | n/a | n/a | ✗ (empty) |
| NE | 0 | 0% | n/a | n/a | n/a | ✗ (empty) |
| E | 0 | 0% | n/a | n/a | n/a | ✗ (empty) |
| SE | 0 | 0% | n/a | n/a | n/a | ✗ (empty) |
| S | 6206 | 32% | -0.227 | -0.216 | 0.149 | ✓ |
| SW | 1843 | 9% | -0.192 | -0.183 | 0.147 | ✓ |
| W | 11157 | 57% | -0.138 | -0.131 | 0.177 | ✓ |
| NW | 258 | 1% | -0.042 | -0.093 | 0.223 | ✗ (minor) |

**Period bucket breakdown:**

| Period | n | Mean Δ (m) | StdDev |
|--------|---|-----------|--------|
| short (<8s) | 6394 | -0.125 | 0.189 |
| mid (8-12s) | 9051 | -0.180 | 0.163 |
| long (>12s) | 4019 | -0.219 | 0.144 |

### Pipeline HI (deep, reanalysis)
📡 INPUT — validates Open-Meteo ingestion (not the engine)  
Buoy: NDBC-51001 · n=19234 · mean Δ=0.453m · σ=0.496m  
Dom. sector share: 37% · Qualifying sectors: 4/8 · Spread (qual. only): 0.243m  
Verdict: **PERIOD-ARTIFACT (investigate globally)**  

| Sector | n | Share % | Mean Δ (m) | Median Δ (m) | StdDev | Qualifies? |
|--------|---|---------|-----------|-------------|--------|------------|
| N | 3163 | 16% | 0.339 | 0.270 | 0.546 | ✓ |
| NE | 3790 | 20% | 0.426 | 0.380 | 0.384 | ✓ |
| E | 7107 | 37% | 0.424 | 0.385 | 0.304 | ✓ |
| SE | 7 | 0% | 0.126 | 0.030 | 0.202 | ✗ (minor) |
| S | 5 | 0% | 0.380 | 0.395 | 0.036 | ✗ (minor) |
| SW | 0 | 0% | n/a | n/a | n/a | ✗ (empty) |
| W | 5 | 0% | 1.041 | 1.035 | 0.054 | ✗ (minor) |
| NW | 5157 | 27% | 0.582 | 0.430 | 0.686 | ✓ |

**Period bucket breakdown:**

| Period | n | Mean Δ (m) | StdDev |
|--------|---|-----------|--------|
| short (<8s) | 10413 | 0.421 | 0.316 |
| mid (8-12s) | 7999 | 0.454 | 0.612 |
| long (>12s) | 822 | 0.844 | 0.817 |
> ⚠️ Period-monotonic bias flagged: |long−short| = 0.423m > 0.25m threshold.

---

## 3.5 Named Suspects

### Rincon CA (NDBC-46054) — INPUT pool
Mean Δ = 0.989m · dominant sector share = 88% · qualifying sectors = 2 · verdict = **STRUCTURED (train-ready)**

**Channel Islands shadow hypothesis:** NDBC 46054 (~80 km offshore, 464 m depth) is exposed to open-ocean W/SW swells that the Channel Islands block before they reach Rincon Point. If the dominant-sector analysis confirms W swell owns >80% of samples, this is a representativeness mismatch — the buoy is sampling energy that the engine correctly treats as blocked.

**Finding: STRUCTURED (train-ready)** (qualifying sectors = 2, spread = 0.451m). The direction structure may be real — but as a deep INPUT spot, this still does NOT validate the engine's breaking model. Route to the input-correction track, not P6.3 engine output.

### Mavericks CA (NDBC-46012) — INPUT pool
Mean Δ = 0.459m · qualifying sectors = 2 · spread = 0.105m · verdict = **FLAT-OFFSET (suspect)**

**Finding: FLAT-OFFSET** — the bias (0.459m) is constant across qualifying sectors. Consistent with a systematic CMEMS reanalysis underestimate at this location, not directional engine error. Investigate input source before any correction.

### Scripps CA (CDIP-201) — OUTPUT pool ⚡
Mean Δ = -0.170m · qualifying sectors = 3 · spread = 0.089m · period Δ = -0.093m · verdict = **FLAT-OFFSET (suspect)**


---

## 4. P6.3 Gate

### Engine-Output Candidates (nearshore buoys only)

> Only these spots validate the SeaYou breaking model. Deep buoys are a separate track.

**✅ Train-ready (STRUCTURED, nearshore):**
- _None — check if period-artifact spots can be fixed globally first._

**⚠️ Period-artifact (investigate globally first):**
- _None._

**🚫 Suspect / insufficient (nearshore):**
- Cape Canaveral FL — FLAT-OFFSET (suspect)
- Cape Henry VA — FLAT-OFFSET (suspect)
- Oregon Inlet NC — FLAT-OFFSET (suspect)
- San Francisco Bar CA — FLAT-OFFSET (suspect)
- Scripps CA — FLAT-OFFSET (suspect)
- Clatsop Spit OR — NOISY (insufficient)

### Open-Meteo Input Observations (deep buoys — separate track)

> These spots do NOT validate the engine. A correction here patches the forecast provider.

**STRUCTURED deep spots (input-correction candidates, not P6.3 engine correction):**
- Rincon CA — n=19402, mean Δ=0.989m, spread=0.451m

**Other deep spots:**
- Mavericks CA — FLAT-OFFSET (suspect) (mean Δ=0.459m)
- Pipeline HI — PERIOD-ARTIFACT (investigate globally) (mean Δ=0.453m)

> **Rule:** P6.3 trains ONLY on nearshore STRUCTURED spots.
> PERIOD-ARTIFACT spots: investigate whether the period trend is global across all nearshore spots; if so, fix the root cause (physics or input) rather than learning per-spot.
> FLAT-OFFSET: fix the data/comparison definition first.
> Deep spots: route to input-correction investigation, not engine-output P6.3.

_Generated by P6.2.2 residualReport.ts — analysis only; no physics changes; no model training._