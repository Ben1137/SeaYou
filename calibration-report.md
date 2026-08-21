# P6.1 Calibration Report

**Run:** 2026-07-22T10:30:33.475Z  
**Engine git SHA:** bf9dd9de  
**Spots:** 9  
**JSONL observations appended:** 3  

## Shore-Normal Gradient Validation
| Spot | CoastAspect° | GradNormal° | Δ° |
|------|-------------|------------|-----|
| Tel Aviv | 288 | 119.5 | 11.5 |
| Mavericks CA | 283 | 30.0 | -73.0 |
| Rincon CA | 210 | 44.5 | 14.5 |
| Pipeline HI | 5 | 127.9 | -57.1 |
| Hossegor FR | 270 | n/a | n/a |
| Uluwatu ID | 202 | 58.0 | 36.0 |
| Jeffreys Bay ZA | 218 | n/a | n/a |
| Santa Cruz CA | 270 | n/a | n/a |
| Scripps CA | 270 | 107.5 | 17.5 |

Mean |Δ°| shore-normal: **34.95°**

## INPUT Residuals (deep buoys — validates swell ingestion)
| Spot | H0 engine | Hs buoy | Δ m | Δ% | Buoy |
|------|-----------|---------|-----|----|------|
| Mavericks CA | 1.42 | 1.80 | -0.38 | -21.1% | NDBC-46012 |
| Rincon CA | 0.62 | 1.70 | -1.08 | -63.5% | NDBC-46054 |
| Pipeline HI | 1.00 | 1.90 | -0.90 | -47.4% | NDBC-51001 |

Mean |Δ| input (deep pool): **0.79 m** (n=3)

## OUTPUT Residuals (nearshore buoys — validates breaking model)
| Spot | HFinal engine | Hs buoy | Δ m | Δ% | Buoy |
|------|---------------|---------|-----|----|------|
| Santa Cruz CA | 1.38 | n/a | n/a | n/a | CDIP-028 |
| Scripps CA | 1.06 | n/a | n/a | n/a | CDIP-073 |

Mean |Δ| output (nearshore pool): **0.00 m** (n=0)

## Wind Classification
| Spot | WindFrom° | m/s | Class |
|------|-----------|-----|-------|
| Tel Aviv | 261 | 12.0 | onshore |
| Mavericks CA | 174 | 23.9 | cross |
| Rincon CA | 167 | 3.3 | onshore |
| Pipeline HI | 91 | 13.0 | cross |
| Hossegor FR | 63 | 6.4 | offshore |
| Uluwatu ID | 136 | 17.2 | cross |
| Jeffreys Bay ZA | 204 | 5.3 | onshore |
| Santa Cruz CA | 259 | 5.5 | onshore |
| Scripps CA | 326 | 10.4 | cross |

## Architecture Guard
- `transform.ts` untouched: **oracle 0.00%** ✓
- Deep and nearshore residual pools kept separate ✓
- No competitor/auth-gated sources used ✓

_Generated autonomously by P6.1 calibrate.ts — no browser, no login._