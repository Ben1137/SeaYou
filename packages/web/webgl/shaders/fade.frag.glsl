precision highp float;

uniform sampler2D u_screen;
uniform float u_fade_opacity;

varying vec2 v_texCoord;

void main() {
  vec4 color = texture2D(u_screen, v_texCoord);
  // Premultiplied alpha output: RGB and alpha are both decayed by u_fade_opacity.
  // Explicit vec4 form makes the premultiplied intent unambiguous to the compiler
  // and matches the ONE / ONE_MINUS_SRC_ALPHA blend mode used in the composite pass.
  gl_FragColor = vec4(color.rgb * u_fade_opacity, color.a * u_fade_opacity);
}
