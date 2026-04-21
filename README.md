# SeaYou 1.0

**Real-time Marine Weather Intelligence**

[![React 19](https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![MapLibre GL JS 5](https://img.shields.io/badge/MapLibre_GL_JS-5.0-396CB2?logo=maplibre&logoColor=white)](https://maplibre.org/)
[![WebGL GPGPU](https://img.shields.io/badge/WebGL-GPGPU-990000?logo=webgl&logoColor=white)](https://www.khronos.org/webgl/)
[![Tailwind CSS 4](https://img.shields.io/badge/Tailwind_CSS-4.1-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth_%2B_Edge-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Stripe](https://img.shields.io/badge/Stripe-Checkout-635BFF?logo=stripe&logoColor=white)](https://stripe.com/)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-5A0FC8?logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)

---

## Live Demo

**[https://ben1137.github.io/SeaYou1.0/](https://ben1137.github.io/SeaYou1.0/)**

Production builds also deploy to Vercel for previews and staging.

---

## Overview

SeaYou is a real-time marine weather dashboard built for sailors, surfers, kiters, and coastal professionals. It combines a glassmorphism UI with WebGL GPU-accelerated particle animations that visualize wind and ocean currents in real time, interactive heatmaps (wave height, sea surface temperature, air temperature, precipitation, cloud cover) powered by the Open-Meteo API, a persona-driven activity scoring engine, a safety-first Route Planner, a full onboarding + interactive tour pipeline, cross-device preference sync via Supabase, push notifications via OneSignal, and a Stripe-powered Premium subscription tier — all across 7 languages, desktop, mobile, and Apple Watch / WearOS.

---

## Key Features

### Glassmorphism UI

- **Night Watch** (dark) and **Deep Ocean** (light) themes
- **Auto Day/Night** mode — class switches on `<html>` based on Open-Meteo sunrise/sunset at the user's location (falls back to 6 AM – 6 PM local time)
- Backdrop-blur glass panels with layered transparency
- Responsive layout: sidebar navigation on desktop, bottom bar on mobile
- Smooth theme transitions across all components
- **CSS-based fullscreen** on the Wave Forecast Graph and Forecast Table — iOS-Safari safe, double-click or tap the expand icon (bypasses the broken native Fullscreen API and Recharts' event swallowing)

### Interactive Map Layers (MapLibre GL JS 5 + MapTiler)

| Layer | Engine | Tier |
|-------|--------|------|
| Wind Particles | GPGPU ParticleEngine | Premium |
| Ocean Current Particles | GPGPU ParticleEngine | Premium |
| Wave Heatmap | WebGL GenericHeatmapEngine | Premium |
| Sea Surface Temperature | WebGL GenericHeatmapEngine | Premium |
| Air Temperature | WebGL GenericHeatmapEngine | Free |
| Precipitation | WebGL GenericHeatmapEngine | Free |
| Cloud Cover | WebGL GenericHeatmapEngine | Free |
| Sea Temp + Currents | Compound layer | Premium |
| Sea Temp + Wind | Compound layer | Premium |
| GEBCO Depth Charts (Bathymetry WMS) | External WMS | Premium |
| Ports, Reefs, Coastline, Marine Areas | MapLibre native | Free |
| Rain Radar | Tile overlay (RainViewer) | Free |

Tapping a Premium layer as a Free user opens the **Premium Paywall Modal** which launches Stripe Checkout.

### Dashboard

- **Weather Hero** — animated weather condition display with live icons
- **Conditions Grid** — wave height, wind speed/direction, swell, air and sea temperature
- **Forecast Charts** — wave, swell, and tide charts with theme-aware colors (Recharts). Double-click or tap the expand icon to enter CSS fullscreen.
- **Forecast Table** — same fullscreen UX as the chart.
- **Activity Report** — 0-100 persona-scored cubes (surfing, kiteboarding, sailing, beach/UV, diving). Tap any cube to open the **Score Breakdown Modal** with a human-readable explanation of *why* the score landed where it did (green / gray / red factor rows), warnings, and a "Tune Sensitivity (PRO)" upsell teaser.
- **Mariner's Forecast** — detailed 24-hour tabular forecast with 4 persona tabs:
  - **Mariner** — pressure, sea state, visibility, wind, swell
  - **Surfer** — wave vs. swell analysis, period, surf rating
  - **Kite** — wind speed vs. gusts, direction, riding conditions
  - **Beach** — UV index, sand wind factor, temperature, comfort

### Route Planner (Safety-First)

**How to access:** tap the **Route Planner** tab in the left sidebar (desktop) or the bottom nav bar (mobile). The tab was renamed from "Routes" → "Route Planner" across all 7 locales to make the intent clearer.

Once inside the Route Planner view:

1. **Legal Disclaimer Banner** (dismissible, persisted via `localStorage`) — shown at the top on first visit. Explicit warning that SeaYou is for recreational guidance only and must never be used for primary navigation. Dismissal is remembered across sessions per device.
2. **Vessel Settings** — set your vessel name, type (sail / power / fishing / commercial), and **draft in metres**. The draft feeds the hazard engine's shallow-water check. Saved to `localStorage`.
3. **Create a route via a form** — enter:
   - Start Location — type a name plus latitude / longitude, or tap the pin icon to fill from GPS (`navigator.geolocation`).
   - Destination — same inputs.
   - Average Speed (knots).
   Press **Create Route** and SeaYou generates a great-circle straight-line route (Haversine distance, initial bearing) with start + destination waypoints.
4. **Route summary** — total distance (NM), ETA, waypoint count, average speed.
5. **Automatic Hazard Analysis** — every new or loaded route is sent through `analyzeRouteHazards()` in `@seame/core`. It fetches OpenStreetMap `seamark:*` features (rocks, reefs, wrecks, restricted/military areas, prohibited anchorages, traffic separation, submarine cables/pipelines) from the Overpass API for the route's bounding box, computes perpendicular distance from each hazard to every segment, and flags anything within (`hazard.radius + 500 m` safety margin). Results feed the **HazardAlert** panel grouped by severity (Critical → Danger → Advisory). Shallow water triggers a warning when `minDepth < vesselDraft + 1 m`. OSM hazards are cached in `localStorage` for 7 days so the panel still works offline.
6. **Save / Load / Delete routes** — persisted in `localStorage['savedRoutes']`; there is a Saved Routes drawer for recalling or removing past routes.
7. **Start Navigation** — hands the route off to `offlineNavigation` (singleton `OfflineNavigationSystem`). From that point the app:
   - watches the GPS with `watchPosition({enableHighAccuracy:true})` and falls back to dead reckoning when GPS drops,
   - reads the compass via `DeviceOrientationEvent` (iOS 13+ permission prompt is handled),
   - streams a live `NavigationState` (heading, smoothed speed in knots, distance + bearing to next waypoint, ETA, % progress),
   - emits alerts for *approaching waypoint* (< 0.5 NM), *waypoint reached* (< 0.1 NM), *off course* (> 45° deviation), *low speed* (< 0.5 kts), *destination reached*,
   - fires a haptic (`navigator.vibrate`) and spoken (`speechSynthesis`) announcement at every waypoint and destination,
   - appends positions to a 100-point history used by dead reckoning and (in future) for track display.
8. **Weather overlay** — while planning, toggle **GEBCO Depth Charts** (Premium), wind / current particles, and wave heatmap from the Layers panel to sanity-check conditions along your straight-line route.

### Onboarding + Interactive Tour

- 3-step onboarding modal — persona selection → free/premium choice → welcome
- **React Joyride** interactive tour — 6 coach-marks walking new users through Dashboard scores, Map nav, Map Layers panel, Map canvas, Nearby tab, and Profile hub
- Tour is **viewport-aware** — targets `-desktop` or `-mobile` nav IDs based on the 1024 px breakpoint
- **Completion persistence** — Close, Skip, or Finish all write `preferences.hasCompletedTour = true` to the user's Supabase row so the tour never re-appears on subsequent logins

### User Profile Hub

- Single full-page modal with identity, persona, language, favorites ticker (live scored), synced-to-cloud indicator, danger zone (sign out, delete account)
- Upgrade to Premium CTA (hidden when already Premium) that launches Stripe Checkout

### Stripe Revenue Engine

- `subscriptionTier: 'free' | 'premium'` gates all Premium layers
- Two Supabase Edge Functions handle the full lifecycle:
  - **`create-checkout-session`** — authenticated; creates a Stripe Checkout Session in subscription mode with `client_reference_id` and `metadata.user_id` set to the caller's Supabase UUID. Supports `STRIPE_TRIAL_DAYS` and `allow_promotion_codes`.
  - **`stripe-webhook`** — public (`verify_jwt = false`); verifies `Stripe-Signature` via Web Crypto HMAC-SHA256 (no `stripe-node` dep → Deno-friendly); handles `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`; deep-merges `subscriptionTier` into `user_preferences.preferences` via the service-role client (bypasses RLS)
- Free Trial CTA, Profile upgrade button, and Paywall `onUpgrade` all call the shared `startCheckout()` in `packages/web/src/services/billing.ts`

### Cross-Device Sync (Supabase)

- Email-magic-link, Google, and Apple sign-in via Supabase Auth
- `user_preferences` table (RLS-protected) stores persona, home location, favorites, language, theme, `hasCompletedTour`, and `subscriptionTier`
- Automatic bi-directional sync on sign-in / sign-out

### Push Notifications (OneSignal)

- Opt-in push prompt shown after onboarding
- Daily 06:00 UTC `daily-surf-report` Edge Function (triggered by `pg_cron`):
  1. Reads every user with a home location + persona + OneSignal player ID
  2. Fetches today's hourly marine + weather forecast from Open-Meteo
  3. Runs every hour through the shared `@seame/core` activity-scoring engine for that user's persona
  4. If the peak score of the day is ≥ 75 ("Good" or better), sends a persona-tailored teaser push via the OneSignal REST API

### Atmosphere View

- 24-hour hourly forecast with drag-to-scroll horizontal layout
- Lunar cycle SVG arc showing current moon phase
- Sunrise and sunset times with visual indicators

### Multi-language Support

7 languages: English, German, Spanish, French, Hebrew, Italian, Russian (via i18next), with RTL handling for Hebrew.

### Progressive Web App

Installable on desktop and mobile with offline caching via Workbox service worker. API responses are cached with NetworkFirst and CacheFirst strategies for instant subsequent loads.

---

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.2 | UI framework |
| MapLibre GL JS | 5.0.0 | Map rendering engine |
| MapTiler | — | Custom map styling (dark + light) |
| WebGL / GPGPU | — | GPU-accelerated particle system and heatmaps |
| Vite | 6.2 | Build tool with GLSL shader loader |
| Tailwind CSS | 4.1 | Utility-first styling (`darkMode: 'class'`) |
| TanStack Query | 5.x | Data fetching and caching |
| Recharts | 2.x | Chart visualization |
| React Joyride | 5.x | Interactive product tour |
| Framer Motion | 11.x | UI transitions |
| i18next | 25.x | Internationalization (7 locales) |
| Lucide React | — | Icon library |
| date-fns | — | Date/time formatting |
| Supabase | 2.45 | Auth + Postgres + Edge Functions (Deno) |
| Stripe | — | Subscription billing (Checkout + webhooks) |
| OneSignal | — | Web + mobile push notifications |
| Open-Meteo API | — | Weather and marine data provider (free, no key) |
| RainViewer API | — | Live precipitation radar |
| GEBCO WMS | — | Global bathymetry / depth charts |

---

## WebGL Architecture

All WebGL code lives in `packages/web/webgl/`.

### GPGPU Particle System

The `ParticleEngine` implements MapLibre's `CustomLayerInterface` and uses a ping-pong framebuffer object (FBO) pattern for GPU-side particle physics:

1. **prerender()** — reads current particle positions from FBO[read], runs the physics update shader, writes new positions to FBO[write]. Never touches the screen framebuffer.
2. **render()** — fades the trail FBO, draws new particle points onto it, then composites the trail onto the MapLibre canvas using premultiplied alpha blending.

### Precision Modes

| Mode | Requirement | Description |
|------|-------------|-------------|
| Float32 | `OES_texture_float` extension | Full-precision RGBA float textures |
| Uint8 | Universal WebGL 1 | 16-bit position encoding in R8G8B8A8 textures |
| Canvas 2D | No WebGL | `CanvasVectorLayer` fallback for basic vector rendering |

### Heatmap Engines

The `GenericHeatmapEngine` powers all heatmap layers (wave, sea temperature, air temperature, precipitation, cloud cover). Each engine uses an offscreen canvas managed by `OffscreenCanvasManager` to render color-mapped grid data without blocking the main map render pipeline.

### Device Capability Tiers

`DeviceCapabilities.ts` detects device class and scales particle count accordingly:

| Device Tier | Particle Resolution | Particle Count |
|-------------|--------------------:|---------------:|
| Desktop / Laptop | 512 × 512 | 262,144 |
| Mobile / Tablet | 256 × 256 | 65,536 |
| Low-end (≤ 2 cores / ≤ 2 GB RAM) | 128 × 128 | 16,384 |

### Shader Files

Located in `packages/web/webgl/shaders/`:

- `quad.vert.glsl` — fullscreen quad vertex shader (shared)
- `fade.vert.glsl` / `fade.frag.glsl` — trail fade pass (premultiplied alpha)
- `particle-update.frag.glsl` / `particle-update-uint8.frag.glsl` — GPGPU position update
- `particle-draw.vert.glsl` / `particle-draw-uint8.vert.glsl` — particle draw vertex
- `particle-draw.frag.glsl` — particle draw fragment with halo glow and age fade
- `heatmap.vert.glsl` / `generic-heatmap.frag.glsl` / `generic-heatmap-uint8.frag.glsl` — heatmap rendering

---

## Monorepo Structure

```
seame/
├── packages/
│   ├── web/           # @seame/web     — React + MapLibre + WebGL (primary)
│   ├── mobile/        # @seame/mobile  — Expo React Native (glassmorphism)
│   ├── watch/         # @seame/watch   — Expo Watch (Apple Watch / WearOS)
│   └── core/          # @seame/core    — Shared types, services, scoring engine
├── supabase/
│   ├── config.toml    # Per-function verify_jwt flags
│   ├── functions/
│   │   ├── create-checkout-session/   # Stripe Checkout (auth'd)
│   │   ├── stripe-webhook/            # Stripe webhook (public, HMAC-verified)
│   │   └── daily-surf-report/         # OneSignal daily push cron
│   └── migrations/                    # user_preferences + RLS policies
├── package.json       # pnpm@9 workspaces + Turborepo
├── CLAUDE.md          # AI assistant context
└── README.md
```

The web package is the primary development target. Mobile and watch packages share types, scoring, and services from `@seame/core`.

---

## Getting Started

### Prerequisites

- Node.js 18+ (Node 24 LTS recommended)
- pnpm 9+ (`npm install -g pnpm`)
- (Optional) Supabase CLI + Stripe CLI for local testing of Edge Functions

### Installation

```bash
git clone https://github.com/Ben1137/SeaYou1.0.git
cd SeaYou1.0
pnpm install
```

### Environment Variables

Create `packages/web/.env.local` with:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_ONESIGNAL_APP_ID=<onesignal-app-id>   # optional, enables push
```

Supabase Edge Function secrets (set via Supabase Dashboard → Project → Edge Functions → Secrets):

| Variable | Used by | Example |
|----------|---------|---------|
| `STRIPE_SECRET_KEY` | `create-checkout-session`, `stripe-webhook` | `sk_live_...` / `sk_test_...` |
| `STRIPE_PRICE_ID` | `create-checkout-session` | `price_1Abc...` |
| `STRIPE_SUCCESS_URL` | `create-checkout-session` | `https://seayou.app/?checkout=success` |
| `STRIPE_CANCEL_URL` | `create-checkout-session` | `https://seayou.app/?checkout=cancel` |
| `STRIPE_TRIAL_DAYS` | `create-checkout-session` (optional) | `7` |
| `STRIPE_WEBHOOK_SECRET` | `stripe-webhook` | `whsec_...` |
| `ONESIGNAL_APP_ID` | `daily-surf-report` | OneSignal app ID |
| `ONESIGNAL_REST_API_KEY` | `daily-surf-report` | OneSignal REST key |

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by Supabase.

### Development

```bash
pnpm dev                          # Start all packages via Turborepo
pnpm --filter @seame/web dev      # Start web package only
```

Open your browser at `http://localhost:5173/SeaYou1.0/`

### Deploying Edge Functions

```bash
supabase functions deploy create-checkout-session
supabase functions deploy stripe-webhook --no-verify-jwt
supabase functions deploy daily-surf-report
```

Then add a Stripe webhook endpoint at:
`https://<project-ref>.functions.supabase.co/stripe-webhook`
subscribed to `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.

---

## Map Layer Controls

The map view includes a layer control panel that lets you switch between visualization modes. Select a single advanced layer at a time (wind particles, current particles, wave heatmap, sea temperature, air temperature, precipitation, cloud cover, or compound layers). Toggle overlay layers (ports, reefs, bathymetry / GEBCO depth charts, coastline, marine areas, rain radar) independently. Each layer loads its data on demand and scales rendering to your device's GPU capabilities. A color scale legend appears automatically for heatmap layers showing the value range and units. Free users see a Premium Paywall on locked layers.

---

## API

All weather and marine data comes from the **Open-Meteo** free API. No API keys are required for weather.

| Endpoint | Data |
|----------|------|
| `marine-api.open-meteo.com/v1/marine` | Wave height, swell, sea temperature, ocean currents |
| `api.open-meteo.com/v1/forecast` | Wind, air temperature, precipitation, cloud cover, UV, is_day, sunrise/sunset |
| `geocoding-api.open-meteo.com/v1/search` | Location search and reverse geocoding |
| `api.rainviewer.com` | Live precipitation radar tiles |
| `wms.gebco.net` | Global bathymetry WMS (Depth Charts — Premium) |

API responses are cached client-side with TanStack Query (stale-while-revalidate) and the PWA service worker. Rate limiting is handled with request deduplication, throttle queues (max 2 concurrent), negative caching (15 s TTL on 429s), and a 30 s global cooldown after any 429 — see `MEMORY.md` and `packages/web/src/utils/requestDeduplication.ts`.

---

## Deployment

### Build for Production

```bash
pnpm --filter @seame/web build
```

The optimized production bundle is output to `packages/web/dist/`. The build targets ES2022 for native class field support and splits `maplibre-gl` into a separate chunk.

### GitHub Pages

Canonical deployment:
**[https://ben1137.github.io/SeaYou1.0/](https://ben1137.github.io/SeaYou1.0/)**

The Vite base path is configured to `/SeaYou1.0/` to match the repository name.

### Vercel

Preview and staging builds run on Vercel. The project uses Vercel's default Vite framework preset — no `vercel.json` is required. Environment variables (`VITE_*`) are set via the Vercel dashboard or `vercel env pull`.

---

## Recent Changes

- **Apr 2026** — Auto Day/Night theme on fullscreen panels + Score Breakdown Modal; Interactive Tour completion persists to Supabase on Close/Skip/Finish; Stripe Revenue Engine (create-checkout-session + stripe-webhook Edge Functions, `startCheckout()` billing service, paywall wired on Profile / Onboarding / Map upsell)
- **Apr 2026** — Route Planner safety pivot: legal disclaimer banner, hazard warnings list replaces "Auto-Fix Route"; GEBCO Depth Charts WMS as Premium layer
- **Apr 2026** — CSS-state fullscreen for Wave Graph + Forecast Table (iOS Safari safe, bypasses Recharts event swallowing)
- **Feb 2026** — WebGL state-leak fix ("colored cubicles"); particle count tiering via `DeviceCapabilities` (no longer uses `devicePixelRatio`); Windy-style particle visual tuning
- **Feb 2026** — API rate-limiting hardening (throttle queue + negative cache + global cooldown)

See `CLAUDE.md` for full architectural decisions and bug-pattern notes.

---

## License

MIT

---

## Credits

- Weather and marine data by [Open-Meteo](https://open-meteo.com/)
- Map tiles and styling by [MapTiler](https://www.maptiler.com/)
- Map rendering engine by [MapLibre GL JS](https://maplibre.org/)
- Rain radar data by [RainViewer](https://www.rainviewer.com/)
- Bathymetry by [GEBCO](https://www.gebco.net/)
- Charts by [Recharts](https://recharts.org/)
- Icons by [Lucide](https://lucide.dev/)
- Auth + Postgres + Edge Functions by [Supabase](https://supabase.com/)
- Billing by [Stripe](https://stripe.com/)
- Push by [OneSignal](https://onesignal.com/)
- Interactive tour by [React Joyride](https://react-joyride.com/)
