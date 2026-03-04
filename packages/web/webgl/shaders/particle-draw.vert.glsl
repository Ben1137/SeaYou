precision highp float;

attribute vec2 a_index;

uniform sampler2D u_particles;
uniform vec2 u_particles_res;
uniform mat4 u_matrix;
uniform vec4 u_bbox;
uniform float u_point_size;
uniform float u_max_speed;

varying float v_speed;
varying float v_speed_norm;
varying float v_age;

float radians_custom(float degrees) {
  return degrees * 3.141592653589793 / 180.0;
}

void main() {
  vec2 texcoord = (a_index + 0.5) / u_particles_res;
  vec4 particle = texture2D(u_particles, texcoord);

  float x = particle.r;
  float y = particle.g;
  v_age = particle.b;
  // Alpha channel now stores normalized speed [0,1] directly from the update shader
  v_speed_norm = clamp(particle.a, 0.0, 1.0);
  v_speed = v_speed_norm * u_max_speed;

  float lon = mix(u_bbox.x, u_bbox.z, x);
  float lat = mix(u_bbox.y, u_bbox.w, y);

  float mercX = (lon + 180.0) / 360.0;
  float latRad = radians_custom(lat);
  float mercY = (1.0 - log(tan(latRad) + 1.0 / cos(latRad)) / 3.141592653589793) / 2.0;

  gl_Position = u_matrix * vec4(mercX, mercY, 0.0, 1.0);

  // Speed-based size: slow particles are small dots, fast ones grow larger (Windy style)
  // Use pow(0.6) curve for more aggressive size growth at moderate speeds vs sqrt
  float speedCurve = pow(v_speed_norm, 0.6);
  float sizeMultiplier = mix(0.7, 3.5, speedCurve);

  // Age keeps consistent size until near end of life, then shrinks quickly
  // Match the 80% threshold used in the fragment shader for consistent feel
  float ageFade = 1.0 - smoothstep(0.80, 1.0, v_age);
  gl_PointSize = u_point_size * sizeMultiplier * ageFade;
}
