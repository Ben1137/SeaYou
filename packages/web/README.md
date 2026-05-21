# SeaYou — Marine Weather Dashboard

SeaYou is a comprehensive, real-time marine weather application for sailors, surfers, kite surfers, and beachgoers. It uses the Open-Meteo API to deliver high-resolution marine and atmospheric data through a GPGPU-accelerated map, persona-based dashboards, and intelligent alert system.

## Live App

**Primary (Vercel):** [https://sea-you1-0-app.vercel.app/](https://sea-you1-0-app.vercel.app/)

> The GitHub Pages URL is a secondary mirror that lags behind Vercel by one CI run. Vercel is the canonical deployment.

---

## Features

### Real-Time Marine Data

- **Activity Reports** — Dedicated summary cards for Sailing, Surfing, Kite Surfing, and Beach comfort.
- **Live Metrics** — Wind Speed & Direction, Wave Height & Period, Swell, Air & Sea Temperatures.
- **Persona-Based Forecast Tables** — 24-hour tailored views for Mariner, Surfer, Kiter, and Beachgoer.

### Interactive Map (MapLibre + GPGPU WebGL)

- **Wind & Current Particles** — Windy-style GPGPU particle system (up to 262k particles on desktop).
- **Wave Heatmap, Sea Temperature, Air Layers** — WebGL heatmaps with colour ramps and opacity blending.
- **Activity Layers** — Swell Direction, Dive Suitability, Chop Level, Gust Delta.
- **Forecast Model Picker** — Compact dropdown floating on the map canvas. Switch between ICON, ECMWF, GFS, AROME, and more without leaving the map. Preference persists to user profile.
- **Model Comparison Panel** — Side-by-side table of wave height, wind speed, swell, and sea temp across up to 3 models simultaneously. Highlights when models disagree significantly (low-confidence forecast warning).
- **AIS Vessel Traffic** — Live crowd-sourced vessel tracking layer (opt-in toggle in the layers panel). CPA collision-proximity alerts.
- **Navigational Charts** — OpenSeaMap ENC overlay (buoys, beacons, channel markers) and official NOAA ENC tiles (US waters, free for all users).
- **Tap-to-Query** — Tap any ocean point for an instant popup with wind, wave, current, and depth data.

### Bright Deck — Sun Mode Theme

A pure-white, zero-transparency theme optimised for reading the screen in direct sunlight. Activated via the theme toggle in Settings or the quick-access button on the dashboard. All glassmorphism surfaces are replaced with solid high-contrast panels.

### Alert System

- **Range-Based Sweet-Spot Alerts** — Define a target wave height and wind speed range (not just an upper threshold). Receive a notification when both are simultaneously inside your personal sweet spot — ideal for planning the perfect session.
- **Threshold Alerts** — Upper-bound storm and strong-wind warnings as before.
- **Tsunami Warnings** — Live GDACS data with map epicentres.

### Per-User Onboarding

A guided wizard collects your activity persona, home location, and alert preferences on first launch. Preferences sync to the cloud via Supabase so settings follow you across devices — not locked to a single browser's localStorage.

---

## Tech Stack

| Technology | Version | Role |
|---|---|---|
| React | 19.2 | UI framework |
| MapLibre GL JS | 5.0 | Map rendering |
| WebGL / GPGPU | — | Particle engines, heatmaps |
| Vite | 6.2 | Build tool |
| TailwindCSS | 4.1 | Styling |
| TanStack Query | 5.x | Data fetching & caching |
| i18next | 25.x | 7-language internationalisation |
| Supabase | — | Auth + cloud preferences sync |
| Open-Meteo | — | Marine & forecast weather data |
| pnpm + Turborepo | — | Monorepo tooling |

---

## Local Development

### Prerequisites

- Node.js 20+
- pnpm 9+

### Setup

```bash
git clone https://github.com/Ben1137/SeaYou.git
cd SeaYou
pnpm install
```

### Run dev server (web only)

```bash
pnpm --filter @seame/web dev
```

### Run all packages

```bash
pnpm dev
```

Open `http://localhost:5173` (or the port shown in the terminal).

### Build

```bash
pnpm --filter @seame/core build   # always build core first
pnpm --filter @seame/web build
```

---

## Deployment

SeaYou deploys to two targets. Vercel is primary.

| Target | URL | `VITE_PWA_BASE` |
|---|---|---|
| **Vercel** (primary) | `sea-you1-0-app.vercel.app/` | `/` |
| GitHub Pages (mirror) | `ben1137.github.io/SeaYou1.0/` | `/SeaYou1.0/` |

Vercel deploys automatically on every push to `main`. GitHub Pages is triggered by `.github/workflows/deploy.yml`.

See `.env.example` for all configurable environment variables.

---

## Acknowledgments

- Weather and marine data by [Open-Meteo](https://open-meteo.com/)
- Map tiles by [MapLibre GL JS](https://maplibre.org/)
- Icons by [Lucide](https://lucide.dev/)
- Charts by [Recharts](https://recharts.org/)
