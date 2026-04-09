precision highp float;

uniform sampler2D u_screen;
uniform float u_fade_opacity;

varying vec2 v_texCoord;

void main() {
  vec4 color = texture2D(u_screen, v_texCoord);
  // Straight alpha: decay both RGB and alpha uniformly by u_fade_opacity.
  // The trail pipeline uses SRC_ALPHA/ONE_MINUS_SRC_ALPHA blending internally.
  gl_FragColor = vec4(color.rgb, color.a * u_fade_opacity);
}
