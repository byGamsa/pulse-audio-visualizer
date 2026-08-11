// Studio-Umgebung, braucht pal() und uStudioSpin
export const studioGlsl = `
uniform float uStudioSpin;

float softbox(vec2 sph, vec2 center, vec2 size, float soft) {
  vec2 q = abs(sph - center) - size;
  return 1.0 - smoothstep(-soft, soft, max(q.x, q.y));
}

vec3 studio(vec3 d) {
  float phi = atan(d.x, d.z) + uStudioSpin;
  phi = mod(phi + 3.14159265, 6.2831853) - 3.14159265;
  float theta = asin(clamp(d.y, -1.0, 1.0));
  vec2 s = vec2(phi, theta);
  vec3 col = mix(vec3(0.006, 0.006, 0.008), vec3(0.035, 0.034, 0.038), smoothstep(-0.4, 0.9, d.y));
  // Große Softbox schräg oben, zwei schmale Streifen seitlich
  col += vec3(1.0, 0.98, 0.95) * 4.5 * softbox(s, vec2(-0.7, 0.85), vec2(0.42, 0.2), 0.03);
  col += vec3(1.0) * 2.6 * softbox(s, vec2(1.35, 0.15), vec2(0.07, 0.55), 0.02);
  col += vec3(1.0) * 1.4 * softbox(s, vec2(0.25, 0.35), vec2(0.03, 0.4), 0.015);
  // Farbige Effektleisten hinten
  col += pal(0.72) * 2.4 * softbox(s, vec2(-2.3, 0.05), vec2(0.06, 0.6), 0.03);
  col += pal(0.38) * 1.8 * softbox(s, vec2(2.6, -0.05), vec2(0.05, 0.5), 0.03);
  // Bodenreflex und Horizontkante
  col += pal(0.25) * 0.08 * smoothstep(-0.1, -0.6, d.y);
  col += vec3(0.5) * exp(-abs(d.y + 0.02) * 60.0) * 0.15;
  return col;
}
`;
