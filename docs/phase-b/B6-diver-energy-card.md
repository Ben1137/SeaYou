# Phase B · B.6 — DIVE-modal energy card → honest surface-swell-exposure indicator (build decision)

> **Status:** Recon verified; **build decision made (Ben)**. This doc records the finding, the
> physics ceiling, what is honestly buildable oracle-free, the decision, and the constraints the
> build must carry. **`transform.ts` / `packages/core/src/nearshore` stay untouched (oracle law).**
> Sibling doc: [B6-wiring-recon.md](./B6-wiring-recon.md) (the Open-Meteo dependency map + self-sourced
> boundary; §4 there is the two-consistency naming-collision guard this doc inherits).
>
> **Method:** direct read of the display + oracle files, then an adversarial verify pass (6 skeptics,
> one per finding, each re-reading cited code to refute it and catch overclaim). **6/6 CONFIRMED, 0
> refutations.** Line numbers below reflect the *current* file state on `feat/energy-consistency-cards`
> (the sibling doc's `EnergyConsistencyCard.tsx` line numbers predate the `variant='modal'` addition,
> which shifted the file down).

---

## TL;DR

The DIVE modal shows the **surf** Energy card unchanged: an energy-flux number (a surf metric) plus a
"Steady %" **steadiness** bar that fills green and reads as positive — but *steady-but-large swell is
still hazardous to a diver*, so the steadiness framing is the misleading element (not any energy-polarity
bar; there is no green energy bar). A true **bottom-surge** indicator is **not buildable oracle-free** —
energy flux is depth-invariant as used, the only available depth is coarse bathymetry that never resolves
the surf zone (and is frequently null), and **no bottom-orbital-velocity computation exists anywhere in
the codebase**. What *is* honestly buildable oracle-free is a **period-weighted surface-swell-exposure**
signal via the existing `surfPowerKwPerM` (height + period both in scope). **Decision: build that** — a
diver-relevant *surface* exposure indicator, explicitly scope-noted "not the surge you feel at depth,"
polarity inverted (high = caution), the "Steady" framing dropped, scoped to the DIVE modal only.

## Decision

- **🟢 GO — build the honest surface-swell-exposure indicator (option (a)).**
- **🔴 NOT bottom surge.** A depth-resolved surge signal = new orbital-velocity physics against an
  unreliable depth = **NEEDS-ORACLE, out of scope** for an oracle-free build.
- **Label = surface exposure, with a "not bottom surge" scope note.** The scope note is what makes the
  modal *complete rather than misleading* — it tells the diver what this covers and what to judge elsewhere.
- **Oracle untouched.** Uses the already-exported `surfPowerKwPerM`; `transform.ts`/`nearshore` unchanged.

---

## 1. THE FINDING — a surf metric shown unchanged to divers

The DIVE modal renders the **same** `EnergyConsistencyCard` as the surf personas. It is a single,
persona-parameterized modal instance:

- Render, gated **only** on `weatherData` (no persona gate):
  [ScoreBreakdownModal.tsx:156-165](../../packages/web/components/ScoreBreakdownModal.tsx#L156), with
  `variant="modal"` at [:162](../../packages/web/components/ScoreBreakdownModal.tsx#L162).
- One instance, keyed by `breakdownPersona`:
  [Dashboard.tsx:807-815](../../packages/web/components/Dashboard.tsx#L807) (`isOpen` :808, `activityLabel`
  from `LABEL_MAP[breakdownPersona]` :810). `ActivityPersona.DIVER` opens the identical card as surfers.

**What the card shows:**
- **Energy flux (kW/m)** — a *surf* metric. Active source is `ENERGY_HEIGHT_SOURCE === 'BREAKING'`
  ([EnergyConsistencyCard.tsx:54](../../packages/web/components/EnergyConsistencyCard.tsx#L54)) →
  `H=coastalReading.H0`, `T=coastalReading.T`, `d=Infinity`
  ([:160-162](../../packages/web/components/EnergyConsistencyCard.tsx#L160)) → `surfPowerKwPerM(H,T,Infinity)`
  ([:173](../../packages/web/components/EnergyConsistencyCard.tsx#L173)).
- **"Steady %" steadiness bar** — `temporalSteadiness` (CoV) over 7 points (hour-0 seed +`i=1..6` loop,
  [:185-205](../../packages/web/components/EnergyConsistencyCard.tsx#L185); call at
  [:203](../../packages/web/components/EnergyConsistencyCard.tsx#L203); CoV at
  [consistency.ts:74](../../packages/core/src/nearshore/consistency.ts#L74)).

**The misleading element is the STEADINESS framing, not an energy-polarity bar.** Verified:
- The **kW/m number is a neutral magnitude readout** — rendered `text-yellow-300`
  ([:245](../../packages/web/components/EnergyConsistencyCard.tsx#L245)); its color/typography **does not
  vary with magnitude** (only a null check at [:243](../../packages/web/components/EnergyConsistencyCard.tsx#L243)
  changes it). **There is no green "higher-energy-is-good" bar to invert.**
- The **only fill+color element is the steadiness bar**: for the TEMPORAL metric
  `barPct=(1−CoV/0.5)·100` ([:84-85](../../packages/web/components/EnergyConsistencyCard.tsx#L84)) → low CoV
  (steady) → high fill → `bg-teal-400` "Steady" (color ternaries
  [:90-102](../../packages/web/components/EnergyConsistencyCard.tsx#L90)). A green **"Steady"** readout reads
  as *good*, but for a diver **steady-but-large swell is still hazardous** — steadiness answers the wrong
  question. (The card already prints a "Not a score factor" disclaimer at
  [:229](../../packages/web/components/EnergyConsistencyCard.tsx#L229); it does not rescue the mismatch — the
  surfer's energy number is still the headline, and the green bar still reads positive.)

## 2. THE PHYSICS CEILING — why bottom surge is out of scope oracle-free

A true diver "surge" signal is **bottom orbital velocity**, which depends on height **and** period **and**
local depth. Three independent facts put it out of reach without oracle/engine work:

1. **`surfPowerKwPerM` is depth-invariant as used.** Production passes `d=Infinity`
   ([EnergyConsistencyCard.tsx:162](../../packages/web/components/EnergyConsistencyCard.tsx#L162)), so `Cg`
   falls back to deep-water `gT/4π` ([surfEnergy.ts:29](../../packages/core/src/nearshore/surfEnergy.ts#L29)).
   Even at a *finite* `d`, energy **flux** is conserved along shoaling (`H²·Cg = H0²·Cg0 = const`, documented
   [EnergyConsistencyCard.tsx:6-9](../../packages/web/components/EnergyConsistencyCard.tsx#L6)) — it is **not**
   the depth-attenuated orbital motion a diver feels at the bottom.
2. **The only available depth is coarse and often absent.** `coastalReading.d` is a **Terrarium zoom-10
   bathymetry** depth explicitly documented as **never resolving surf-zone depths**
   ([useCoastalReading.ts:48](../../packages/web/hooks/useCoastalReading.ts#L48),
   [:63](../../packages/web/hooks/useCoastalReading.ts#L63)), and `coastalReading` is **null** on land, deep
   water (≥200 m), `d≤0`, `H0<0.05`, `T<1`, or while the fetch is in-flight
   ([:13-18](../../packages/web/hooks/useCoastalReading.ts#L13),
   [:132](../../packages/web/hooks/useCoastalReading.ts#L132),
   [:163](../../packages/web/hooks/useCoastalReading.ts#L163)).
3. **No bottom-orbital-velocity computation exists in the codebase.** The wavenumber `k` needed for
   `u_b = π·H / (T·sinh(k·d))` *is* exported from `dispersion(T,d)`
   ([dispersion.ts:67](../../packages/core/src/nearshore/dispersion.ts#L67), returned
   [:78](../../packages/core/src/nearshore/dispersion.ts#L78)), **but** every `sinh()` in the repo computes
   the group-speed ratio `n` via **`sinh(2kd)`**, never a `sinh(kd)` orbital velocity — verified at
   [dispersion.ts:72](../../packages/core/src/nearshore/dispersion.ts#L72),
   [ksVerify.ts:86](../../packages/core/src/nearshore/ksVerify.ts#L86),
   [shader-verify.ts:42](../../packages/core/src/nearshore/shader-verify.ts#L42), and the coastal-dynamics
   fragment shader (`coastal-dynamics.frag.glsl:132`).

**Conclusion:** a true bottom-surge indicator = **new physics** (an orbital-velocity function) run against
**unreliable/absent depth** = **NEEDS-ORACLE, out of scope.** Do not pursue it as "oracle-free."

## 3. WHAT'S HONESTLY BUILDABLE — surface swell exposure (oracle-free)

- **Period-weighted surface swell energy via `surfPowerKwPerM`** — the function already exists
  ([surfEnergy.ts:41](../../packages/core/src/nearshore/surfEnergy.ts#L41); formula `P=(1/16)·ρ·g·H²·Cg` at
  [:30](../../packages/core/src/nearshore/surfEnergy.ts#L30)) and is exported
  ([core/src/index.ts:6](../../packages/core/src/index.ts#L6) →
  [nearshore/index.ts:4](../../packages/core/src/nearshore/index.ts#L4)). It is **already imported** by the
  card.
- **Both inputs are in scope, oracle-free:** swell **height** and swell **period** — via
  `weatherData.current.swellHeight/swellPeriod` (destructured at
  [EnergyConsistencyCard.tsx:146](../../packages/web/components/EnergyConsistencyCard.tsx#L146)) and/or the
  live `coastalReading.H0/.T`. Period-weighting is the honest part: for equal height, longer period carries
  more energy and is the reasonable direction for "more likely to be felt."
- **What it honestly IS:** a **SURFACE swell-exposure** signal — directly relevant to a diver's
  **entry/exit difficulty** (getting off the rocks / back on the boat) and **boat/surface comfort** at the
  site. It is **NOT** bottom surge.
- **What it must NOT claim:** anything about depth-resolved surge. It must be **labeled as surface exposure**
  and carry an explicit scope note along the lines of *"surface swell energy — not the surge you feel at
  depth."*
- (Existing nearshore-transformed values `HShoaled`/`HBreaker`/`breaking`/`breakingCap` on `coastalReading`
  [useCoastalReading.ts:42-85](../../packages/web/hooks/useCoastalReading.ts#L42) are also available read-only
  and describe **surface** breaking/shoaled height — same honest ceiling: surface, not bottom.)

## 4. THE DECISION (Ben's) — build option (a), the honest surface-exposure indicator

**Build the surface-swell-exposure indicator.** Rationale:

- **Surface swell genuinely matters to divers** — entry/exit off rocks or ladders, surface swim,
  boat comfort and seasickness at the dive site. It is not a surf-only concern.
- **The goal is the most complete *honest* picture, assembled from honestly-scoped parts** — not one
  card that pretends to be the whole story. **Completeness comes from the DIVE modal AS A WHOLE**: the
  `scoreDiver` breakdown rows already cover Visibility, Wave Height, Current, Sea Temp and Wind Speed
  ([personas.ts:290](../../packages/core/src/scoring/personas.ts#L290), rows
  [:310-316](../../packages/core/src/scoring/personas.ts#L310)); the surface-exposure card adds the swell
  dimension. No single card claims to cover everything.
- **The scope note ("not bottom surge") is what MAKES it complete rather than misleading.** By stating
  plainly what it covers (surface conditions) and implying what to check elsewhere (depth/site-specific
  surge, viz, current), an honestly-scoped card *adds* to the picture instead of overclaiming. An
  unlabeled "surge" card would have been the misleading option; the labeled surface-exposure card is the
  complete one.

## 5. CONSTRAINTS carried into the build

1. **Honest label — surface exposure, not surge.** Present it as surface swell exposure with the explicit
   *"not the surge you feel at depth"* scope note. Never label it "surge" / "bottom surge."
2. **Polarity inverted.** HIGH exposure = **caution**, not a positive "good" bar. Reuse the existing color
   vocabulary but reverse the direction: high value → amber/rose, low → calm/teal (the mapping to change is
   the `barColor`/`textColor` ternaries at
   [EnergyConsistencyCard.tsx:90-102](../../packages/web/components/EnergyConsistencyCard.tsx#L90) and the
   `barPct` formula at [:84-86](../../packages/web/components/EnergyConsistencyCard.tsx#L84)).
3. **Drop the "Steady" steadiness framing for divers.** The temporal-steadiness bar answers the wrong
   question for a diver (steady-but-large = still hazardous). The diver variant should show exposure
   magnitude → hazard, not steadiness.
4. **Scoped to the DIVE modal only.** Surf / boogie / kite keep the energy-flux card **byte-identical**.
   The seam is the existing `variant?: 'dashboard' | 'modal'` prop
   ([EnergyConsistencyCard.tsx:70](../../packages/web/components/EnergyConsistencyCard.tsx#L70), default
   [:140](../../packages/web/components/EnergyConsistencyCard.tsx#L140)) — add a diver mode. Minor plumbing:
   `ScoreBreakdownModal` currently receives no persona enum (only `activityLabel`
   [ScoreBreakdownModal.tsx:27](../../packages/web/components/ScoreBreakdownModal.tsx#L27)), so
   `breakdownPersona` ([Dashboard.tsx:85](../../packages/web/components/Dashboard.tsx#L85)) must be threaded
   modal→card. No data/oracle change.
5. **Naming-collision boundary untouched** (inherited from
   [B6-wiring-recon.md §4](./B6-wiring-recon.md)). Temporal consistency stays `temporalSteadiness`/CoV
   (import [EnergyConsistencyCard.tsx:27](../../packages/web/components/EnergyConsistencyCard.tsx#L27)).
   Ensemble `hs_spread_m` stays **out** — it is worker-side only
   ([marine_ingest.py:409-410,545,612](../../workers/marine_ingest.py#L409)), never a `@seame/core` field
   (grep of `packages/core` = 0), and appears in `packages/` solely as a comment at
   [ScoreBreakdownModal.tsx:155](../../packages/web/components/ScoreBreakdownModal.tsx#L155). **Never feed
   `hs_spread_m` into `ConsistencyResult.value`.**

---

## Appendix — verified evidence (adversarial pass, 6/6 CONFIRMED)

Load-bearing citations re-read against actual code; nothing below was refuted:

- Single persona-parameterized modal; diver = same card
  ([Dashboard.tsx:807-815](../../packages/web/components/Dashboard.tsx#L807),
  [ScoreBreakdownModal.tsx:156-165](../../packages/web/components/ScoreBreakdownModal.tsx#L156)).
- Active energy path = `surfPowerKwPerM(coastalReading.H0, .T, Infinity)`
  ([EnergyConsistencyCard.tsx:54](../../packages/web/components/EnergyConsistencyCard.tsx#L54),
  [:160-173](../../packages/web/components/EnergyConsistencyCard.tsx#L160)). (The `current.swell*`/`wave*`
  branches at [:164-168](../../packages/web/components/EnergyConsistencyCard.tsx#L164) are inactive dead code
  under `'BREAKING'`, but those fields *are* present on `weatherData.current`.)
- kW/m is a color-invariant magnitude readout; steadiness bar is the only fill+color element
  ([:243-259](../../packages/web/components/EnergyConsistencyCard.tsx#L243),
  [:84-102](../../packages/web/components/EnergyConsistencyCard.tsx#L84)).
- No `sinh(kd)` orbital velocity anywhere; only `sinh(2kd)` group-speed ratio
  ([dispersion.ts:72](../../packages/core/src/nearshore/dispersion.ts#L72),
  [ksVerify.ts:86](../../packages/core/src/nearshore/ksVerify.ts#L86),
  [shader-verify.ts:42](../../packages/core/src/nearshore/shader-verify.ts#L42)).
- Depth is coarse Terrarium z10, frequently null
  ([useCoastalReading.ts:13-18,48,63,132,163](../../packages/web/hooks/useCoastalReading.ts#L13)).
- `surfPowerKwPerM` exists + exported ([surfEnergy.ts:41](../../packages/core/src/nearshore/surfEnergy.ts#L41),
  [core/src/index.ts:6](../../packages/core/src/index.ts#L6)); `dispersion` returns `k`
  ([dispersion.ts:78](../../packages/core/src/nearshore/dispersion.ts#L78)).
- `hs_spread_m` is worker-only, not a core field
  ([marine_ingest.py:409](../../workers/marine_ingest.py#L409); comment only at
  [ScoreBreakdownModal.tsx:155](../../packages/web/components/ScoreBreakdownModal.tsx#L155)).
- Aside: `wind_wave_height` exists on `hourly` only ([types/index.ts:54](../../packages/core/src/types/index.ts#L54)),
  **not** on `current` — not needed for this build, noted for completeness.

---

## STOP — for Ben's review

Decision is recorded as **GO on the honest surface-swell-exposure indicator** with the five constraints
above. This doc is the build brief; no code has been written. Open the build when you're ready — the first
concrete step is the DIVE-only `variant` + threading `breakdownPersona` into the modal (constraint 4),
then swap the steadiness bar for an inverted-polarity surface-exposure bar with the scope note (constraints
1–3), leaving surf/boogie/kite byte-identical.
