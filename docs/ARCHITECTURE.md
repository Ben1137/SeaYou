# SeaYou — Architecture Guide

> Written for junior developers. No prior WebGL knowledge required.

---

## Table of Contents

1. [High-Level Overview](#1-high-level-overview)
2. [Data Flow: Weather API → Map](#2-data-flow-weather-api--map)
3. [Request Deduplication & Rate Limiting](#3-request-deduplication--rate-limiting)
4. [How MapLibre Custom Layers Work](#4-how-maplibre-custom-layers-work)
5. [GPGPU Particle System (Wind & Currents)](#5-gpgpu-particle-system-wind--currents)
6. [The Globe Void: Starfield & Sky Atmosphere](#6-the-globe-void-starfield--sky-atmosphere)
7. [Heatmap Layers](#7-heatmap-layers)
8. [Device Tiers & Particle Scaling](#8-device-tiers--particle-scaling)
9. [WebGL Safety: The Nuclear Reset Pattern](#9-webgl-safety-the-nuclear-reset-pattern)
10. [Key Files Reference](#10-key-files-reference)

---

## 1. High-Level Overview

SeaYou is a real-time marine weather dashboard. Here's the big picture in one sentence:

> **Weather data flows from the Open-Meteo API → through a caching + deduplication layer → into React hooks → into GPU-rendered WebGL layers drawn on top of a MapLibre 3D globe.**

The app is split into four packages:

| Package | What it does |
|---|---|
| `packages/web/` | The browser app — React 19, MapLibre GL JS, WebGL |
| `packages/core/` | Shared logic — API services, request deduplication, scoring engine |
| `packages/mobile/` | Expo React Native app |
| `packages/watch/` | Expo Apple Watch / WearOS app |

All weather API calls, request deduplication, and scoring engine code lives in **`packages/core/`** so it can be shared by all three apps.

---

## 2. Data Flow: Weather API → Map

Here is the complete path that data takes from the internet to your screen:

```
┌──────────────────────────────────────────────────┐
│               Open-Meteo APIs (free, no key)     │
│  marine-api.open-meteo.com  →  waves, sea temp   │
│  api.open-meteo.com         →  wind, rain, UV    │
│  geocoding-api.open-meteo.com → location search  │
└──────────────────────┬───────────────────────────┘
                       │ HTTP fetch
                       ▼
┌──────────────────────────────────────────────────┐
│  requestDeduplication.ts  (packages/core/)       │
│                                                  │
│  • Deduplication: if two components ask for the  │
│    same URL at the same time, only ONE request   │
│    goes out — both get the same Promise back     │
│                                                  │
│  • Throttle queue: max 2 requests in flight      │
│    at once — excess requests wait in a queue     │
│                                                  │
│  • Negative cache: if a 429 (Too Many Requests)  │
│    comes back, that URL is blocked for 15 s      │
│                                                  │
│  • Global cooldown: after ANY 429, all requests  │
│    pause for 30 seconds to let the API recover   │
└──────────────────────┬───────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────┐
│  marineGridService.ts  (packages/core/)          │
│                                                  │
│  Fetches a 12×12 grid of points covering the     │
│  visible map area. Caches the response for       │
│  5 minutes (TTL). Multiple layers share the      │
│  same grid — only one API call per viewport.     │
└──────────────────────┬───────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────┐
│  React Hooks  (packages/web/hooks/)              │
│                                                  │
│  useSharedMarineData        → wave + current     │
│  useSharedForecastGridData  → wind + temp        │
│                                                  │
│  These hooks are shared — every active layer     │
│  subscribes to the same data, so fetching        │
│  happens once no matter how many layers are on.  │
└──────────────────────┬───────────────────────────┘
                       │ Float32Array grid data
                       ▼
┌──────────────────────────────────────────────────┐
│  WebGL Engines  (packages/web/webgl/)            │
│                                                  │
│  ParticleEngine        → wind / current trails  │
│  GenericHeatmapEngine  → all scalar heatmaps    │
│                                                  │
│  Each engine implements MapLibre's              │
│  CustomLayerInterface so MapLibre calls it      │
│  on every animation frame.                      │
└──────────────────────┬───────────────────────────┘
                       │ pixels
                       ▼
             MapLibre GL JS 3D Globe
               (visible on screen)
```

**Key rule:** API fetches are always debounced 300–500 ms after the map stops moving. Never call Open-Meteo directly on every `moveend` event — use the debounced hooks.

---

## 3. Request Deduplication & Rate Limiting

**File:** `packages/core/src/utils/requestDeduplication.ts`

Open-Meteo is a free API with rate limits. Without protection, the app could fire 70+ requests in a burst when many layers load at once and trigger a 429 cascade.

The deduplication system has three layers of protection:

### Layer 1 — In-flight deduplication (milliseconds)
If component A and component B both ask for the same URL at the same time:
- Only **one** actual HTTP request goes out
- Both components get back the **same Promise**
- When the data arrives, both components get it simultaneously

```
Component A ──┐
              ├──► single fetch ──► both get data
Component B ──┘
```

### Layer 2 — Throttle queue (prevents burst)
At most **2 requests** can be in-flight simultaneously. Any additional requests go into a queue and wait. This prevents the 70-request burst problem.

### Layer 3 — 429 recovery
- When a 429 arrives, that URL is **blocked for 15 seconds** (negative cache)
- After **any** 429, **all** requests pause for **30 seconds** (global cooldown)
- The 30-second pause lets the API server recover before we hammer it again

These settings are configured in `packages/core/src/constants/index.ts` under `REQUEST_CONFIG.RATE_LIMIT`.

---

## 4. How MapLibre Custom Layers Work

MapLibre GL JS renders a 3D globe using WebGL. Normally you'd add data layers using JSON style rules. But for complex GPU effects (particles, heatmaps), we use **`CustomLayerInterface`** — a way to plug raw WebGL code directly into MapLibre's render loop.

### The interface

Every custom WebGL layer implements these three methods:

```typescript
interface CustomLayerInterface {
  id: string;
  type: 'custom';
  renderingMode?: '2d' | '3d';

  // Called once when the layer is added to the map
  onAdd(map: Map, gl: WebGLRenderingContext): void;

  // Called before each frame — use for off-screen GPU work ONLY
  prerender?(gl: WebGLRenderingContext, args: CustomRenderMethodInput): void;

  // Called during each frame — draw to the screen here
  render(gl: WebGLRenderingContext, args: CustomRenderMethodInput): void;

  // Called when the layer is removed — clean up ALL GPU resources
  onRemove(map: Map, gl: WebGLRenderingContext): void;
}
```

### The critical split: prerender vs render

This is the most important rule in the whole codebase:

| Method | What it can do | What it must NEVER do |
|---|---|---|
| `prerender()` | Write to **off-screen FBOs** (GPU textures) | Touch the screen framebuffer |
| `render()` | Read from FBOs, draw to the **screen** | Write to off-screen FBOs |

Why? MapLibre owns the screen framebuffer. If you write to it in `prerender()`, you corrupt MapLibre's own rendering. If you write to off-screen FBOs in `render()`, you corrupt the FBO state for the next frame.

### How renderingMode: '3d' works

Setting `renderingMode: '3d'` opts the layer into MapLibre's globe depth pipeline. This means:
- Your layer gets a projection matrix that accounts for globe curvature
- Your layer participates in depth testing against map tiles
- Stars (at z=0.9999) correctly render *behind* tiles (at z < 0.9999)

---

## 5. GPGPU Particle System (Wind & Currents)

GPGPU stands for **General Purpose GPU** — we're using the graphics card to do physics calculations, not just drawing.

**File:** `packages/web/webgl/ParticleEngine.ts`

### The core idea: ping-pong textures

Instead of updating particle positions in JavaScript (slow), we store all particle positions in a GPU texture and run a physics shader to update them. This lets us simulate 262,144 particles at 60fps.

We use two textures that alternate roles each frame — this is called **ping-pong**:

```
Frame 1:  Texture A (positions) ──► physics shader ──► Texture B (new positions)
Frame 2:  Texture B (positions) ──► physics shader ──► Texture A (new positions)
Frame 3:  Texture A (positions) ──► physics shader ──► Texture B (new positions)
...
```

The texture currently being read is called `FBO[read]`. The one being written is `FBO[write]`. After each frame, they swap.

### Full render pipeline each frame

```
prerender():
  ┌─────────────────────────────────────────────────┐
  │  FBO[read] (particle positions)                 │
  │      │                                          │
  │      ▼                                          │
  │  physics shader (particle-update.frag.glsl)     │
  │      │  reads wind velocity texture             │
  │      │  moves each particle by wind speed       │
  │      │  randomly resets particles that drift    │
  │      ▼                                          │
  │  FBO[write] (new particle positions)            │
  │      swap read/write                            │
  └─────────────────────────────────────────────────┘

render():
  ┌─────────────────────────────────────────────────┐
  │  Step 1: Fade the trail                         │
  │    trailFBO[read] ──► fade shader ──► trailFBO[write]  │
  │    (multiplies every pixel by fadeOpacity=0.9965)│
  │                                                 │
  │  Step 2: Draw new particle dots onto the trail  │
  │    particle POINTS ──────────────────► trailFBO[write] │
  │    (tiny glowing dots at each particle position) │
  │                                                 │
  │  Step 3: Composite trail onto the map canvas    │
  │    trailFBO[write] ──────────────────► screen   │
  │    (blend: ONE, ONE_MINUS_SRC_ALPHA)            │
  └─────────────────────────────────────────────────┘
```

### Why fadeOpacity = 0.9965?

This is the "Windy.com sweet spot". At 0.9965, old particle trails fade slowly enough to create smooth flowing lines, but fast enough that they don't create ugly smears. Never set this below 0.97.

### Texture unit assignments (never change)

| Unit | Always contains |
|---|---|
| `TEXTURE0` | Trail FBO or particle state texture |
| `TEXTURE1` | Wind/current velocity data |
| `TEXTURE2` | Color ramp (256×1 pixel gradient) |

---

## 6. The Globe Void: Starfield & Sky Atmosphere

When the map is zoomed way out (zoom < ~3), the 3D globe shows the empty space around Earth. Without anything there, it looks like a black void.

### Starfield (`StarfieldLayer.ts`)

**File:** `packages/web/components/map/layers/StarfieldLayer.ts`

This layer fills the void with ~3000 stars. The key insight: instead of placing stars at real geographic locations (which would require updating them as the globe spins), we place them directly in **NDC clip space**.

NDC (Normalized Device Coordinates) is the coordinate system right before pixels — it goes from -1 to +1 in X and Y, with depth from 0 to 1. By placing stars at z=0.9999, they sit at the very far depth plane, so **every map tile renders on top of them automatically** — no depth fighting, no special blending needed.

```glsl
// In the vertex shader:
gl_Position = vec4(a_pos, 0.9999, 1.0);
// a_pos is just a random (x, y) in [-1, 1] NDC space
// No projection matrix needed — we're bypassing it intentionally
```

Stars are generated once at JavaScript module load time and uploaded to the GPU once in `onAdd()`. They never change. This makes the layer essentially zero CPU cost per frame.

The layer uses `renderingMode: '3d'` to participate in MapLibre's globe depth pipeline, which is what makes the z=0.9999 depth trick work.

### Atmospheric Glow (`map.setSky()`)

MapLibre GL JS provides a `setSky()` API that draws a gradient haze around the edge of the globe — like the atmospheric glow you see from the ISS. This is configured in `MapContainerML.tsx` and is a pure MapLibre feature (no custom WebGL needed).

---

## 7. Heatmap Layers

All scalar field visualizations (wave height, sea temperature, air temperature, precipitation, cloud cover, chop level, gust delta, dive suitability) use the same engine:

**File:** `packages/web/webgl/GenericHeatmapEngine.ts`

### How it works

1. The engine receives a 12×12 grid of float values (e.g. wave heights in metres)
2. Each grid value is looked up on a **color ramp** (a 256×1 gradient texture from `ColorRamps.ts`)
3. The result is drawn as a smooth interpolated texture covering the visible map area
4. The texture is rendered onto an **offscreen canvas** (managed by `OffscreenCanvasManager.ts`) to avoid blocking the main render pipeline

### Float32 vs Uint8 mode

On devices without the `OES_texture_float` WebGL extension (older phones), float textures aren't supported. The engine automatically falls back to **Uint8 mode**, which encodes each float value into a 4-channel RGBA byte. The math is done in `DataEncoder.ts` — never encode/decode manually.

---

## 8. Device Tiers & Particle Scaling

Running 262,144 particles on an old phone would freeze it. `DeviceCapabilities.ts` detects what kind of device you're on and scales down automatically:

| Device | Detection method | Particle grid | Particle count |
|---|---|---|---|
| Desktop / Laptop | Not mobile, not low-end | 512 × 512 | 262,144 |
| Mobile / Tablet | user-agent + touch points + screen width ≤ 768px | 256 × 256 | 65,536 |
| Low-end | ≤ 2 CPU cores OR ≤ 2 GB RAM | 128 × 128 | 16,384 |

**Important:** We do NOT use `devicePixelRatio` to detect mobile. A standard 1080p desktop monitor has DPR = 1.0, the same as an old phone — using it would wrongly classify desktop users as mobile-tier.

---

## 9. WebGL Safety: The Nuclear Reset Pattern

MapLibre renders its own tiles and labels using WebGL. Our custom layers run in the same WebGL context. This creates a problem: if our code leaves WebGL state dirty (wrong texture bound, wrong blend mode, vertex attributes enabled), MapLibre's next draw call can read our state by accident and produce visual corruption.

The classic symptom is **"colored cubicles"** — a grid of color patches overlaid on the map tiles. This happens when our wind velocity texture is accidentally read by MapLibre's tile shader.

### The fix: `resetAllGLState()` + `disableAllAttribs()`

Before every draw pass, we call `resetAllGLState()`:

```typescript
function resetAllGLState() {
  // Unbind all textures we used
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, null);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, null);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, null);
  // Disable every vertex attribute array
  for (let i = 0; i < maxAttribs; i++) gl.disableVertexAttribArray(i);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
}
```

And we call `disableAllAttribs()` both **before AND after** every single `gl.drawArrays()` call.

For full state save/restore (program, framebuffer, blend mode, depth, stencil, viewport), use `saveGLState()` / `restoreGLState()` from `GLUtils.ts`.

---

## 10. Key Files Reference

### Web package — entry points

| File | What it does |
|---|---|
| `packages/web/components/map/MapContainerML.tsx` | The main 1970-line map component. Owns the MapLibre instance, all layers, and all layer toggle state. |
| `packages/web/components/map/MapProvider.tsx` | React context that shares the MapLibre map instance across components via `useMapContext()` |

### Core package — data layer

| File | What it does |
|---|---|
| `packages/core/src/utils/requestDeduplication.ts` | Deduplication + throttle queue + 429 protection |
| `packages/core/src/services/marineGridService.ts` | 12×12 grid fetch with 5-min TTL cache |
| `packages/core/src/constants/index.ts` | `REQUEST_CONFIG.RATE_LIMIT` — all throttle/cooldown settings |

### WebGL engines

| File | What it does |
|---|---|
| `packages/web/webgl/ParticleEngine.ts` | GPGPU ping-pong particle physics |
| `packages/web/webgl/GenericHeatmapEngine.ts` | All scalar heatmap rendering |
| `packages/web/webgl/GLUtils.ts` | `saveGLState` / `restoreGLState` |
| `packages/web/webgl/DataEncoder.ts` | Float32 ↔ Uint8 encoding — always use this, never hand-roll |
| `packages/web/webgl/DeviceCapabilities.ts` | `isMobileDevice()` / `isLowEndDevice()` |

### Graphify graph

The architecture graph lives at `packages/web/graphify-out/`. To update it after code changes:

```bash
# From the project root (seame (2)/)
python3 -m graphify update packages/web/
# Zero LLM tokens — pure AST extraction
# Output: packages/web/graphify-out/graph.json + GRAPH_REPORT.md + graph.html
```

Open `packages/web/graphify-out/graph.html` in a browser for the interactive community graph. The `GRAPH_REPORT.md` lists all major clusters (communities) and god nodes (highest-connected symbols).
