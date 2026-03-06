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
 */
precision highp float;

uniform sampler2D u_data;       // Pre-normalized data texture
uniform sampler2D u_color_ramp; // Color ramp texture (256x1)
uniform sampler2D u_land_mask;  // Land/sea mask texture

uniform vec4 u_data_bbox;       // [minLon, minLat, maxLon, maxLat] of the data grid
uniform vec4 u_view_bbox;       // [minLon, minLat, maxLon, maxLat] of the current viewport
uniform float u_opacity;        // Overall layer opacity
uniform float u_use_land_mask;  // 1.0 to use land mask, 0.0 to skip
uniform float u_discard_below;  // Minimum normalized threshold
uniform float u_fade_range;     // Smoothstep band width in normalized space (0 = disabled)

varying vec2 v_texcoord;

void main() {
  // Map screen texcoord to geographic coordinates
  float lon = mix(u_view_bbox.x, u_view_bbox.z, v_texcoord.x);
  float lat = mix(u_view_bbox.y, u_view_bbox.w, v_texcoord.y);

  // Map geographic coordinates to data texture coordinates
  float data_u = (lon - u_data_bbox.x) / (u_data_bbox.z - u_data_bbox.x);
  float data_v = (lat - u_data_bbox.y) / (u_data_bbox.w - u_data_bbox.y);

  // Check if we're within the data bounds
  if (data_u < 0.0 || data_u > 1.0 || data_v < 0.0 || data_v > 1.0) {
    discard;
  }

  // Sample land mask
  if (u_use_land_mask > 0.5) {
    float land = texture2D(u_land_mask, v_texcoord).r;
    if (land > 0.5) {
      discard;
    }
  }

  // Sample pre-normalized data
  vec4 sample_val = texture2D(u_data, vec2(data_u, data_v));

  // Skip invalid / boundary data — strict threshold eliminates gl.LINEAR smear.
  // Bilinear filtering between valid ocean (a=1.0) and invalid land (a=0.0) creates
  // intermediate alpha values that bleed as a soft gradient onto land.
  // Threshold at 0.85 kills this border fringe precisely.
  if (sample_val.a < 0.85) {
    discard;
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

  // Premultiplied alpha output
  gl_FragColor = vec4(color.rgb * alpha, alpha);
}
