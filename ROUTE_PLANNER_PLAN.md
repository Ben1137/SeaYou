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

- [x] **Phase 4 — Persona-Specific Routing Modes** ✅
  - [x] Surfer Mode: ×0.7 cost discount on coastal cells with 8–14s swell + 0.5–3 m wave, extra ×0.6 when wind is offshore
  - [x] Diver Mode: hard-filter (Infinity cost) any cell where ocean current > 0.5 m/s; bonus penalty on swell > 1.5 m
  - [x] Beachgoer Mode: extra comfort penalty above 2 m swell
  - [x] Mariner Mode: default fastest-safe-ETA behaviour
  - [x] `OptimizeOptions.persona` threaded through `optimizeRoute` → A* cost fn
  - [x] Grid fetch extended with `wave_period`; coastal cells tagged with landward bearing
  - [x] Auto-select mode from `AlertContext.persona`; button shows persona badge + mode-specific label
  - [x] Route auto-re-analyzes on persona change (useEffect dep)
  - **Exit:** changing persona re-costs route with no user re-input ✅

- [x] **Phase 5 — Live Navigation & Tracking** ✅
  - [x] Fixed `useDeadReckoning` — now spherically projects new lat/lon on a 2 s timer, emits synthetic `navigationUpdate` with `isDeadReckoning: true`, and cancels automatically when a real GPS fix returns (`markGotFix()`).
  - [x] Added `crossTrackError` + `isDeadReckoning` to `NavigationState`; `calculateCrossTrackError()` uses great-circle math, + right / − left in NM.
  - [x] `RouteStatsOverlay` floating HUD: SOG / COG / XTE (L/R, amber > 0.5 NM) / BRG / DIST / ETA, with DR badge + MOB button (two-step confirm) + MOB Recovery card (reciprocal bearing).
  - [x] Multi-subscriber event bus on `offlineNavigation` so overlay + map layers + AIS service can share one singleton.
  - [x] `TrackHistoryLayerML` — dashed cyan polyline driven by new `trackUpdate` event.
  - [x] `MOBLayerML` — pulsing red halo + dot; listens to `mobDropped` / `mobCleared`.
  - [x] Per-waypoint 45 s throttle on "approaching waypoint" voice/haptic alerts.
  - [x] `aisService` — aisstream.io WebSocket with bbox subscription, auto-reconnect, CPA/TCPA sweep every 5 s, 60 s per-MMSI alert throttle. Gracefully inert when `VITE_AISSTREAM_API_KEY` is missing.
  - [x] `AISLayerML` — circle markers sized/colored by SOG; bbox auto-follows map pan.
  - [x] MapContainerML wires all Phase 5 layers + mounts the HUD with live CPA warnings.
  - **Exit:** own-ship + track + AIS + working MOB recovery ✅

- [x] **Phase 6 — Cloud Sync & Voyage Logs** ✅
  - [x] Migration `20260424150000_create_navigation_tables.sql` — `user_routes` + `voyage_logs`, both with RLS covering SELECT / INSERT / UPDATE / DELETE keyed on `auth.uid() = user_id`, + `updated_at` trigger on `user_routes`.
  - [x] `routeCloudSyncService` — `saveRouteCloud` / `getSavedRoutesCloud` / `deleteRouteCloud` / `reconcileLocalRoutesToCloud`. Cloud-first with localStorage fallback; cloud-wins reconciliation on sign-in.
  - [x] `voyageLogService` — `saveVoyageLog` / `listVoyageLogs` / `deleteVoyageLog`, track stored as GeoJSON LineString with `coordTimes` + `coordSpeeds`. `useVoyageAutoSave` hook captures every `navigationStopped` event at app level.
  - [x] `offlineNavigation.stopNavigation()` now emits the final route + history in the `navigationStopped` payload so auto-save doesn't race with cleanup.
  - [x] `gpxExportService` — pure `routeToGpx()` / `voyageToGpx()` (GPX 1.1, validates in OpenCPN / BaseCamp / Navionics) + `downloadGpx()` helper.
  - [x] RoutePlanningView switched to async cloud loader; added per-route **GPX** button.
  - [x] `VoyageLogbookCard` component mounted on the Dashboard — lists completed voyages (distance / avg / max / duration), per-row **Export GPX** + delete.
  - [x] App-level reconcile effect: on sign-in, push any local-only routes to cloud (idempotent via upsert-by-id).
  - **Exit:** sign in on device B, routes + past voyages appear ✅

- [x] **Phase 7 — Global UX & Styling** ✅
  - [x] `components/ui/Toast.tsx` — singleton store + `ToastHost` portal; imperative `toast.success/.error/.info/.warning`. Glass `backdrop-blur-lg`, per-kind color ring, dark: variants, AnimatePresence enter/exit, auto-dismiss (6 s error / 4 s default), per-toast X button, `aria-live="polite"`.
  - [x] `components/ui/Dialog.tsx` — `confirmDialog()` → `Promise<boolean>`, `promptDialog()` → `Promise<string | null>`, `alertDialog()` → `Promise<void>`, glass modal + `DialogHost`. ESC cancels, Enter confirms. Tone variants: default / warning / danger.
  - [x] Both hosts mounted once at App root (inside `RouteProvider`, `AlertProvider`) so non-React singletons can call them.
  - [x] Replaced native dialogs in Route Planner + Navigation flow: `RoutePlanningView` (6 sites: hazard failure, invalid coords, save/load/delete, start-nav failure, geolocation failure), `VoyageLogbookCard` (delete confirm + success toast), `App.tsx` location error codes. Clean sweep — `grep alert\\(` in `RoutePlanningView.tsx` now returns zero.
  - [x] DD ↔ DMS coordinate toggle: new `components/route/coordFormat.ts` with `parseCoord()` (accepts `43.7384`, `43°44'18"N`, `43 44 18 N`, etc.), `toDMS()`, `toDDString()`. Toggle chip in planner header — switching re-renders all four lat/lon fields in the new format; typed input in either format is accepted transparently.
  - [x] Great-circle subdivision: `greatCircleIntermediate()` + `subdivideLongLegs()` in `routePlanningService.ts`. `generateRoute()` now auto-subdivides legs > 60 NM into ~10 NM spherical segments so long passages draw along great-circle arcs, not pole-cutting rhumb lines.
  - [x] NOAA ENC layer: new `components/map/layers/NOAAEncLayerML.tsx` — raster tile source backed by `getNOAAChartTileUrl('enc')` from the previously-dead `noaaChartService.ts`. New `noaaEnc` entry in `geoJSONLayers` state + toggle button + attribution.
  - [x] Dark-mode pass: Toast + Dialog use full `dark:` Tailwind variants; glass panels adapt to `ThemeContext`.
  - **Exit:** zero native dialogs in Planner / Navigation paths; planner accepts DMS input; NOAA ENC toggles on for US waters; long passages follow great-circle arcs ✅

---

## New Dependencies

- `@turf/turf` — add to `packages/core` (for `booleanIntersects`, `lineSliceAlong`, `greatCircle`, `bbox`)

## Current Status

**🎉 SeaYou Navigation Suite 2.0 is officially complete.** All 7 phases shipped.
The Route Planner is now a full Weather-Aware Navigation Suite with cloud sync,
voyage logbook, GPX export, persona-aware isochrone routing, live AIS/MOB/track
overlay, great-circle long-leg drawing, NOAA ENC overlay for US waters, and a
clean glass Toast / Dialog stack replacing every native browser dialog.
