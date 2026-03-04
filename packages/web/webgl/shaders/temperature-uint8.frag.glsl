/**
 * temperature-uint8.frag.glsl - Sea temperature shader for Uint8 textures
 * Decodes temperature from Uint8 RGBA texture
 */
precision highp float;

uniform sampler2D u_data;       // Sea temperature data texture (Uint8 encoded)
uniform sampler2D u_color_ramp; // Color ramp texture (256x1)

uniform vec4 u_data_bbox;       // [minLon, minLat, maxLon, maxLat] of the data grid
uniform vec4 u_view_bbox;       // [minLon, minLat, maxLon, maxLat] of the current viewport
uniform float u_opacity;        // Overall layer opacity
uniform float u_min_temp;       // Minimum temperature for normalization
uniform float u_max_temp;       // Maximum temperature for normalization

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

  // Sample temperature data (Uint8 encoded)
  vec4 sample_val = texture2D(u_data, vec2(data_u, data_v));

  // Check valid data flag
  if (sample_val.a < 0.5) {
    discard;
  }

  // Decode: R channel contains normalized temperature (0-255 -> 0-1)
  // The encoding maps [min_temp, max_temp] to [0, 255]
  float normalized = sample_val.r;

  // Skip if no valid data
  if (normalized < 0.01) {
    discard;
  }

  // Look up color from ramp
  vec4 color = texture2D(u_color_ramp, vec2(normalized, 0.5));

  // Apply opacity
  // Note: texture2D returns normalized 0-1 values for Uint8 textures
  float alpha = color.a * u_opacity;

  // Premultiplied alpha output
  gl_FragColor = vec4(color.rgb * alpha, alpha);
}
