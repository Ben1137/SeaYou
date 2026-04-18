/**
 * generic-heatmap.frag.glsl - Universal heatmap fragment shader (Float32 mode)
 *
 * Supports 3 normalization modes via u_norm_mode:
 *   0 = max-value:  data in [0, maxValue], normalized = value / maxValue
 *   1 = range:      data in [minValue, maxValue], normalized = (value - min) / (max - min)
 *   2 = unit:       data already in [0, 1], no transformation needed
 *
 * u_fade_range controls the smoothstep fade band (in raw value units):
 *   > 0.0 → apply smoothstep(discardBelow, discardBelow + fadeRange, rawValue)
 *   = 0.0 → no smoothstep (hard cutoff from discard only)
 *
 * v_texcoord is now in data-texture UV space [0,1] directly (not viewport space).
 * The vertex shader (heatmap.vert.glsl) positions a Mercator geo-quad whose corners
 * are the data bbox corners, so v_texcoord.xy maps exactly onto the data grid.
 * This replaces the old view_bbox + data_bbox linear unprojection that broke at
 * any significant lat/lon span due to Web Mercator's non-linear latitude mapping.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Temporal Interpolation — 60 FPS Fluid Data Transitions
 * ─────────────────────────────────────────────────────────────────────────────
 * Open-Meteo delivers hourly forecast snapshots. u_data holds the current
 * timestep; u_data_next holds the next. u_time_blend (0→1) drives the
 * smooth transition between them so heatmap data never "jumps".
 *
 * The blend is valid-data-aware: if the next frame has no data at a UV
 * (alpha = 0, e.g. land points or not yet uploaded), the blend factor is
 * clamped to 0 so only the current frame contributes at that pixel.
 *
 * Engine side (GenericHeatmapEngine.ts):
 *   - u_data_next is bound to TEXTURE3 (TEXTURE1 is occupied by u_color_ramp)
 *   - A 1×1 transparent dummy is bound when next data is not yet available
 *   - setBlend(0..1) updates u_time_blend and triggers a repaint
 *   - updateNextData() uploads the next timestep grid
 * ─────────────────────────────────────────────────────────────────────────────
 */
// Mobile GPUs (iOS WebKit) may not support highp in fragment shaders.
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D u_data;       // Current timestep (R = raw value, A = valid flag)
uniform sampler2D u_data_next;  // Next timestep for temporal blend (TEXTURE3)
uniform sampler2D u_color_ramp; // Color ramp texture (256x1, TEXTURE1)
uniform sampler2D u_land_mask;  // Land/sea mask texture (0 = sea, 1 = land, TEXTURE2)

uniform float u_opacity;        // Overall layer opacity
uniform float u_use_land_mask;  // 1.0 to use land mask, 0.0 to skip
uniform float u_time_blend;     // Temporal blend factor: 0.0 = current only, 1.0 = next only

// Normalization parameters
uniform float u_norm_mode;      // 0 = max-value, 1 = range, 2 = unit
uniform float u_min_value;      // For range mode: lower bound
uniform float u_max_value;      // For max-value and range modes: upper bound
uniform float u_discard_below;  // Minimum raw value threshold (skip near-zero)
uniform float u_fade_range;     // Smoothstep band width in raw value units (0 = disabled)
uniform float u_cloud_pattern;  // 1.0 = apply FBM noise for cloud-like alpha modulation

varying vec2 v_texcoord;

// ── Procedural FBM noise for cloud texturing ──────────────────────────────
// Standard 2D hash → value noise → FBM with 4 octaves.
// Used only when u_cloud_pattern > 0.5 to break up flat color into cloud shapes.

float hash2D(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise2D(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  // Cubic Hermite smooth interpolation
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash2D(i + vec2(0.0, 0.0)), hash2D(i + vec2(1.0, 0.0)), u.x),
    mix(hash2D(i + vec2(0.0, 1.0)), hash2D(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise2D(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}
// ──────────────────────────────────────────────────────────────────────────

void main() {
  // v_texcoord is in data-texture UV space [0,1] — the geo quad vertex shader
  // positions the quad so UV maps directly onto the data grid with no additional
  // unprojection needed. U=0 → minLon, U=1 → maxLon, V=0 → minLat, V=1 → maxLat.
  vec2 data_uv = v_texcoord;

  // Temporal interpolation: blend current and next timestep textures.
  // effective_blend collapses to 0 wherever the next frame has no valid data
  // (alpha = 0 from the dummy 1×1 texture or from land/no-data pixels).
  vec4 sample_curr = texture2D(u_data,      data_uv);
  vec4 sample_next = texture2D(u_data_next, data_uv);
  float effective_blend = u_time_blend * step(0.1, sample_next.a);
  vec4 sample_val = mix(sample_curr, sample_next, effective_blend);

  // LOWER THRESHOLD: Allow data to reach the coast via bilinear interpolation.
  // The native vector land mask (LandMaskLayerML) handles coastline clipping.
  if (sample_val.a < 0.1) {
    discard;
  }

  // Sample land mask — same UV space as data texture (both rasterized at data bbox).
  if (u_use_land_mask > 0.5) {
    float land = texture2D(u_land_mask, data_uv).r;
    if (land > 0.5) {
      discard;
    }
  }

  float raw_value = sample_val.r;
  float normalized;

  if (u_norm_mode < 0.5) {
    // Mode 0: max-value — data in [0, maxValue]
    normalized = clamp(raw_value / u_max_value, 0.0, 1.0);
    // Discard below threshold (e.g. near-zero wave heights)
    if (raw_value < u_discard_below) {
      discard;
    }
  } else if (u_norm_mode < 1.5) {
    // Mode 1: range — data in [minValue, maxValue]
    normalized = clamp((raw_value - u_min_value) / (u_max_value - u_min_value), 0.0, 1.0);
  } else {
    // Mode 2: unit — data already 0-1 (e.g. cloud cover percentage / 100)
    normalized = clamp(raw_value, 0.0, 1.0);
    if (raw_value < u_discard_below) {
      discard;
    }
  }

  // Look up color from ramp
  vec4 color = texture2D(u_color_ramp, vec2(normalized, 0.5));

  // Apply opacity with soft alpha from color ramp
  float alpha = color.a * u_opacity;

  // Conditional smoothstep fade-in for low values (e.g. wave heatmap)
  // When u_fade_range > 0, applies smooth transition from discard threshold
  // Wave example: discardBelow=0.05, fadeRange=0.25 → smoothstep(0.05, 0.30, value)
  // Temperature: fadeRange=0 → no smoothstep (hard alpha from color ramp only)
  if (u_fade_range > 0.0) {
    alpha *= smoothstep(u_discard_below, u_discard_below + u_fade_range, raw_value);
  }

  // ── Cloud pattern: FBM noise modulates alpha for fluffy cloud shapes ────
  // The noise breaks up the flat gradient into realistic cloud-like patches.
  // Higher cloud cover (val) makes the noise threshold lower → more solid clouds.
  // Lower cloud cover → only the noise peaks survive → scattered wisps.
  if (u_cloud_pattern > 0.5) {
    float n = fbm(v_texcoord * 15.0);
    // Remap: normalized=1 (100% cloud) → mostly opaque; normalized=0 → fully transparent
    // The smoothstep(0.1, 0.9, ...) softens edges for fluffy appearance
    float cloud_alpha = smoothstep(0.1, 0.9, n * (normalized * 2.0));
    alpha *= cloud_alpha;
  }

  // Straight alpha output — our canvas uses premultipliedAlpha: false.
  // MapLibre's CanvasSource raster layer handles compositing onto the globe.
  gl_FragColor = vec4(color.rgb, alpha);
}
