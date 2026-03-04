/**
 * heatmap-uint8.frag.glsl - Fragment shader for wave heatmap (Uint8 textures)
 * Decodes wave height from Uint8 RGBA texture
 */
precision highp float;

uniform sampler2D u_data;       // Wave height data texture (Uint8 encoded)
uniform sampler2D u_color_ramp; // Color ramp texture (256x1)
uniform sampler2D u_land_mask;  // Land/sea mask texture

uniform vec4 u_data_bbox;       // [minLon, minLat, maxLon, maxLat] of the data grid
uniform vec4 u_view_bbox;       // [minLon, minLat, maxLon, maxLat] of the current viewport
uniform float u_opacity;        // Overall layer opacity
uniform float u_max_value;      // Maximum data value for normalization
uniform float u_use_land_mask;  // 1.0 to use land mask, 0.0 to skip

varying vec2 v_texcoord;

void main() {
  // Map screen texcoord to geographic coordinates
  float lon = mix(u_view_bbox.x, u_view_bbox.z, v_texcoord.x);
  float lat = mix(u_view_bbox.y, u_view_bbox.w, v_texcoord.y);

  // Map geographic coordinates to data texture coordinates
  float data_u = (lon - u_data_bbox.x) / (u_data_bbox.z - u_data_bbox.x);
  float data_v = (lat - u_data_bbox.y) / (u_data_bbox.w - u_data_bbox.y);

  // Check bounds
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

  // Sample wave height data (Uint8 encoded)
  vec4 sample_data = texture2D(u_data, vec2(data_u, data_v));

  // Decode: R channel contains normalized value (0-255 -> 0-1)
  float normalized = sample_data.r;  // Already 0-1 from Uint8
  float validFlag = sample_data.a;   // Alpha = valid data flag

  // Skip invalid data
  if (validFlag < 0.5) {
    discard;
  }

  // Calculate actual value for threshold checks
  float value = normalized * u_max_value;

  // Skip near-zero values
  if (value < 0.05) {
    discard;
  }

  // Look up color from ramp
  vec4 color = texture2D(u_color_ramp, vec2(normalized, 0.5));

  // Soft alpha ramp
  // Note: texture2D returns normalized 0-1 values for Uint8 textures
  float alpha = smoothstep(0.05, 0.3, value) * u_opacity * color.a;

  // Premultiplied alpha output
  gl_FragColor = vec4(color.rgb * alpha, alpha);
}
