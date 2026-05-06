# SeaYou — CLAUDE.md

Project context, architecture decisions, and constraints for AI assistants working on this codebase.

---

## 1. Two-Codebase Situation — CRITICAL

This repository contains **two distinct codebases** that must never be confused:

| Location | Branch | Tech Stack | Status |
|---|---|---|---|
| `packages/web/` (project root) | `main` (local only) | **MapLibre GL JS 5.0 + GPGPU WebGL** | Active development |
| `.claude/worktrees/infallible-sammet/` | `infallible-sammet` | **Leaflet + leaflet-velocity** | Mirrors GitHub — DO NOT touch |

- The **GitHub repo** (`https://github.com/Ben1137/SeaYou.git`) matches the **worktree** (Leaflet). It is stale.
- All active work happens in **the project root** (`seame (2)/packages/web/`).
- When using Glob/Grep tools, **always exclude** `.claude/worktrees/` from searches, otherwise results will mislead.

---

## 2. Monorepo Structure

```
seame (2)/
├── packages/
│   ├── web/          # @seame/web  — Vite + React 19 + MapLibre (PRIMARY)
│   ├── mobile/       # @seame/mobile — Expo React Native
│   ├── watch/        # @seame/watch  — Expo (Apple Watch / WearOS)
│   └── core/         # @seame/core   — Shared types and utilities
├── .claude/
│   ├── skills/       # Custom skill knowledge bases
│   └── worktrees/
│       └── infallible-sammet/   # OLD Leaflet branch — mirrors GitHub
├── package.json      # pnpm@9 workspaces, turbo
└── CLAUDE.md         # This file
```

**Dev commands:**
```bash
pnpm dev               # Start all packages via Turborepo
pnpm --filter @seame/web dev   # Start only the web Vite dev server
```

The web package deploys to GitHub Pages: `https://Ben1137.github.io/SeaYou`

---

## 3. Web Package Stack

| Technology | Version | Role |
|---|---|---|
| React | 19.2 | UI framework |
| MapLibre GL JS | 5.0.0 | Map rendering |
| Vite | 6.2 | Build tool |
| TailwindCSS | 4.1 | Styling |
| TanStack Query | 5.x | Data fetching / caching |
| Open-Meteo API | — | Weather data (wind, waves, temperature) |
| i18next | 25.x | Internationalization |

---

## 4. WebGL / GPGPU Architecture

All WebGL code lives in `packages/web/webgl/`.

### Engines

| File | Purpose |
|---|---|
| `ParticleEngine.ts` | GPGPU particle system (wind + ocean currents) |
| `WaveHeatmapEngine.ts` | Wave height heatmap rendering |
| `SeaTemperatureEngine.ts` | Sea surface temperature rendering |
| `CanvasVectorLayer.ts` | Canvas 2D fallback for vectors |
| `GLUtils.ts` | WebGL utilities: shader compilation, FBO, save/restore state |
| `DataEncoder.ts` | Float32 ↔ Uint8 R8G8B8A8 encoding |
| `ColorRamps.ts` | Color stop definitions (WIND_COLORS, WAVE_COLORS, etc.) |
| `DeviceCapabilities.ts` | Mobile/low-end device detection |
| `LandMask.ts` | Ocean mask for particle containment |

### Shaders (`packages/web/webgl/shaders/`)

| File | Role |
|---|---|
| `quad.vert.glsl` | Fullscreen quad vertex shader (shared) |
| `fade.vert.glsl` | Trail fade vertex shader |
| `fade.frag.glsl` | Trail fade — outputs **premultiplied alpha** |
| `particle-update.frag.glsl` | GPGPU position update (Float32 mode) |
| `particle-update-uint8.frag.glsl` | GPGPU position update (Uint8 mode) |
| `particle-draw.vert.glsl` | Particle draw vertex (Float32 mode) |
| `particle-draw-uint8.vert.glsl` | Particle draw vertex (Uint8 mode) |
| `particle-draw.frag.glsl` | Particle draw fragment — glow + age fade |
| `heatmap.vert.glsl` | Wave heatmap vertex |
| `heatmap.frag.glsl` | Wave heatmap fragment (Float32) |
| `heatmap-uint8.frag.glsl` | Wave heatmap fragment (Uint8) |
| `temperature.frag.glsl` | Sea temp fragment (Float32) |
| `temperature-uint8.frag.glsl` | Sea temp fragment (Uint8) |

### MapLibre Layer Components (`packages/web/components/map/layers/`)

| File | Engine used |
|---|---|
| `WindParticleLayerML.tsx` | `ParticleEngine` |
| `CurrentParticleLayerML.tsx` | `ParticleEngine` |
| `WaveHeatmapLayerML.tsx` | `WaveHeatmapEngine` |
| `SeaTemperatureLayerML.tsx` | `SeaTemperatureEngine` |
| `PortsLayerML.tsx` | MapLibre native layers |
| `ReefLayerML.tsx` | MapLibre native layers |
| `BathymetryLayerML.tsx` | MapLibre native layers |
| `RainRadarLayerML.tsx` | External tile overlay |

---

## 5. ParticleEngine — Render Pipeline

`ParticleEngine` implements `maplibregl.CustomLayerInterface`.

### Lifecycle

- **`prerender()`** — GPGPU pass only. Reads current particle positions (ping), runs physics shader, writes new positions (pong). **Never touches the screen framebuffer.**
- **`render()`** — Screen composite only. Draws trail FBO to canvas. **Never writes to off-screen FBOs.**

### Ping-Pong FBO State Machine

```
Frame N:
  prerender():  particlesFBO[read] → physics shader → particlesFBO[write]
                swap read/write indices

  render():
    Step 1: trailFBO[read] → fade shader → trailFBO[write]   (fade old trail)
    Step 2: particle POINTS → trailFBO[write]                 (add new dots)
    Step 3: trailFBO[write] → MapLibre canvas (composite)     (show on map)
                swap read/write indices
```

### Texture Unit Conventions (STRICT — never change)

| Unit | Content |
|---|---|
| `TEXTURE0` | Trail FBO texture / particle state texture |
| `TEXTURE1` | Wind/current velocity texture |
| `TEXTURE2` | Color ramp texture (256×1 px) |

### Blend Mode Rules

| Pass | Blend | Reason |
|---|---|---|
| Step 1 (fade quad to trail FBO) | `NONE` (`gl.disable(BLEND)`) | Opaque overwrite |
| Step 2 (particles to trail FBO) | `SRC_ALPHA, ONE_MINUS_SRC_ALPHA` | Feather particle edges |
| Step 3 (trail to MapLibre canvas) | `ONE, ONE_MINUS_SRC_ALPHA` | Premultiplied composite |

### Nuclear State Reset Pattern

A `resetAllGLState()` helper **must be called before every draw pass** to prevent vertex attribute and texture state from leaking into MapLibre's own rendering:

```typescript
function resetAllGLState() {
  // Disable every vertex attrib array
  for (let i = 0; i < maxAttribs; i++) gl.disableVertexAttribArray(i);
  // Unbind all texture units we use
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, null);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, null);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
}
```

Additionally, `disableAllAttribs()` is called **before AND after every single `gl.drawArrays()` call**.

### Key Defaults

```typescript
fadeOpacity: 0.9965  // Windy sweet-spot — do NOT lower below 0.97
pointSize:   2.8     // Base size (overridden per-shader by speed ramp)
speedFactor: 1.5
dropRate:    0.002
dropRateBump: 0.008
```

---

## 6. Fallback Mode Hierarchy

```
OES_texture_float available?
  YES → Float32 mode (full precision, RGBA float textures)
  NO  → Uint8 mode (16-bit R8G8B8A8 encoding, universal WebGL 1 support)
         Still broken? → Canvas2D fallback (CanvasVectorLayer)
```

**Uint8 encoding rules:**
- Divisor is `255` (not `256`) on BOTH the JS encoder and GLSL decoder side
- Formula: `encoded = (value + offset) / scale * 255`
- Use `DataEncoder.ts` — never hand-roll the encoding

---

## 7. Device Capability Tiers

`DeviceCapabilities.ts` provides:

```typescript
isMobileDevice()  // user-agent regex + maxTouchPoints > 0 + innerWidth <= 768
isLowEndDevice()  // hardwareConcurrency <= 2 OR deviceMemory <= 2
```

Particle resolution defaults (from `getDefaultParticleRes()` in `ParticleEngine.ts`):

| Device | `particleRes` | Particle count |
|---|---|---|
| Low-end (≤ 2 cores / ≤ 2 GB RAM) | 128 | 16,384 |
| Mobile (phone / small tablet) | 256 | 65,536 |
| Desktop / laptop | **512** | **262,144** |

**Do NOT use `devicePixelRatio` to detect mobile** — it incorrectly classifies standard 1080p desktops (DPR = 1.0) as mobile-tier.

---

## 8. Common Bug Patterns

### "Colored cubicles" overlay on map tiles
- **Cause:** `windTexture` left bound on `TEXTURE1` after particle draw; MapLibre's own tile shader samples it accidentally
- **Fix:** Explicit `null` bind on TEXTURE1 and TEXTURE2 before the composite pass (Step 3); `resetAllGLState()` after every draw

### Invisible particles
- **Cause 1:** `gl_PointSize` set to `<= 0` — always use `mix(1.0, 3.0, v_speed_norm)` minimum
- **Cause 2:** Depth test enabled — always `gl.disable(gl.DEPTH_TEST)` at the top of `render()`
- **Cause 3:** Wrong blend mode in composite pass — use `ONE, ONE_MINUS_SRC_ALPHA` not `SRC_ALPHA`

### Particles rendering behind map tiles
- **Cause:** `gl.DEPTH_TEST` enabled during render — disable it

### Trail looks wrong / not Windy-style
- **Cause:** `gl.clear()` called inside the trail loop — **never call `gl.clear()` in the trail render path**
- **Cause:** `fadeOpacity` too low (e.g. `0.95`) — set to `0.9965`
- **Cause:** Wrong blend in Step 3 — must be `ONE, ONE_MINUS_SRC_ALPHA` (premultiplied)

### Vertex attrib state leaks (MapLibre breaks after layer)
- **Fix:** `disableAllAttribs()` before AND after every `gl.drawArrays()`

### Stale closure React issue (Leaflet worktree only)
- The old Leaflet code in `infallible-sammet` worktree had stale refs in `VelocityLayerV2.tsx`
- This is FIXED in the worktree and does NOT apply to the MapLibre version

---

## 9. WebGL State Save / Restore

`GLUtils.ts` provides `saveGLState()` and `restoreGLState()` for wrapping all custom rendering:

```typescript
const saved = saveGLState(gl);
// ... all custom drawing ...
restoreGLState(gl, saved);
```

State saved: program, texture0/1/2 bindings, framebuffer, array+element buffers, blend state, depth, stencil, cull, viewport, all vertex attrib enabled flags.

---

## 10. MapLibre Lifecycle Rules

- `prerender()` **only** writes to off-screen FBOs
- `render()` **only** composites to screen (reads from FBOs, writes to canvas)
- `onRemove()` must destroy ALL WebGL resources (textures, FBOs, programs, buffers)
- React `useEffect` cleanup: set `isAlive = false` and `mapRef.current = null` before removing the layer

---

## 11. Network / API Rules

- All map-movement API fetches (viewport change → Open-Meteo request) **must be debounced 300–500 ms**
- Every fetch must use an `AbortController` — abort the previous request when a new one starts
- Open-Meteo free tier has rate limits; never fire bare `fetch()` on every `moveend` event

---

## 12. Skill: webgl-maplibre-architect

A custom knowledge base is available for this project:

```bash
# Always run before implementing or debugging WebGL features
python3 .claude/skills/webgl-maplibre-architect/scripts/search.py "<keywords>" --diagnose    # visual artifacts
python3 .claude/skills/webgl-maplibre-architect/scripts/search.py "<keywords>" --domain patterns
python3 .claude/skills/webgl-maplibre-architect/scripts/search.py "<keywords>" --domain rules
python3 .claude/skills/webgl-maplibre-architect/scripts/search.py "<keywords>" --domain shaders
```

Reference files:
- `.claude/skills/webgl-maplibre-architect/references/architecture.md` — FBO setup, React lifecycle
- `.claude/skills/webgl-maplibre-architect/references/bug-patterns.md` — Extended bug analysis

---

## 13. Recent Changes (February 2026)

### Particle count fix
- **Problem:** `getDefaultParticleRes()` used `devicePixelRatio >= 1.5` — excluded standard 1080p desktops
- **Fix:** Now uses `isMobileDevice()` / `isLowEndDevice()` from `DeviceCapabilities.ts`

### WebGL state leak / colored cubicles fix
- Added `resetAllGLState()` helper — called before every draw pass
- Added `disableAllAttribs()` — called before AND after every `gl.drawArrays()`
- Changed particle draw (Step 2) blend: `ONE` → `SRC_ALPHA, ONE_MINUS_SRC_ALPHA`
- Added explicit texture isolation before composite (Step 3): null TEXTURE1, null TEXTURE2
- `fade.frag.glsl`: explicit premultiplied form `vec4(color.rgb * u_fade_opacity, color.a * u_fade_opacity)`
- `particle-draw-uint8.vert.glsl`: simplified point size to `mix(1.0, 3.0, v_speed_norm)`

### Worktree state
- `infallible-sammet` branch (`packages/web/` in worktree) reverted to GitHub HEAD `48e4fa0`
- Working tree is clean — no uncommitted changes in the worktree

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
