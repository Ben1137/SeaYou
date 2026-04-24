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

- [x] **Phase 2 — Weather-Along-Route & Safety Checks** ✅
  - [x] `sampleWeatherAlongRoute()` at ETA intervals (Open-Meteo hourly, bulk coords)
  - [x] Segment recolor green/amber/red by persona-aware wind/wave/current thresholds
  - [x] Turf.js `lineIntersect(route, coastline)` landmask check (Natural Earth 10m)
  - [x] Real `getDepthAtLocationGEBCO()` via GEBCO WMS GetFeatureInfo
  - [x] `HazardAlert` gets "Weather Warnings" group (wind/wave/current/land/shallow)
  - **Exit:** shallow/stormy route shows red + hazards before Start Nav ✅

- [x] **Phase 3 — Route Optimization & Isochrone Routing** ✅
  - [x] `VesselSettings` extended with `cruiseSpeed` / `upwindPenalty` / `maxHeadSea`; `VESSEL_POLAR_DEFAULTS` seeded per vessel type
  - [x] `isochroneRouter.ts` — SOG vector (polar + current projection + head-sea penalty)
  - [x] A* on lat/lon grid (8-connected, haversine heuristic) → optimized polyline
  - [x] Departure-window recommender (T..T+48h, 3h step, safety-weighted rank, Top 3)
  - [x] "Optimize Route" button + "Best Departure" card wired into RoutePlanningView
  - **Exit:** optimizer returns isochrone path with ETA delta vs rhumb; falls back gracefully when weather API is offline ✅

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

Phases 1, 1.5, 2, and 3 shipped. **Awaiting user approval to begin Phase 4 — Persona-Specific Routing Modes.**
