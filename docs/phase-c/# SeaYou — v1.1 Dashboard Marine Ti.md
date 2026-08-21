# SeaYou — v1.1: Dashboard Marine Timeline (Wave Chart)
Branch: feat/marine-timeline (off main @ 945f8d9). Flag: VITE_FEATURE_MARINE_TIMELINE (NEW, separate).
Standing rules apply. STOP after Phase 1 — prove data layer before any UI.

## Design (locked)
- Continuous hourly wave chart: 72h history + 72h forecast, "now" as a vertical ReferenceLine.
- Past visually muted vs vibrant forecast — achieved by TWO series (pastData / futureData split at now),
  NOT by per-point opacity on one series (a single Recharts Area/Line cannot fade half of itself).
- Scroll-anchored: on load, container scrolls so "Now" sits left-of-center (~6h history / ~18h forward visible).
- Flag OFF = byte-identical to today (24h forward-only, no past_days). Non-negotiable.
- Graceful nulls: line breaks, never dives to 0 (SeaYou is any-location; marine data IS null in some spots).

## Phase 1 — Data layer (flag-gated). STOP after this, prove it, wait for go.
- TIMELINE_ON = import.meta.env.VITE_FEATURE_MARINE_TIMELINE === 'true'. Confirm envPrefix VITE_.
- fetchMarineWeather: add past_days=3 to marineParams ONLY when TIMELINE_ON. Keep forecast_days=10.
  Flag OFF → request identical to prod (no past_days) across ALL marine consumers.
- Dashboard.tsx chartData slice (currently slice(currentHourIndex, currentHourIndex+24)):
    - Flag OFF: UNCHANGED — currentHourIndex to +24.
    - Flag ON: window = Math.max(0, currentHourIndex - 72) to Math.min(len, currentHourIndex + 72).
    - Expose the split point (index of "now" within the sliced window) so Phase 2 can divide past/future.
- Do NOT touch chart JSX, ReferenceLine, opacity, scroll yet. Do NOT change connectNulls yet
  (report the current <Area>/<Line> connectNulls value so flag-OFF stays identical).
- PROVE with printed values (real run, both states):
    * FLAG OFF: marine request has NO past_days; chartData.length ~24; chartData[0].time == now-ish;
      identical to current behavior.
    * FLAG ON: marine request has past_days=3; chartData spans 72h before now to 72h after;
      currentHourIndex still resolves to the real current hour (print its timestamp);
      print wave_height/wave_period at window-start (oldest past), at now, at +12h — all non-null at Tel Aviv.
  Then STOP.

## Phase 2 — UI (separate, after Phase 1 approved)
- STEP 0 (recon): report how the chart is currently sized — ResponsiveContainer? fixed width? — since
  scroll-anchoring a 144h timeline needs a fixed-width inner chart in an overflow-x container, which
  interacts with the current responsive layout. Report before building.
- Split chartData into pastData (start..now) + futureData (now..end), overlapping ONE point at "now"
  so there's no seam gap. Render as two <Area>: past muted (opacity ~0.4, desaturated), future vibrant.
- Vertical ReferenceLine at the "now" timestamp, labeled "Now", minimalist (subtle dashed, no heavy grid).
- connectNulls={false} on the flag-ON series so gaps break the line (NOT flag-off if that changes prod).
- Scroll container + useRef/useEffect: on mount, scroll so "Now" is left-of-center (~6h past / ~18h forward).
- Flag OFF path renders the OLD single-series 24h chart untouched.

## Acceptance gates (dev bypass, real screenshots + printed values)
- [ ] Flag OFF: request no past_days; chart pixel-identical to prod 24h forward chart.
- [ ] Flag ON: 144h continuous chart; "Now" ReferenceLine present and correctly placed.
- [ ] Flag ON: past visually muted, forecast vibrant (two-series split working).
- [ ] Flag ON: auto-scrolls to Now on load (~6h history / ~18h forward visible).
- [ ] Flag ON at a known-null location: line breaks gracefully, no dive-to-0.
- [ ] Oracle 0.00% (untouched, confirm). Dashboard's other cards untouched.

## Verify → merge (Ben's gates)
- Agent: screenshots flag ON+OFF via dev bypass, printed request URLs + array spans. Never real creds.
- Ben: real-login verify both states. Curated --ff-only merge to seayou10/main. Ships flag-OFF.