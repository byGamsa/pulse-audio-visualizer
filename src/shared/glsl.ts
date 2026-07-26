// GLSL als Strings, kein extra Vite-Plugin nötig

// Vertex-Shader für ein Fullscreen-Quad aus PlaneGeometry(2, 2)
export const fullscreenVert = `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const hash = `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
`;

// Simplex-Noise 2D (Ashima / Stefan Gustavson, MIT)
export const simplex2 = `
vec3 _sx_permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = _sx_permute(_sx_permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) { v += a * snoise(p); p = r * p * 2.02; a *= 0.5; }
  return v;
}
`;

// Bildet eine feste Farbe auf die Palette ab, braucht palette davor
export const tint = `
uniform float uPaletteMix;
vec3 tint(vec3 own) {
  float mx = max(own.r, max(own.g, own.b));
  if (uPaletteMix <= 0.001 || mx <= 1e-5) return own;
  float mn = min(own.r, min(own.g, own.b));
  float sat = (mx - mn) / mx;
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 q = mix(vec4(own.bg, K.wz), vec4(own.gb, K.xy), step(own.b, own.g));
  vec4 r = mix(vec4(q.xyw, own.r), vec4(own.r, q.yzx), step(q.x, own.r));
  float hue = abs(r.z + (r.w - r.y) / (6.0 * (r.x - min(r.w, r.y)) + 1e-10));
  vec3 p = pal(0.38 + 0.52 * fract(hue + 0.05));
  p *= mx / max(max(p.r, max(p.g, p.b)), 1e-4);
  return mix(own, mix(own, p, sat), uPaletteMix);
}
`;

export const palette = `
uniform sampler2D uPalette;
vec3 pal(float t) { return texture(uPalette, vec2(clamp(t, 0.002, 0.998), 0.5)).rgb; }
`;
