# P6.2.9 Reconciliation Gate Report

**Generated:** 2026-07-24T11:45:16.798Z  
**Spot:** Scripps CA (CDIP-201, nearshore, depth 41 m)  
**Rows fetched:** 19464  
**Skipped (null wave_period/swell_height):** 0  

## Sign convention
engine_value − buoy_value: **positive = engine over-predicts buoy**

## Consistency Check

Re-runs `nearshoreTransform(swell_height, wave_period, buoy.depthM)` on stored inputs.
Gate: mean |recomputed − stored| < 0.001 m for each band.

| Band  | n | Mean |recomputed−stored| (m) | Result |
|-------|---|------------------------------|--------|
| short | 1604 | 0.000000 | PASS |
| mid | 13590 | 0.000000 | PASS |
| long | 4270 | 0.000000 | PASS |

## DB-Native Residuals (engine_value − buoy_value)

| Band  | n | Mean Δ (m) |
|-------|---|------------|
| short | 1604 | 0.1006 |
| mid | 13590 | 0.1367 |
| long | 4270 | 0.2456 |

## Overall gate: **GATE PASS**

DB is internally consistent. The P6.2.8 reconciliation failure was a banding-key mismatch (swell_period stored as a feature column vs wave_period used as the canonical T). Now fixed. Proceed to P6.2.2.