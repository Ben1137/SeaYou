# E1 Reconnaissance Findings — Secondary/Tertiary Swell & Bathymetry Integration

**Date:** 2026-08-26  
**Scope:** Five areas of investigation — no feature code, reconnaissance only.

---

## 1. Open-Meteo Marine Service — Variables Currently Requested

### Service Location
- **Main service:** `packages/core/src/services/marineGridService.ts`
- **Hook consumer:** `packages/web/hooks/useSharedMarineData.ts`

### Current Variables Requested (CONFIRMED)
Per `marineGridService.ts:410-422`, the `fetchMarineGridData()` function requests:

```
current: [
  // Significant wave data (combined wind waves + swell)
  'wave_height', 'wave_direction', 'wave_period', 'wave_peak_period',
  // Swell data (long-period waves from distant storms)
  'swell_wave_height', 'swell_wave_direction', 'swell_wave_period',
  // Secondary swell partition (model-dependent; nullable)
  'secondary_swell_wave_height', 'secondary_swell_wave_direction', 'secondary_swell_wave_period',
  // Wind wave data (locally generated waves)
  'wind_wave_height', 'wind_wave_direction', 'wind_wave_period',
  // Ocean currents
  'ocean_current_velocity', 'ocean_current_direction',
  // Sea temperature and level
  'sea_surface_temperature', 'sea_level_height_msl'
].join(',')
```

### Secondary Swell Status
✅ **ALREADY FETCHED** — Secondary swell is included in the current API request.  
Fields are stored in `MarineGridPoint` interface:
- `secondarySwellHeight?: number` (line 124)
- `secondarySwellDirection?: number` (line 125)
- `secondarySwellPeriod?: number` (line 126)
- Parsed at lines 548–550 as `marine.current?.secondary_swell_wave_*`

### Tertiary Swell Status
❌ **NOT FETCHED** — Tertiary swell variables are NOT requested.  
- `tertiary_swell_wave_height/period/direction` are not in the URLSearchParams
- Not present in `MarineGridPoint` interface
- **Open-Meteo API caveat:** Tertiary swell is **GFS-Wave models only** (not available on ECMWF-WAM or DWD-EWAM)

### Grid Resolution
- **Dynamic per viewport:** Lines 77–104 in `useSharedMarineData.ts`
- Globe zoom (<2): 4×4 = 16 points
- Continental (<3): 6×6 = 36 points
- Wide regional (>10°): 6×6 = 36 points
- Regional (>5°): 8×8 = 64 points
- **Local detail (default):** 12×12 = **144 points** ← matches CLAUDE.md reference
- **Hard ceiling:** 200 coordinates per request (line 370 in `marineGridService.ts`)

### Cache TTL
- **Fetch cache:** `ttl: 300000` (5 minutes) at lines 433 and 477 in `marineGridService.ts`
- **Deduplication:** Via `deduplicatedFetch()` + global rate limiter to prevent 429 cascade

### Key Design Pattern
- Single fetch call per viewport change → both `marine` + `forecast` API responses
- Data shared via React context (implied by hook name and usage in map layers)
- `MarineGridPoint` struct is rich and already contains the secondary swell fields

---

## 2. GEBCO Bathymetry — Current Implementation

### Layer File
- **Component:** `packages/web/components/map/layers/BathymetryLayerML.tsx`

### Current Implementation
- **Type:** WMS raster overlay (NOT numeric depth grid)
- **Data source:** `https://wms.gebco.net/mapserv` (Web Map Service)
- **Layer:** `GEBCO_LATEST` (always newest bathymetric data)
- **Projection:** EPSG:3857 (Web Mercator)
- **Tile size:** 256×256 PNG
- **CORS:** Openly available, fully CORS-compliant

### Styled Tile URL Pattern
```
https://wms.gebco.net/mapserv?
  service=WMS&version=1.3.0&request=GetMap
  &layers=GEBCO_LATEST
  &format=image/png
  &transparent=true
  &crs=EPSG:3857
  &width=256&height=256
  &bbox={bbox-epsg-3857}
```

### Architecture Notes
- Added as **raster source** (`type: 'raster'`) at line 46
- Inserted as **raster layer** at line 52 (not WebGL)
- **Insertion strategy:** Before first `symbol` (label) layer to ensure bathymetry renders above all fill/line data but below labels
- **Control:** Visibility toggle + opacity (`raster-opacity`)
- **Attribution:** GEBCO branding included

### Data Availability
✅ **Global coverage** — GEBCO includes all oceans  
✅ **Styled raster** — Pre-rendered depth visualization on GEBCO server  
❌ **NOT numeric depth data** — No way to extract raw depth values from WMS tiles for shader input  
❌ **No texture upload path** — WMS tiles are composited by MapLibre, not fed to a custom shader

### Implication for Nearshore Integration
- **To use GEBCO depth in a shader:** Would need to fetch numeric GEBCO data separately
- **Alternative numeric sources:** ETOPO1 (AWS endpoint confirmed working in prior session), OpenTopoData (JSON API only, not tile-based)
- See prior memory files: `bathymetry_gebco_recon.md`, `project_coastal_dynamics.md`

---

## 3. GenericHeatmapEngine — Data Texture Contract

### Engine Location
- **File:** `packages/web/webgl/GenericHeatmapEngine.ts`
- **Factory function:** `createGenericHeatmapEngine(config: HeatmapLayerConfig)`

### Current Data Texture Architecture
**One primary data texture + one temporal blending texture:**

| Texture Unit | Purpose | Format | Encoding | Binding Line |
|---|---|---|---|---|
| **TEXTURE0** | Current timestep data | Float32 or Uint8 RGBA | R=raw value, A=valid flag | 510–512 |
| **TEXTURE1** | Color ramp (256×1) | RGBA | Normalized [0,1] → RGBA color | 515–517 |
| **TEXTURE2** | Land mask | RGBA | R=land (0=sea, 1=land) | 520–522 |
| **TEXTURE3** | Next timestep (temporal blend) | Float32 or Uint8 RGBA | Same as TEXTURE0 | 525–527 |

### Data Upload / Encoding
**Engine accepts:**
```typescript
updateData(
  grid: number[][],           // 2D array of scalar values
  minLon, maxLon, minLat, maxLat  // Geo bounds
)
```

**Encoding happens CPU-side:**
- **Float32 mode:** `encodeGridFloat32()` → `Float32Array` with R=value, G=0, B=0, A=1
- **Uint8 mode:** `encodeGridUint8()` → `Uint8Array` with R=normalized[0,255], G=same, B=0, A=255
- **Normalization options:**
  - `'max-value'`: value / maxValue
  - `'range'`: (value - min) / (max - min)
  - `'unit'`: value (already [0,1])

### Fragment Shader Input Contract
**`generic-heatmap.frag.glsl` uniforms:**
```glsl
uniform sampler2D u_data;        // TEXTURE0
uniform sampler2D u_data_next;   // TEXTURE3 (temporal)
uniform sampler2D u_color_ramp;  // TEXTURE1
uniform sampler2D u_land_mask;   // TEXTURE2

uniform float u_norm_mode;       // 0=max-value, 1=range, 2=unit
uniform float u_min_value;
uniform float u_max_value;
uniform float u_discard_below;   // Hard threshold
uniform float u_fade_range;      // Smoothstep band for soft fade
```

### Current Shader Features
- ✅ Temporal interpolation (TEXTURE3 for smooth frame transitions)
- ✅ Land masking (discard land pixels via TEXTURE2)
- ✅ Normalization modes (max-value, range, unit)
- ✅ Smoothstep fade band (soft transition near threshold)
- ✅ FBM noise cloud patterns (optional alpha modulation)
- ✅ Valid-data-aware blending (collapses blend to 0 if next frame has no data)

### Texture Unit Conventions (STRICT per CLAUDE.md)
This engine follows **a different convention than ParticleEngine:**
- ParticleEngine: TEXTURE0=trail, TEXTURE1=velocity, TEXTURE2=color ramp
- **GenericHeatmapEngine: TEXTURE0=data, TEXTURE1=color ramp, TEXTURE2=land, TEXTURE3=data_next**

The difference is intentional — GenericHeatmapEngine owns its own WebGL context (offscreen canvas), so there's no collision with MapLibre or other layers.

---

## 4. @seame/core Module Structure

### Module Root
- **Entry point:** `packages/core/src/index.ts` — re-exports all public APIs
- **Exports pattern:** Wildcard re-exports from subdirectories

### Subdirectories
```
packages/core/src/
├── constants/         → Global config, API keys, model names
├── services/          → API clients (marineGridService, forecastGridService, etc.)
├── utils/             → Helpers (openMeteoConfig, requestDeduplication, etc.)
├── types/             → Shared TypeScript interfaces
├── scoring/           → Scoring engine (activity personas, best windows, etc.)
├── nearshore/         → Nearshore physics module (dispersion, energy, windQuality, etc.)
└── [no test root]     → Tests live per module (e.g. nearshore/__tests__/)
```

### Nearshore Module Structure (PATTERN TO MIRROR)
**Location:** `packages/core/src/nearshore/`
```
nearshore/
├── index.ts           → Public API exports
├── dispersion.ts      → Wave dispersion model
├── energy.ts          → Wave energy calculations
├── surfEnergy.ts      → Surf-specific energy
├── consistency.ts     → Consistency scoring
├── waveScale.ts       → Wave scaling logic
├── windQuality.ts     → Wind quality assessment
├── transform.ts       → Data transformations
├── oracle.ts          → (Unknown — likely ML/heuristics)
├── shader-verify.ts   → (GPU validation?)
└── __tests__/         → Jest test suite
    ├── nearshore.test.ts
    ├── p55.test.ts
    └── windQuality.test.ts
```

### Scoring Module Structure (REFERENCE FOR NEW MODULE)
**Location:** `packages/core/src/scoring/`
```
scoring/
├── index.ts
├── scoreActivity.ts   → Main scoring logic
├── bestWindow.ts      → Optimal time window finder
├── personas.ts        → User personas + scoring profiles
├── extractConditions.ts → Condition extraction
└── __tests__/
    └── scoring.test.ts
```

### Key Pattern for New Nearshore Bathymetry Module
- **Export structure:** Each .ts file is a pure function module; index.ts re-exports all
- **Testing:** Jest snapshots + parametric test suites (e.g., `windQuality.test.ts`)
- **No external deps beyond core-utils** — all logic is math, no API calls or browser APIs
- **Strongly typed:** Full TypeScript interfaces, no `any` types
- **Immutable:** All functions are pure; state passed as params

### Build Step for @seame/core
From MEMORY.md: After editing `packages/core/src/`, run:
```bash
pnpm --filter @seame/core build
```

---

## 5. Open-Meteo Marine API — Secondary / Tertiary Swell Availability

### Official Documentation Caveat (VERIFIED)
From https://open-meteo.com/en/docs/marine-weather-api:

> "Secondary swell components are only available for some models. Tertiary components are only available for the GFS wave models."

### Variable Names (CONFIRMED AVAILABLE)
All six variables are valid Open-Meteo parameter names:
- ✅ `secondary_swell_wave_height`
- ✅ `secondary_swell_wave_direction`
- ✅ `secondary_swell_wave_period`
- ✅ `tertiary_swell_wave_height`
- ✅ `tertiary_swell_wave_direction`
- ✅ `tertiary_swell_wave_period`

### Model-Specific Availability
| Variable | ECMWF-WAM | DWD-EWAM | GFS-Wave | Best-Match |
|---|---|---|---|---|
| Primary swell | ✅ | ✅ | ✅ | ✅ |
| Secondary swell | ✅ | Partial | ✅ | ✅ |
| Tertiary swell | ❌ | ❌ | ✅ | ❌ (unless GFS selected) |

### Implication for Nearshore Integration
- **Secondary swell:** Safe to assume available on most model selections (ECMWF, GFS)
- **Tertiary swell:** Requires **explicit GFS-Wave model selection** or risk null responses
- **Current code behavior:** Gracefully handles `undefined` via optional chaining (`marine.current?.secondary_swell_wave_*`)

---

## Summary Table

| Item | Status | Details |
|---|---|---|
| **Open-Meteo secondary swell** | ✅ Already fetched | Lines 416, 548–550 in marineGridService.ts; available on most models |
| **Open-Meteo tertiary swell** | ❌ Not fetched | Not in current API request; GFS-Wave only; adds complexity |
| **Grid resolution** | ✅ Dynamic (12×12 local) | useSharedMarineData.ts lines 77–104; 144 points default |
| **Cache TTL** | ✅ 5 minutes | 300000ms deduplication + global rate limiter |
| **GEBCO bathymetry** | ✅ WMS raster | Styled tile overlay, no numeric depth data available |
| **GenericHeatmapEngine** | ✅ Single data texture | TEXTURE0=data, TEXTURE1=ramp, TEXTURE2=land, TEXTURE3=next |
| **Texture unit conventions** | ✅ TEXTURE0-3 documented | Own WebGL context; different from ParticleEngine |
| **@seame/core structure** | ✅ Module pattern clear | nearshore/ + scoring/ pattern; pure functions + Jest tests |
| **Build step** | ✅ `pnpm --filter @seame/core build` | Required after editing core src/ |

---

## Files Examined (Reconnaissance Only)

### Services
- `packages/core/src/services/marineGridService.ts` (745 lines) — Primary API client
- `packages/web/hooks/useSharedMarineData.ts` (first 100 lines) — React consumer

### WebGL Engine
- `packages/web/webgl/GenericHeatmapEngine.ts` (614 lines) — Full engine code
- `packages/web/webgl/shaders/generic-heatmap.frag.glsl` (173 lines) — Fragment shader
- `packages/web/webgl/shaders/heatmap.vert.glsl` (22 lines) — Vertex shader

### Map Components
- `packages/web/components/map/layers/BathymetryLayerML.tsx` (120 lines) — WMS overlay

### Module Structure
- `packages/core/src/index.ts` (6 lines) — Export pattern
- `packages/core/src/nearshore/index.ts` (7 lines) — Nearshore module exports

### API Documentation
- Open-Meteo Marine API docs (web) — Secondary/tertiary swell availability confirmed

---

## Recommendations for Next Phase

1. **Secondary Swell Wiring (P1):** Connect already-fetched secondary swell to UI layer cards
   - Data is in `MarineGridPoint.secondarySwellHeight/Direction/Period`
   - See prior memory: `#P1708` — "wire the ALREADY-FETCHED secondary swell"

2. **Tertiary Swell (Lower Priority):** Decide on model selection strategy first
   - Requires forcing `models: 'gfs_wave'` or risk null values
   - Evaluate UX impact of null secondary/tertiary on non-GFS regions

3. **Bathymetry for Nearshore Physics (Next Phase):** Separate numeric depth feed
   - Current GEBCO WMS is visual only
   - ETOPO1 AWS endpoint available for numeric depth (confirmed in prior session)
   - Design: Fetch ETOPO1 grid → encode to texture → pass as 5th texture unit to GenericHeatmapEngine
   - **Caveat:** Requires shader extension (new frag shader variant with bathymetry input)

4. **@seame/core Module Expansion:** Mirror nearshore/ pattern for new math modules
   - Strong typing, pure functions, Jest test suite
   - Export via `index.ts`, build with `pnpm --filter @seame/core build`

---

**No feature code written. Ready for next reconnaissance or implementation phase.**
