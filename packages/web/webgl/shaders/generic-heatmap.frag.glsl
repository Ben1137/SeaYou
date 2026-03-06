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
 */
precision highp float;

uniform sampler2D u_data;       // Scalar data texture (R = raw value, A = valid flag)
uniform sampler2D u_color_ramp; // Color ramp texture (256x1)
uniform sampler2D u_land_mask;  // Land/sea mask texture (0 = sea, 1 = land)

uniform vec4 u_data_bbox;       // [minLon, minLat, maxLon, maxLat] of the data grid
uniform vec4 u_view_bbox;       // [minLon, minLat, maxLon, maxLat] of the current viewport
uniform float u_opacity;        // Overall layer opacity
uniform float u_use_land_mask;  // 1.0 to use land mask, 0.0 to skip

// Normalization parameters
uniform float u_norm_mode;      // 0 = max-value, 1 = range, 2 = unit
uniform float u_min_value;      // For range mode: lower bound
uniform float u_max_value;      // For max-value and range modes: upper bound
uniform float u_discard_below;  // Minimum raw value threshold (skip near-zero)
uniform float u_fade_range;     // Smoothstep band width in raw value units (0 = disabled)

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

  // Sample land mask — discard if on land (only if land mask is enabled)
  if (u_use_land_mask > 0.5) {
    float land = texture2D(u_land_mask, v_texcoord).r;
    if (land > 0.5) {
      discard;
    }
  }

  // Sample data (bilinear interpolation via GL_LINEAR on the texture)
  vec4 sample_val = texture2D(u_data, vec2(data_u, data_v));

  // Skip invalid / boundary data — strict threshold eliminates gl.LINEAR smear.
  // When bilinear filtering interpolates between valid ocean (a=1.0) and invalid
  // land (a=0.0), intermediate alpha values (0.1–0.8) appear as a soft bleed
  // gradient spilling onto land.  Threshold at 0.85 kills this border fringe.
  if (sample_val.a < 0.85) {
    discard;
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

  // Premultiplied alpha output (required by MapLibre's blend mode)
  gl_FragColor = vec4(color.rgb * alpha, alpha);
}
