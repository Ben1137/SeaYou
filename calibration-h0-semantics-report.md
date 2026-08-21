# P6.2.7 H0 Semantics / Double-Shoaling Check

**Generated:** 2026-07-24T09:11:44.721Z  

---

## Design
- **A (nearshore):** Open-Meteo best_match at the NEARSHORE coordinate → nearshoreTransform(H0_A, T, depthM)
- **B (offshore):** Open-Meteo best_match ~1° west/offshore in deep water → nearshoreTransform(H0_B, T, depthM)
- Both compared against the same buoy. Period band: buoy Tp.
- **Double-shoaling signal:** H0_A < H0_B AND |residual_B| < |residual_A| → nearshore cell already depth-influenced.

---

## Scripps CA (primary suspect)

### Scripps CA
Nearshore cell: (32.868, -117.267) | Offshore cell: (32.868, -118.267)
Buoy: 201 at depth 41m | Pairs with both A+B: 17284

| Band | n | H0_A (near) | H0_B (off) | H0_A−H0_B | Resid_A | Resid_B | Verdict |
|------|---|------------|-----------|-----------|---------|---------|---------|
| short | 1388 | 1.270 | 1.448 | -0.179 | 0.091 | 0.269 | ambiguous |
| mid | 12080 | 0.986 | 1.154 | -0.168 | 0.135 | 0.294 | ambiguous |
| long | 3816 | 0.959 | 1.137 | -0.178 | 0.248 | 0.411 | ambiguous |

---

## Cape Henry VA (control — spot.depthM == buoy.depthM = 18m, positive bias)

### Cape Henry VA
Nearshore cell: (36.908, -75.845) | Offshore cell: (36.908, -76.845)
Buoy: 147 at depth 18m | Pairs with both A+B: 0

| Band | n | H0_A (near) | H0_B (off) | H0_A−H0_B | Resid_A | Resid_B | Verdict |
|------|---|------------|-----------|-----------|---------|---------|---------|
| short | 12877 | 0.757 | n/a | n/a | -0.303 | n/a | unclear |
| mid | 3592 | 0.805 | n/a | n/a | -0.251 | n/a | unclear |
| long | 123 | 1.090 | n/a | n/a | -0.029 | n/a | unclear |

---

## Interpretation

If H0_A < H0_B AND residual_B closer to 0 at Scripps:
→ **H0 DOUBLE-SHOALING CONFIRMED** — sampling H0 from the nearshore cell ingests a partially-shoaled value.
→ Fix: source H0 from an offshore cell (or use `swell_wave_height` which is more representative of open-ocean swell energy).
→ No physics change to transform.ts.

If H0_A ≈ H0_B:
→ H0 semantics are fine at this resolution; the −0.170m offset has another cause (refraction, shadow, representativeness).

_Analysis only — transform.ts untouched, oracle 0.00%._