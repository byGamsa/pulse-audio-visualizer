import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { fullscreenVert, hash, palette } from '../../shared/glsl';

const BANDS = 128;
const MAX_SPARKS = 4096;
const MAX_SHOCKS = 4;
const BASE_RADIUS = 0.23;
const AMPLITUDE = 0.17;

const ringFrag = `
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uRot;
uniform float uBass;
uniform float uBassRaw;
uniform float uTreble;
uniform float uEnergy;
uniform float uRadius;
uniform float uSpec[${BANDS}];
uniform float uShockAge[${MAX_SHOCKS}];
uniform float uShockAmp[${MAX_SHOCKS}];
${palette}
${hash}

const float PI = 3.14159265;

// Catmull-Rom, damit der Ring glatt bleibt
float spec(float x) {
  x = clamp(x, 0.0, float(${BANDS - 1}));
  int i = int(floor(x));
  float f = fract(x);
  float p0 = uSpec[max(i - 1, 0)];
  float p1 = uSpec[i];
  float p2 = uSpec[min(i + 1, ${BANDS - 1})];
  float p3 = uSpec[min(i + 2, ${BANDS - 1})];
  return 0.5 * (2.0 * p1 + (-p0 + p2) * f + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * f * f
       + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * f * f * f);
}

float stars(vec2 p) {
  vec2 g = floor(p * 90.0);
  vec2 f = fract(p * 90.0) - 0.5;
  float h = hash12(g);
  if (h < 0.965) return 0.0;
  vec2 o = (hash22(g) - 0.5) * 0.6;
  float tw = 0.5 + 0.5 * sin(uTime * (1.0 + h * 3.0) + h * 40.0);
  return exp(-dot(f - o, f - o) * 120.0) * tw * (h - 0.965) * 30.0;
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float len = length(p);
  float a = atan(p.x, -p.y) + uRot;
  a = mod(a + PI, 2.0 * PI) - PI;
  // Gespiegelt: Bass unten, Höhen oben, auf beiden Seiten symmetrisch
  float t = abs(a) / PI;
  float s = max(spec(t * float(${BANDS - 1})), 0.0);

  float R = uRadius;
  float r = R + ${AMPLITUDE.toFixed(3)} * s;
  float d = len - r;
  vec3 col = vec3(0.0);

  // Hintergrund: Tiefe und leise funkelnde Sterne
  col += pal(0.08) * 0.10 * smoothstep(1.2, 0.0, len);
  col += vec3(0.6, 0.7, 1.0) * stars(p + uTime * 0.003) * (0.25 + uTreble * 1.4);

  // Füllung im Ring
  col += pal(0.18 + 0.25 * uBass) * smoothstep(r, r - 0.2, len) * (0.04 + 0.10 * uBass);

  // Lichtstrahlen außerhalb des Rings, pro Frequenz
  float ray = pow(0.5 + 0.5 * sin(a * 48.0 + uTime * 0.6), 6.0);
  col += pal(0.65 + 0.3 * s) * step(0.0, d) * exp(-d * 7.0) * s * s * ray * 0.35;

  // Weicher Glow und harte HDR-Kernlinie
  float w = 0.0022 + 0.0018 * uTreble;
  col += pal(0.45 + 0.35 * s) * exp(-abs(d) * 45.0) * (0.08 + 0.35 * s);
  col += mix(pal(0.6 + 0.35 * s), vec3(1.0), 0.35) * exp(-(d * d) / (w * w)) * (1.4 + 3.2 * s);

  // Innere Echo-Linie, läuft gegenphasig
  float r2 = R * 0.9 - ${AMPLITUDE.toFixed(3)} * 0.35 * s;
  float d2 = len - r2;
  col += pal(0.3 + 0.2 * s) * exp(-(d2 * d2) / (w * w * 0.5)) * (0.4 + 1.0 * s);

  // Kern
  col += pal(0.85) * exp(-len * len / (0.0008 + 0.0025 * uBass)) * (0.3 + 1.4 * uBassRaw);

  // Schockwellen auf Beats
  for (int i = 0; i < ${MAX_SHOCKS}; i++) {
    float age = uShockAge[i];
    if (age < 0.0) continue;
    float rs = R + age * 0.75;
    float ds = len - rs;
    float width = 0.0001 + age * 0.0004;
    col += pal(0.9 - age * 0.3) * exp(-(ds * ds) / width) * exp(-age * 2.6) * uShockAmp[i] * 0.9;
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

const sparkVert = `
attribute vec2 aData; // x = verbleibende Lebenszeit 0..1, y = Paletten-Position
uniform float uPixel;
out vec2 vData;
void main() {
  vData = aData;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aData.x > 0.0 ? uPixel * (1.5 + 2.5 * aData.x) : 0.0;
}
`;

const sparkFrag = `
precision highp float;
in vec2 vData;
${palette}
void main() {
  if (vData.x <= 0.0) discard;
  vec2 c = gl_PointCoord - 0.5;
  float m = exp(-dot(c, c) * 18.0);
  gl_FragColor = vec4(pal(vData.y) * m * vData.x * 3.5, 1.0);
}
`;

class Halo implements VisualMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 0.5, -0.5, -1, 1);
  private ringMat!: THREE.ShaderMaterial;
  private sparkMat!: THREE.ShaderMaterial;
  private sparkGeo!: THREE.BufferGeometry;
  private quadGeo!: THREE.PlaneGeometry;

  private readonly spec = new Float32Array(BANDS);
  private readonly shockAge = new Float32Array(MAX_SHOCKS).fill(-1);
  private readonly shockAmp = new Float32Array(MAX_SHOCKS);
  private shockIndex = 0;

  private readonly pos = new Float32Array(MAX_SPARKS * 3);
  private readonly vel = new Float32Array(MAX_SPARKS * 2);
  private readonly life = new Float32Array(MAX_SPARKS);
  private readonly maxLife = new Float32Array(MAX_SPARKS);
  private readonly data = new Float32Array(MAX_SPARKS * 2);
  private sparkCursor = 0;
  private rot = 0;
  private time = 0;
  private trickle = 0;

  init(ctx: ModeContext) {
    this.quadGeo = new THREE.PlaneGeometry(2, 2);
    this.ringMat = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uRes: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uRot: { value: 0 },
        uBass: { value: 0 },
        uBassRaw: { value: 0 },
        uTreble: { value: 0 },
        uEnergy: { value: 0 },
        uRadius: { value: BASE_RADIUS },
        uSpec: { value: this.spec },
        uShockAge: { value: this.shockAge },
        uShockAmp: { value: this.shockAmp },
        uPalette: { value: ctx.palette },
      },
      vertexShader: fullscreenVert,
      fragmentShader: ringFrag,
    });
    const quad = new THREE.Mesh(this.quadGeo, this.ringMat);
    quad.frustumCulled = false;
    this.scene.add(quad);

    this.sparkGeo = new THREE.BufferGeometry();
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.sparkGeo.setAttribute('aData', new THREE.BufferAttribute(this.data, 2).setUsage(THREE.DynamicDrawUsage));
    this.sparkMat = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.AdditiveBlending,
      uniforms: { uPixel: { value: 1 }, uPalette: { value: ctx.palette } },
      vertexShader: sparkVert,
      fragmentShader: sparkFrag,
    });
    const points = new THREE.Points(this.sparkGeo, this.sparkMat);
    points.frustumCulled = false;
    points.renderOrder = 1;
    this.scene.add(points);
  }

  resize(width: number, height: number) {
    const aspect = width / height;
    this.ringMat.uniforms.uRes.value.set(width, height);
    this.sparkMat.uniforms.uPixel.value = height / 720;
    this.camera.left = -aspect / 2;
    this.camera.right = aspect / 2;
    this.camera.updateProjectionMatrix();
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    this.rot += dt * (0.04 + a.mid * 0.25);

    // Räumliches Glätten (1-4-6-4-1) für einen ruhigeren, seidigen Ring
    const sp = a.spectrum;
    for (let i = 0; i < BANDS; i++) {
      const at = (k: number) => sp[Math.min(Math.max(i + k, 0), BANDS - 1)];
      this.spec[i] = (at(-2) + 4 * at(-1) + 6 * at(0) + 4 * at(1) + at(2)) / 16;
    }

    for (let i = 0; i < MAX_SHOCKS; i++) if (this.shockAge[i] >= 0) this.shockAge[i] = this.shockAge[i] > 2.5 ? -1 : this.shockAge[i] + dt;

    const radius = BASE_RADIUS * (1 + 0.09 * a.bass + 0.05 * a.bassRaw);
    if (a.beat) {
      this.shockAge[this.shockIndex] = 0;
      this.shockAmp[this.shockIndex] = 0.35 + a.bassRaw;
      this.shockIndex = (this.shockIndex + 1) % MAX_SHOCKS;
      this.emit(Math.floor(90 + 260 * a.bassRaw), radius, 1);
    }
    this.trickle += dt * (10 + a.treble * 220);
    const n = Math.floor(this.trickle);
    this.trickle -= n;
    this.emit(n, radius, 0.45);
    this.updateSparks(dt);

    const u = this.ringMat.uniforms;
    u.uTime.value = this.time;
    u.uRot.value = this.rot;
    u.uBass.value = a.bass;
    u.uBassRaw.value = a.bassRaw;
    u.uTreble.value = a.treble;
    u.uEnergy.value = a.energy;
    u.uRadius.value = radius;
  }

  private emit(count: number, radius: number, power: number) {
    for (let k = 0; k < count; k++) {
      const i = this.sparkCursor;
      this.sparkCursor = (this.sparkCursor + 1) % MAX_SPARKS;
      const ang = (Math.random() * 2 - 1) * Math.PI; // Winkel im Ring-Raum
      const t = Math.abs(ang) / Math.PI;
      const s = this.spec[Math.min(Math.floor(t * (BANDS - 1)), BANDS - 1)];
      const screen = ang - this.rot;
      const r = radius + AMPLITUDE * s;
      const dx = Math.sin(screen);
      const dy = -Math.cos(screen);
      this.pos[i * 3] = dx * r;
      this.pos[i * 3 + 1] = dy * r;
      const speed = (0.08 + s * 0.6 + Math.random() * 0.12) * power;
      const tangential = (Math.random() - 0.5) * 0.08;
      this.vel[i * 2] = dx * speed - dy * tangential;
      this.vel[i * 2 + 1] = dy * speed + dx * tangential;
      this.maxLife[i] = this.life[i] = 0.6 + Math.random() * 1.2;
      this.data[i * 2 + 1] = 0.55 + s * 0.4;
    }
  }

  private updateSparks(dt: number) {
    const drag = Math.exp(-dt * 1.6);
    for (let i = 0; i < MAX_SPARKS; i++) {
      if (this.life[i] <= 0) {
        this.data[i * 2] = 0;
        continue;
      }
      this.life[i] -= dt;
      this.vel[i * 2] *= drag;
      this.vel[i * 2 + 1] *= drag;
      this.pos[i * 3] += this.vel[i * 2] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 2 + 1] * dt;
      this.data[i * 2] = Math.max(this.life[i] / this.maxLife[i], 0);
    }
    this.sparkGeo.attributes.position.needsUpdate = true;
    this.sparkGeo.attributes.aData.needsUpdate = true;
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.quadGeo.dispose();
    this.ringMat.dispose();
    this.sparkGeo.dispose();
    this.sparkMat.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('halo').meta,
  create: () => new Halo(),
};
export default definition;
