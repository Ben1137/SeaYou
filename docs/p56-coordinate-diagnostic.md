# P5.6 Coordinate Diagnostic — Four Surf Break Pins

**Date:** 2026-08-03 (P5.6)  
**Method:** Direct z10 Terrarium tile fetch at pin coordinates; directional transects at 100–200m steps; box-search simulation with SURF_MIN=3m floor.  
**Purpose:** Determine whether the box search lands on a physically sensible cell for each break, or is hunting across a headland/into a different bay.

---

## Tel Aviv (control) — Gordon Beach (32.082, 34.762)

- z10 direct: **7.0 m** — direct hit, no box search needed.
- Westward transect: monotonic ramp from 7.0 m at the waterline to 28.9 m at 3 km. Physically plausible for Tel Aviv's gentle Mediterranean shelf.
- **Verdict: correct. No move required.**

---

## Pipeline HI — Ehukai Beach (21.665, -158.053)

- z10 direct: **−4 m** (land). Box search fires.
- Box search found: **12.3 m** at **2,209 m away, bearing 25° (NNE)** from pin.
- Westward transect: land for 400 m, then 2.3 m at 500 m, 6.2 m at 600 m, ramp to 37 m at 2 km.
- Southward transect (toward ocean from Ehukai): deepens immediately into land (volcanic cliffs going south at this latitude — Pipeline faces north, open Pacific).
- **Diagnosis:** The box search is hunting northeast across Sunset Beach / Kamehameha Hwy, not toward the break. Pipeline faces north; the ocean is north/offshore of the pin, not NNE across the road. The westward transect correctly reaches water at ~500 m, giving 2.3 m (swash — rejected by floor), then 6.2 m. The box search's NNE cell at 2.2 km is the Haleiwa offshore shelf, not the Pipeline reef.
- **Proposed move:** Shift pin seaward to the surf zone: approximately **(21.667, -158.053)** (100–200 m north into the water). Confirm that the direct z10 hit is < 200 m and ≥ 3 m. Map confirmation required before applying.
- **Hold: do not apply yet.**

---

## Hossegor FR — Beach break (43.670, -1.430)

- z10 direct: **−4.9 m** (land). Box search fires.
- Box search found: **4.9 m** at **1,762 m away, bearing 235° (WSW)** from pin.
- Westward transect: land for 1,100 m (dunes + beach), then ocean at 1,200 m (2.7 m → swash, rises to 4.4 m, 6.3 m).
- **Diagnosis:** The WSW cell at 1.76 km is a legitimate nearshore ocean cell — it's through the dune belt into the water. Hossegor's beach runs N-S with the ocean to the west; the bearing is correct. The depth 4.9 m is plausible for the outer sandbar zone. The box search is working correctly here.
- **However:** 4.9 m is above SURF_MIN=3 m, so it passes. The pin is ~1.2 km east of the waterline (inside the dune belt). For better depth accuracy the pin should be on or just seaward of the shoreline.
- **Proposed move:** Shift pin to the beach waterline: approximately **(43.670, -1.416)** (~1.1 km west). Confirm direct z10 hit at new coords before applying. Map confirmation required.
- **Hold: do not apply yet.**

---

## Uluwatu ID — Reef break (−8.828, 115.088)

- z10 direct: **−87 m** (land — Uluwatu is a cliff). Box search fires.
- Box search found: **7.4 m** at **2,235 m away, bearing 334° (NNW)** from pin.
- SW/SSW/W transect (toward ocean from the cliff): all land for 1,050–1,200 m, then ocean at **4.8–7.7 m** at 1,200 m moving SW or W.
- **Diagnosis:** The NNW cell at 2.2 km is the wrong side — NNW from Uluwatu is inland Bali (Kuta/Denpasar direction). The box search is hunting north across the peninsula, not southwest toward the Indian Ocean. The real break faces SW; SW/W transect finds ocean at ~1.2 km in that direction.
- **Proposed move:** Shift pin ~1.2 km SW to the reef/ocean side: approximately **(−8.837, 115.079)**. Confirm direct z10 hit and distance from shore before applying. The cliff geometry means any pin on the headland resolves as land; the pin needs to be just seaward of the reef drop-off.
- **Hold: do not apply yet.**

---

## Jeffreys Bay ZA — Point break (−34.048, 24.924)

- z10 direct: **−19 m** (land). Box search fires.
- Box search found previously: **1.1 m** (rejected by SURF_MIN=3 m floor in P5.5.5).
- Eastward transect: land for 600 m, then **1.1 m** at 800 m (swash edge, correctly rejected).
- All other directions (south, southwest, west): entirely land — elevation rising, the headland is to the west and south.
- **Diagnosis:** J-Bay is at the northern tip of Cape St Francis headland; the ocean (Indian Ocean / Algoa Bay) is to the EAST. The current box search found the 1.1 m cell 800 m to the east — this is the beach edge on the bay side, which is behind the point (not the break). The point surf is on the northeast side of the headland.
- **Directional issue:** Moving the pin 800 m east would put it in the 1.1 m swash zone (still rejected). Moving it further east finds deeper cells (3.3 m at 800 m on the SE diagonal, which passes the floor). But this may be the sheltered bay side, not the open Indian Ocean swell exposure.
- **Proposed move:** Shift pin northeast toward the open ocean exposure: approximately **(−34.042, 24.932)** (~700 m NE from current pin). Confirm transect to ensure the depth profile is oceanward, not across the headland into the bay. Map confirmation required before applying — J-Bay's geometry is critical here.
- **Hold: do not apply yet.**

---

## Summary

| Spot | Pin issue | Box search behaviour | Hold? |
|---|---|---|---|
| Tel Aviv | None — direct hit at 7.0 m | N/A | ✓ Correct |
| Pipeline HI | Pin on land (Ehukai beach strip) | Hunts NNE to Haleiwa shelf (~2.2 km wrong direction) | Yes — move pin N |
| Hossegor FR | Pin in dune belt (~1.2 km east of waterline) | Finds correct WSW ocean cell at ~1.8 km | Yes — move pin W |
| Uluwatu ID | Pin on cliff face (~1.2 km from ocean) | Hunts NNW inland — wrong side | Yes — move pin SW |
| Jeffreys Bay | Pin on headland | Finds 1.1 m swash (rejected by floor); geometry complex | Yes — move pin NE, map confirm |

All four proposed moves are **held pending map confirmation**. Do not apply coordinates derived from a depth transect alone — the headland geometry at J-Bay and Uluwatu requires visual confirmation that the proposed point is seaward of the break, not behind it.
