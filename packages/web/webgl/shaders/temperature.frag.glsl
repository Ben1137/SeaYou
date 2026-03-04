precision highp float;

uniform sampler2D u_data;       // Sea temperature data texture
uniform sampler2D u_color_ramp; // Color ramp texture (256x1)
uniform sampler2D u_land_mask;  // Land/sea mask texture (0 = sea, 1 = land)

uniform vec4 u_data_bbox;       // [minLon, minLat, maxLon, maxLat] of the data grid
uniform vec4 u_view_bbox;       // [minLon, minLat, maxLon, maxLat] of the current viewport
uniform float u_opacity;        // Overall layer opacity
uniform float u_min_temp;       // Minimum temperature for normalization
uniform float u_max_temp;       // Maximum temperature for normalization
uniform float u_use_land_mask;  // 1.0 to use land mask, 0.0 to skip

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

  // Sample temperature data (bilinear interpolation via GL_LINEAR)
  vec4 sample_val = texture2D(u_data, vec2(data_u, data_v));

  // Belt-and-suspenders alpha discard: encoder sets alpha=0 for NaN/land points.
  // GLSL NaN comparisons always return false, so the temp range check below
  // cannot catch NaN — this explicit alpha check is the primary land-pixel guard.
  if (sample_val.a < 0.1) {
    discard;
  }

  float temp = sample_val.r;       // Raw temperature in Celsius

  // Skip out-of-range values (secondary guard for any non-NaN garbage)
  if (temp < -2.0 || temp > 40.0) {
    discard;
  }

  // Normalize temperature to 0-1 for color ramp lookup
  float normalized = clamp((temp - u_min_temp) / (u_max_temp - u_min_temp), 0.0, 1.0);

  // Look up color from ramp
  vec4 color = texture2D(u_color_ramp, vec2(normalized, 0.5));

  // Apply opacity
  // Note: texture2D returns normalized 0-1 values for Uint8 textures
  float alpha = color.a * u_opacity;

  // Premultiplied alpha output
  gl_FragColor = vec4(color.rgb * alpha, alpha);
}
