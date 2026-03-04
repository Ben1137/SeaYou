precision highp float;

uniform sampler2D u_color_ramp;
uniform float u_max_speed;

varying float v_speed;
varying float v_speed_norm;
varying float v_age;

void main() {
  float normalizedSpeed = v_speed_norm;

  // Look up color from ramp
  vec4 color = texture2D(u_color_ramp, vec2(normalizedSpeed, 0.5));

  // Soft radial glow: bright core that fades to transparent edge (Windy-style)
  // Enhanced bloom: larger halo intensity for better visibility on dark maps
  vec2 coord = gl_PointCoord - 0.5;
  float dist = length(coord) * 2.0;
  // Tight bright core + stronger halo — gives the "glowing orb on dark map" look
  float core  = 1.0 - smoothstep(0.0, 0.40, dist);
  float halo  = (1.0 - smoothstep(0.40, 1.0, dist)) * 0.55;
  float outerGlow = (1.0 - smoothstep(0.7, 1.0, dist)) * 0.15;
  float circle = core + halo + outerGlow;

  // Age fade: particles stay bright for most of their life, then fade out near end
  // Keep bright longer (80% lifetime) then quick fade — creates longer visible streaks
  float ageFade = 1.0 - smoothstep(0.80, 1.0, v_age);

  // Speed fade: only hide truly zero-speed particles — calm breezes still visible
  float speedFade = smoothstep(0.0, 0.015, normalizedSpeed);

  // Boost brightness for medium-to-fast particles (makes Windy's vivid neon look)
  float brightnessBoost = 1.0 + 0.35 * smoothstep(0.2, 0.7, normalizedSpeed);

  // color.a is already in [0,1] from the texture sample
  float alpha = min(1.0, color.a * circle * ageFade * speedFade * brightnessBoost);

  // Premultiplied alpha for correct blending with trail FBO
  gl_FragColor = vec4(color.rgb * alpha, alpha);
}
