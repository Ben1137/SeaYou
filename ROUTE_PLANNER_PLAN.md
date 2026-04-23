# Route Planner 2.0 — Progress Tracker

Master Blueprint: upgrade SeaYou Route Planner from a form-based straight-line
calculator to a professional Weather-Aware Navigation Suite.

Full plan with file paths, reusable utilities, and verification steps lives at
`C:\Users\user01\.claude\plans\zany-sparking-milner.md`.

**Rule:** one phase at a time. Each phase ships as its own branch + PR.
Do NOT start the next phase without explicit user approval.

---

## Phase Status

- [x] **Phase 1 — Core Map Integration & Waypoint UI** ✅
  - [x] `RouteLayerML` GeoJSON layer (line + waypoint circles) on MapContainerML
  - [x] Route drawn live on MapContainerML (via shared RouteContext) — "Show on Map" button in Planner
  - [x] Long-press / right-click to drop waypoint; drag (ghost pin, Esc snap-back) to move; tap to delete (endpoints protected)
  - [x] Port/Marina search bar → `fetchMarinaDetails()` → "Add as waypoint" (Phase 1.5)
  - [x] Wire existing `addWaypoint()` to the UI (context `appendWaypoint` + waypoint list editor)
  - **Exit:** 3+ waypoint route on map, line + pins visible, form in sync ✅

- [ ] **Phase 2 — Weather-Along-Route & Safety Checks**
  - [ ] `sampleWeatherAlongRoute()` at ETA intervals (reuse marineGrid cache)
  - [ ] Segment recolor green/amber/red by wind/wave/current thresholds
  - [ ] Turf.js `booleanIntersects(route, coastline)` landmask check
  - [ ] Implement real `getDepthAtLocation()` via GEBCO WMS GetFeatureInfo
  - [ ] `HazardAlert` gets "Weather Warnings" group
  - **Exit:** shallow/stormy route shows red + hazards before Start Nav

- [ ] **Phase 3 — Route Optimization & Isochrone Routing**
  - [ ] `VesselSettings.polar` added; seeded defaults per vessel type
  - [ ] `isochroneRouter.ts` — SOG vector (polar + current + wind drift)
  - [ ] A*/Dijkstra on isochrone grid → optimized polyline
  - [ ] Departure-window recommender (T, T+3h, ... 48h, ranked ETAs)
  - [ ] "Optimize Route" button + "Best Departure" card
  - **Exit:** optimized path visibly beats rhumb line against currents

- [ ] **Phase 4 — Persona-Specific Routing Modes**
  - [ ] Surfer Mode: offshore-wind bias, swell period/direction preferences
  - [ ] Diver Mode: filter segments with current > 0.5 m/s; slack-tide preference
  - [ ] Auto-select mode from `alertConfig.persona`
  - **Exit:** changing persona re-costs route with no user re-input

- [ ] **Phase 5 — Live Navigation & Tracking**
  - [ ] Fix `useDeadReckoning` — actually update nav state, not just log
  - [ ] `RouteStatsOverlay` floating on map (SOG/COG/XTE/ETA/TWA/TWS)
  - [ ] Render `navigationHistory` as faded track polyline
  - [ ] Throttle waypoint-approaching alerts (30s min between repeats)
  - [ ] MOB button — drops red pin, live bearing/distance
  - [ ] AIS via aisstream.io WebSocket + CPA/TCPA alarms
  - **Exit:** own-ship + track + AIS + working MOB recovery

- [ ] **Phase 6 — Cloud Sync & Voyage Logs**
  - [ ] Supabase migration: `user_routes` table with RLS
  - [ ] `saveRoute/getSavedRoutes/deleteRoute` → Supabase (fallback localStorage)
  - [ ] `voyage_logs` persistence at end-of-trip
  - [ ] GPX + KML export generators
  - **Exit:** sign in on device B, routes + past voyages appear

- [ ] **Phase 7 — Global UX & Styling**
  - [ ] Framer-motion Toast + Dialog primitives
  - [ ] Replace every native `alert()`, `confirm()`, `prompt()` in route paths
  - [ ] DMS coordinate input toggle
  - [ ] Great-circle subdivision for legs > 60 NM
  - [ ] Auto Day/Night Planner styling + dawn/dusk route tint
  - [ ] NOAA ENC WMS overlay (wire or delete `noaaChartService.ts`)
  - **Exit:** zero native dialogs in Planner; dark mode clean; ENC toggles on

---

## New Dependencies

- `@turf/turf` — add to `packages/core` (for `booleanIntersects`, `lineSliceAlong`, `greatCircle`, `bbox`)

## Current Status

Phase 1 + 1.5 shipped. **Starting Phase 2 — Weather-Along-Route & Safety Checks.**
