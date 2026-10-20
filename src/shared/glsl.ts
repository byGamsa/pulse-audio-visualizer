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

// Simplex-Noise 3D (Ashima / Stefan Gustavson, MIT)
export const simplex3 = `
vec4 _s3_permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
vec4 _s3_taylor(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise3(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod(i, 289.0);
  vec4 p = _s3_permute(_s3_permute(_s3_permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = _s3_taylor(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

// Farbton 0..1 → gesättigte RGB-Farbe
export const hue = `
vec3 hue2rgb(float h) {
  return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
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
  // Gespiegelt statt umgebrochen: Farbton 1 und 0 landen an derselben Stelle, kein harter Schnitt
  float h = fract(hue + 0.05);
  float pos = 0.38 + 0.52 * (1.0 - abs(h * 2.0 - 1.0));
  // Dunkle Töne (Hintergründe, Dunst) nehmen das dunkle Ende der Palette statt eines Mitteltons,
  // sonst wird aus Indigo-Nacht bei bunten Paletten grüner oder oliver Matsch
  pos = mix(0.13, pos, smoothstep(0.015, 0.22, mx));
  vec3 p = pal(pos);
  p *= mx / max(max(p.r, max(p.g, p.b)), 1e-4);
  return mix(own, mix(own, p, sat), uPaletteMix);
}
`;

export const palette = `
uniform sampler2D uPalette;
vec3 pal(float t) { return texture(uPalette, vec2(clamp(t, 0.002, 0.998), 0.5)).rgb; }
`;
