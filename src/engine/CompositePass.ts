import * as THREE from 'three';
import { Pass } from 'postprocessing';
import { fullscreenVert, hash, simplex2 } from '../shared/glsl';
import { TRANSITIONS, type TransitionType } from './transitions';

// Blendet im linearen HDR-Raum zwischen zwei Modi über
const frag = `
precision highp float;
in vec2 vUv;
uniform sampler2D tA;
uniform sampler2D tB;
uniform float uProgress;
uniform float uTime;
uniform float uAspect;
uniform int uType;
${simplex2}
${hash}

// textureLod: sicher in Schleifen mit break/continue
vec3 A(vec2 uv) { return textureLod(tA, clamp(uv, 0.0, 1.0), 0.0).rgb; }
vec3 B(vec2 uv) { return textureLod(tB, clamp(uv, 0.0, 1.0), 0.0).rgb; }

// Noise Dissolve
vec3 dissolve(vec2 uv, float p) {
  vec2 q = (uv - 0.5) * vec2(uAspect, 1.0);
  float n = fbm(q * 2.2 + uTime * 0.05) * 0.5 + 0.5;
  n = mix(n, 1.0 - length(q) * 1.1, 0.35);
  float edge = 0.08;
  float t = p * (1.0 + 2.0 * edge) - edge;
  float mask = smoothstep(t + edge, t - edge, n);
  vec3 ca = A((uv - 0.5) * (1.0 - 0.06 * p) + 0.5);
  vec3 cb = B((uv - 0.5) * (1.0 + 0.06 * (1.0 - p)) + 0.5);
  float glow = exp(-pow((n - t) / (edge * 0.6), 2.0)) * sin(p * 3.14159);
  return mix(ca, cb, mask) + (ca + cb + 0.15) * 2.5 * glow;
}

// Zoom Warp
vec3 zoomBlur(sampler2D tex, vec2 uv, float zoom, float blur) {
  vec2 c = uv - 0.5;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    float k = float(i) / 15.0;
    acc += textureLod(tex, clamp(c / (zoom * (1.0 + blur * k)) + 0.5, 0.0, 1.0), 0.0).rgb;
  }
  return acc / 16.0;
}

vec3 zoomWarp(vec2 uv, float p) {
  float sA = 1.0 + p * p * 2.0;
  float sB = 0.35 + 0.65 * smoothstep(0.0, 1.0, p);
  vec3 ca = zoomBlur(tA, uv, sA, p * 0.35);
  vec3 cb = zoomBlur(tB, uv, sB, (1.0 - p) * 0.35);
  float m = smoothstep(0.38, 0.62, p);
  float flash = exp(-pow((p - 0.5) / 0.05, 2.0));
  return mix(ca, cb, m) * (1.0 - flash * 0.3) + vec3(1.0, 0.96, 0.92) * flash * 0.3;
}

// Glitch Cut
vec3 glitch(vec2 uv, float p) {
  float intensity = sin(p * 3.14159);
  // Zeit in Sprüngen, damit es digital ruckelt
  float tick = floor(uTime * 24.0);
  float row = floor(uv.y * 60.0);
  uv.x += (hash12(vec2(row, tick)) - 0.5) * 0.12 * intensity * step(0.7, hash12(vec2(row * 1.3, tick + 4.0)));

  vec2 block = floor(uv * vec2(18.0, 10.0));
  float order = hash12(block + 0.5);
  float flicker = hash12(block + tick * 0.13);
  bool showB = order < p * 1.15 - 0.075 + (flicker - 0.5) * 0.3 * intensity;

  float split = 0.012 * intensity * (0.5 + flicker);
  vec2 off = vec2(split, 0.0);
  vec3 col = showB
    ? vec3(B(uv + off).r, B(uv).g, B(uv - off).b)
    : vec3(A(uv - off).r, A(uv).g, A(uv + off).b);

  // Einzelne Blöcke kurz invertiert oder überstrahlt
  float burst = step(1.0 - 0.06 * intensity, hash12(block * 1.7 + tick));
  col = mix(col, vec3(1.0) * 1.5 - col * 0.5, burst);
  col *= 1.0 - 0.15 * intensity * step(0.5, fract(uv.y * 240.0));
  return col;
}

// Liquid Displace
vec3 liquid(vec2 uv, float p) {
  vec2 q = (uv - 0.5) * vec2(uAspect, 1.0);
  float n = fbm(q * 1.6 + vec2(0.0, uTime * 0.08)) * 0.5 + 0.5;
  // Diagonale Front, vom Noise ausgefranst
  float front = (uv.x * 0.45 + uv.y * 0.55) * 0.7 + n * 0.3;
  float t = p * 1.3 - 0.15;
  float d = front - t;
  float mask = smoothstep(0.03, -0.03, d);

  // Nahe der Front wird das alte Bild weggedrückt, das neue „fließt nach“
  float push = exp(-max(d, 0.0) * 12.0) * (1.0 - mask);
  vec2 dir = normalize(vec2(0.45, 0.55));
  vec3 ca = A(uv + dir * push * 0.08 + (n - 0.5) * 0.02 * push);
  float pull = exp(-max(-d, 0.0) * 10.0) * mask;
  vec3 cb = B(uv - dir * pull * 0.05);

  // Feuchter Glanz direkt auf der Front
  float sheen = exp(-pow(d / 0.012, 2.0)) * sin(p * 3.14159);
  return mix(ca, cb, mask) + (cb * 1.5 + 0.2) * sheen;
}

// Shatter
const float CELLS = 6.0;

// Nächster Zellkern; liefert Zell-ID (ganzzahlig) und Kernposition
vec2 voronoi(vec2 x, out vec2 center) {
  vec2 n = floor(x);
  float best = 1e9;
  vec2 id = vec2(0.0);
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 g = n + vec2(float(i), float(j));
    vec2 o = g + 0.15 + 0.7 * hash22(g);
    float d = dot(x - o, x - o);
    if (d < best) { best = d; id = g; center = o; }
  }
  return id;
}

vec3 shatter(vec2 uv, float p) {
  vec2 aspect = vec2(uAspect, 1.0);
  vec2 x = uv * aspect * CELLS;
  vec2 center;
  vec2 home = voronoi(x, center);
  vec3 col = B(uv);
  float crack = 0.0;

  // Scherben können aus ihrer Zelle fliegen, daher Nachbarn prüfen
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 cell = home + vec2(float(i), float(j));
    vec2 c = cell + 0.15 + 0.7 * hash22(cell);
    vec2 h = hash22(cell + 7.3);
    // Scherben aus der Bildmitte brechen zuerst
    float delay = clamp(length(c / CELLS / aspect - 0.5) * 0.7 + h.x * 0.2, 0.0, 0.55);
    float q = clamp((p - delay) / 0.45, 0.0, 1.0);
    if (q >= 1.0) continue;
    float e = q * q;
    vec2 away = normalize(c - 0.5 * aspect * CELLS + 1e-3) * e * 2.5 + vec2(0.0, -e * e * 4.0);
    float ang = (h.y - 0.5) * 2.5 * e;
    float scale = 1.0 - 0.35 * e;
    // Pixel rückwärts in das Koordinatensystem der Scherbe transformieren
    vec2 local = (x - c - away) / scale;
    local = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * local;
    vec2 src = c + local;
    vec2 srcCenter;
    if (voronoi(src, srcCenter) == cell) {
      vec2 suv = src / CELLS / aspect;
      if (suv.x >= 0.0 && suv.x <= 1.0 && suv.y >= 0.0 && suv.y <= 1.0) {
        // Leichte Abschattung je nach Kippwinkel, wie Licht auf Glas
        col = A(suv) * (1.0 - e * 0.6) * (0.85 + 0.3 * h.x);
        // Helle Bruchkante
        vec2 cc;
        voronoi(src + vec2(0.02, 0.0), cc);
        crack = max(crack, step(0.001, length(cc - srcCenter)) * (1.0 - e));
        break;
      }
    }
  }
  return col + vec3(1.0, 0.97, 0.94) * crack * sin(p * 3.14159) * 1.5;
}

// Focus Pull
const float GOLDEN = 2.39996323;

vec3 bokeh(sampler2D tex, vec2 uv, float radius, vec2 aspect) {
  if (radius < 0.0005) return textureLod(tex, uv, 0.0).rgb;
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int i = 0; i < 32; i++) {
    float fi = float(i) + 0.5;
    float r = sqrt(fi / 32.0) * radius;
    vec2 o = vec2(cos(fi * GOLDEN), sin(fi * GOLDEN)) * r / aspect;
    vec3 c = textureLod(tex, clamp(uv + o, 0.0, 1.0), 0.0).rgb;
    // Helle Punkte stärker gewichten für echtes Bokeh
    float w = 1.0 + dot(c, vec3(0.3)) * 2.0;
    acc += c * w;
    wsum += w;
  }
  return acc / wsum;
}

vec3 focusPull(vec2 uv, float p) {
  vec2 aspect = vec2(uAspect, 1.0);
  float ra = smoothstep(0.0, 0.55, p) * 0.035;
  float rb = (1.0 - smoothstep(0.45, 1.0, p)) * 0.035;
  // „Focus Breathing“: das Bild atmet minimal mit der Schärfeebene
  vec2 uvA = (uv - 0.5) * (1.0 - 0.025 * p) + 0.5;
  vec2 uvB = (uv - 0.5) * (1.0 + 0.025 * (1.0 - p)) + 0.5;
  vec3 ca = bokeh(tA, uvA, ra, aspect);
  vec3 cb = bokeh(tB, uvB, rb, aspect);
  return mix(ca, cb, smoothstep(0.35, 0.65, p));
}

// Light Leak
vec3 lightLeak(vec2 uv, float p) {
  vec2 q = (uv - 0.5) * vec2(uAspect, 1.0);
  float peak = sin(p * 3.14159);
  // Zwei warme Lichtflecken wandern über das Bild
  vec2 c1 = vec2(mix(-1.2, 0.9, p), 0.15 + 0.1 * sin(p * 4.0));
  vec2 c2 = vec2(mix(1.0, -0.6, p), -0.25);
  float l1 = exp(-dot(q - c1, q - c1) * 6.0);
  float l2 = exp(-dot(q - c2, q - c2) * 9.0);
  vec3 leak = vec3(1.0, 0.45, 0.15) * l1 + vec3(1.0, 0.25, 0.45) * l2 * 0.7;
  float exposure = 1.0 + peak * peak * 0.7;
  vec3 ca = A(uv) * exposure;
  vec3 cb = B(uv) * exposure;
  vec3 col = mix(ca, cb, smoothstep(0.4, 0.6, p));
  col += leak * peak * 1.4;
  // Kurz vor dem Schnitt brennt das Bild fast weiß aus
  col += vec3(1.0, 0.9, 0.8) * pow(peak, 10.0) * 0.5;
  return col;
}

// Singularity
vec3 singularity(vec2 uv, float p) {
  vec2 aspect = vec2(uAspect, 1.0);
  vec2 q = (uv - 0.5) * aspect;
  float r = length(q);
  float ang = atan(q.y, q.x);
  bool second = p > 0.5;
  float k = second ? (1.0 - p) * 2.0 : p * 2.0;
  float e = k * k;
  // Je näher am Kern, desto stärker verdreht und hineingezogen
  float swirl = e * 7.0 * exp(-r * 2.5) * (second ? -1.0 : 1.0);
  float pull = 1.0 + e * 6.0 * exp(-r * 1.5);
  vec2 src = vec2(cos(ang + swirl), sin(ang + swirl)) * r * pull;
  vec3 col = second ? B(src / aspect + 0.5) : A(src / aspect + 0.5);
  // Ereignishorizont und heller Photonenring
  float horizon = 0.25 * e;
  col *= smoothstep(horizon * 0.6, horizon, r);
  col += vec3(1.0, 0.85, 0.7) * exp(-pow((r - horizon) / (0.008 + 0.02 * e), 2.0)) * e * 2.5;
  return col;
}

void main() {
  float p = uProgress;
  if (p <= 0.0) { gl_FragColor = vec4(A(vUv), 1.0); return; }
  vec3 col;
  if (uType == 0) col = mix(A(vUv), B(vUv), p);
  else if (uType == 1) col = dissolve(vUv, p);
  else if (uType == 2) col = zoomWarp(vUv, p);
  else if (uType == 3) col = glitch(vUv, p);
  else if (uType == 4) col = liquid(vUv, p);
  else if (uType == 5) col = shatter(vUv, p);
  else if (uType == 6) col = focusPull(vUv, p);
  else if (uType == 7) col = lightLeak(vUv, p);
  else col = singularity(vUv, p);
  gl_FragColor = vec4(col, 1.0);
}
`;

export class CompositePass extends Pass {
  private readonly material: THREE.ShaderMaterial;

  constructor() {
    super('CompositePass');
    this.needsSwap = false; // schreibt wie ein RenderPass in den Input-Buffer der Kette
    this.material = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tA: { value: null },
        tB: { value: null },
        uProgress: { value: 0 },
        uTime: { value: 0 },
        uAspect: { value: 1 },
        uType: { value: 1 },
      },
      vertexShader: fullscreenVert,
      fragmentShader: frag,
    });
    this.fullscreenMaterial = this.material;
  }

  setInputs(
    a: THREE.Texture,
    b: THREE.Texture | null,
    progress: number,
    time: number,
    aspect: number,
    type: TransitionType,
  ) {
    const u = this.material.uniforms;
    u.tA.value = a;
    u.tB.value = b ?? a;
    u.uProgress.value = b ? progress : 0;
    u.uTime.value = time;
    u.uAspect.value = aspect;
    u.uType.value = TRANSITIONS.indexOf(type);
  }

  override render(renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget | null) {
    renderer.setRenderTarget(this.renderToScreen ? null : inputBuffer);
    renderer.render(this.scene, this.camera);
  }
}
