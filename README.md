# SeaYou 1.0

**Real-time Marine Weather Intelligence**

[![React 19](https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![MapLibre GL JS 5](https://img.shields.io/badge/MapLibre_GL_JS-5.0-396CB2?logo=maplibre&logoColor=white)](https://maplibre.org/)
[![WebGL GPGPU](https://img.shields.io/badge/WebGL-GPGPU-990000?logo=webgl&logoColor=white)](https://www.khronos.org/webgl/)
[![Tailwind CSS 4](https://img.shields.io/badge/Tailwind_CSS-4.1-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-5A0FC8?logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)

---

## Live Demo

**[https://ben1137.github.io/SeaYou1.0/](https://ben1137.github.io/SeaYou1.0/)**

---

## Overview

SeaYou is a real-time marine weather dashboard built for sailors, surfers, kiters, and coastal professionals. It combines a glassmorphism UI design with WebGL GPU-accelerated particle animations that visualize wind and ocean currents in real time. The application renders interactive heatmaps for wave height, sea surface temperature, air temperature, precipitation, and cloud cover -- all powered by the Open-Meteo API. SeaYou delivers comprehensive marine forecasts with persona-based views, activity reports, and a multi-language interface across desktop and mobile devices.

---

## Key Features

### Glassmorphism UI

- **Night Watch** (dark) and **Deep Ocean** (light) themes with Auto mode based on sunrise/sunset
- Backdrop-blur glass panels with layered transparency
- Responsive layout: sidebar navigation on desktop, bottom bar on mobile
- Smooth theme transitions across all components

### Interactive Map Layers (MapLibre GL JS 5 + MapTiler)

| Layer | Engine | Description |
|-------|--------|-------------|
| Wind Particles | GPGPU ParticleEngine | Up to 262,144 animated particles on desktop |
| Ocean Current Particles | GPGPU ParticleEngine | Velocity-field particle animation for surface currents |
| Wave Heatmap | WebGL GenericHeatmapEngine | Color-mapped wave height visualization |
| Sea Surface Temperature | WebGL GenericHeatmapEngine | Thermal gradient overlay of ocean surface |
| Air Temperature | WebGL GenericHeatmapEngine | Atmospheric temperature heatmap |
| Precipitation | WebGL GenericHeatmapEngine | Rainfall intensity overlay |
| Cloud Cover | WebGL GenericHeatmapEngine | Cloud density visualization |
| Sea Temp + Currents | Compound layer | Temperature heatmap with current particle overlay |
| Sea Temp + Wind | Compound layer | Temperature heatmap with wind particle overlay |
| Ports | MapLibre native | Marine port locations |
| Reefs | MapLibre native | Coral reef markers |
| Bathymetry | MapLibre native | Ocean depth contours |
| Rain Radar | Tile overlay | Live precipitation radar from RainViewer |
| Coastline | MapLibre native | Coastline boundary rendering |
| Marine Areas | MapLibre native | Marine zone boundaries |

### Dashboard

- **Weather Hero** -- animated weather condition display with live icons
- **Conditions Grid** -- wave height, wind speed/direction, swell, air and sea temperature
- **Forecast Charts** -- wave, swell, and tide charts with theme-aware colors (Recharts)
- **Activity Report** -- condition ratings for surfing, kiteboarding, sailing, and beach/UV
- **Mariner's Forecast** -- detailed 24-hour tabular forecast with 4 persona tabs:
  - **Mariner** -- pressure, sea state, visibility, wind, swell
  - **Surfer** -- wave vs. swell analysis, period, surf rating
  - **Kite** -- wind speed vs. gusts, direction, riding conditions
  - **Beach** -- UV index, sand wind factor, temperature, comfort

### Atmosphere View

- 24-hour hourly forecast with drag-to-scroll horizontal layout
- Lunar cycle SVG arc showing current moon phase
- Sunrise and sunset times with visual indicators

### Multi-language Support

7 languages: English, German, Spanish, French, Hebrew, Italian, Russian (via i18next)

### Progressive Web App

Installable on desktop and mobile with offline caching via Workbox service worker. API responses are cached with NetworkFirst and CacheFirst strategies for instant subsequent loads.

---

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.2 | UI framework |
| MapLibre GL JS | 5.0.0 | Map rendering engine |
| MapTiler | -- | Custom map styling (dark + light) |
| WebGL / GPGPU | -- | GPU-accelerated particle system and heatmaps |
| Vite | 6.2 | Build tool with GLSL shader loader |
| Tailwind CSS | 4.1 | Utility-first styling |
| TanStack Query | 5.x | Data fetching and caching |
| Recharts | 2.x | Chart visualization |
| i18next | 25.x | Internationalization |
| Lucide React | -- | Icon library |
| date-fns | -- | Date/time formatting |
| Open-Meteo API | -- | Weather and marine data provider |
| RainViewer API | -- | Live precipitation radar |

---

## WebGL Architecture

All WebGL code lives in `packages/web/webgl/`.

### GPGPU Particle System

The `ParticleEngine` implements MapLibre's `CustomLayerInterface` and uses a ping-pong framebuffer object (FBO) pattern for GPU-side particle physics:

1. **prerender()** -- reads current particle positions from FBO[read], runs the physics update shader, writes new positions to FBO[write]. Never touches the screen framebuffer.
2. **render()** -- fades the trail FBO, draws new particle points onto it, then composites the trail onto the MapLibre canvas using premultiplied alpha blending.

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
| Desktop / Laptop | 512 x 512 | 262,144 |
| Mobile / Tablet | 256 x 256 | 65,536 |
| Low-end (2 cores / 2 GB) | 128 x 128 | 16,384 |

### Shader Files

Located in `packages/web/webgl/shaders/`:

- `quad.vert.glsl` -- fullscreen quad vertex shader (shared)
- `fade.vert.glsl` / `fade.frag.glsl` -- trail fade pass (premultiplied alpha)
- `particle-update.frag.glsl` / `particle-update-uint8.frag.glsl` -- GPGPU position update
- `particle-draw.vert.glsl` / `particle-draw-uint8.vert.glsl` -- particle draw vertex
- `particle-draw.frag.glsl` -- particle draw fragment with halo glow and age fade
- `heatmap.vert.glsl` / `generic-heatmap.frag.glsl` / `generic-heatmap-uint8.frag.glsl` -- heatmap rendering

---

## Monorepo Structure

```
seame/
+-- packages/
|   +-- web/           # @seame/web  -- React + MapLibre + WebGL (primary)
|   +-- mobile/        # @seame/mobile -- Expo React Native (glassmorphism)
|   +-- watch/         # @seame/watch  -- Expo Watch (Apple Watch / WearOS)
|   +-- core/          # @seame/core   -- Shared types, services, utilities
+-- package.json       # pnpm@9 workspaces + Turborepo
+-- CLAUDE.md          # AI assistant context
+-- README.md
```

The web package is the primary development target. Mobile and watch packages share types and services from `@seame/core`.

---

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 9+ (`npm install -g pnpm`)

### Installation

```bash
git clone https://github.com/Ben1137/SeaYou1.0.git
cd SeaYou1.0
pnpm install
```

### Development

```bash
pnpm dev                          # Start all packages via Turborepo
pnpm --filter @seame/web dev      # Start web package only
```

Open your browser at `http://localhost:5173/SeaYou1.0/`

---

## Map Layer Controls

The map view includes a layer control panel that lets you switch between visualization modes. Select a single advanced layer at a time from the panel (wind particles, current particles, wave heatmap, sea temperature, air temperature, precipitation, cloud cover, or compound layers). Toggle overlay layers (ports, reefs, bathymetry, coastline, marine areas, rain radar) independently. Each layer loads its data on demand and scales rendering to your device's GPU capabilities. A color scale legend appears automatically for heatmap layers showing the value range and units.

---

## API

All weather and marine data comes from the **Open-Meteo** free API. No API keys are required.

| Endpoint | Data |
|----------|------|
| `marine-api.open-meteo.com/v1/marine` | Wave height, swell, sea temperature, ocean currents |
| `api.open-meteo.com/v1/forecast` | Wind, air temperature, precipitation, cloud cover, UV |
| `geocoding-api.open-meteo.com/v1/search` | Location search and reverse geocoding |
| `api.rainviewer.com` | Live precipitation radar tiles |

API responses are cached client-side with TanStack Query (stale-while-revalidate) and the PWA service worker. Rate limiting is handled with request deduplication, throttle queues, and negative caching to respect Open-Meteo's free tier limits.

---

## Deployment

### Build for Production

```bash
pnpm --filter @seame/web build
```

The optimized production bundle is output to `packages/web/dist/`. The build targets ES2022 for native class field support and splits `maplibre-gl` into a separate chunk.

### GitHub Pages

The application is deployed via GitHub Pages at:

**[https://ben1137.github.io/SeaYou1.0/](https://ben1137.github.io/SeaYou1.0/)**

The Vite base path is configured to `/SeaYou1.0/` to match the repository name.

---

## License

MIT

---

## Credits

- Weather and marine data by [Open-Meteo](https://open-meteo.com/)
- Map tiles and styling by [MapTiler](https://www.maptiler.com/)
- Map rendering engine by [MapLibre GL JS](https://maplibre.org/)
- Rain radar data by [RainViewer](https://www.rainviewer.com/)
- Charts by [Recharts](https://recharts.org/)
- Icons by [Lucide](https://lucide.dev/)
