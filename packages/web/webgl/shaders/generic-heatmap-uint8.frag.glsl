/**
 * generic-heatmap-uint8.frag.glsl - Universal heatmap fragment shader (Uint8 mode)
 *
 * In Uint8 mode, CPU-side normalization is performed before upload:
 *   R = pre-normalized value (0-255 → 0.0-1.0 by GL)
 *   A = valid data flag (255 → 1.0 for valid, 0 → 0.0 for invalid)
 *
 * No u_norm_mode needed — normalization already happened on the CPU.
 *
 * u_fade_range controls the smoothstep fade band (in normalized 0-1 space):
 *   > 0.0 → apply smoothstep(discardBelow, discardBelow + fadeRange, normalized)
 *   = 0.0 → no smoothstep (hard cutoff from discard only)
 *
 * v_texcoord is now in data-texture UV space [0,1] directly (not viewport space).
 * The vertex shader (heatmap.vert.glsl) positions a Mercator geo-quad whose corners
 * are the data bbox corners, so v_texcoord.xy maps exactly onto the data grid.
 * This replaces the old view_bbox + data_bbox linear unprojection that broke at
 * any significant lat/lon span due to Web Mercator's non-linear latitude mapping.
 */
// Mobile GPUs (iOS WebKit) may not support highp in fragment shaders.
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

// Temporal interpolation mirrors the Float32 shader.
// u_data_next is bound to TEXTURE3 (TEXTURE1 is occupied by u_color_ramp).
// A 1×1 transparent dummy is bound when the next frame is not yet available.
uniform sampler2D u_data;       // Current timestep (pre-normalized, TEXTURE0)
uniform sampler2D u_data_next;  // Next timestep for temporal blend (TEXTURE3)
uniform sampler2D u_color_ramp; // Color ramp texture (256x1, TEXTURE1)
uniform sampler2D u_land_mask;  // Land/sea mask texture (TEXTURE2)

uniform float u_opacity;        // Overall layer opacity
uniform float u_use_land_mask;  // 1.0 to use land mask, 0.0 to skip
uniform float u_time_blend;     // Temporal blend factor: 0.0 = current, 1.0 = next
uniform float u_discard_below;  // Minimum normalized threshold
uniform float u_fade_range;     // Smoothstep band width in normalized space (0 = disabled)
uniform float u_cloud_pattern;  // 1.0 = apply FBM noise for cloud-like alpha modulation

varying vec2 v_texcoord;

// ── Procedural FBM noise for cloud texturing ──────────────────────────────
float hash2D(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise2D(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
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

  // Temporal blend — same valid-data-aware logic as the Float32 variant.
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

  float normalized = sample_val.r; // Already 0-1

  // Discard below threshold
  if (normalized < u_discard_below) {
    discard;
  }

  // Look up color from ramp
  vec4 color = texture2D(u_color_ramp, vec2(normalized, 0.5));

  // Apply opacity
  float alpha = color.a * u_opacity;

  // Conditional smoothstep fade-in (in normalized space)
  // Engine converts raw fadeRange to normalized before passing as uniform
  if (u_fade_range > 0.0) {
    alpha *= smoothstep(u_discard_below, u_discard_below + u_fade_range, normalized);
  }

  // ── Cloud pattern: FBM noise modulates alpha for fluffy cloud shapes ────
  if (u_cloud_pattern > 0.5) {
    float n = fbm(v_texcoord * 15.0);
    float cloud_alpha = smoothstep(0.1, 0.9, n * (normalized * 2.0));
    alpha *= cloud_alpha;
  }

  // Straight alpha output — our canvas uses premultipliedAlpha: false.
  // MapLibre's CanvasSource raster layer handles compositing onto the globe.
  gl_FragColor = vec4(color.rgb, alpha);
}
