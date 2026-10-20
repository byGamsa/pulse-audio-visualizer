import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { SpectrumHistory, spectrumHistoryGlsl } from '../../engine/field/SpectrumHistory';
import { Starfield } from '../../engine/field/Starfield';
import { WaveHistory } from '../../engine/field/WaveHistory';
import { LineSet } from '../../engine/field/primitives';
import { FullscreenPass, renderOver } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { hue, palette, simplex2, simplex3, tint } from '../../shared/glsl';

const ROWS = 60;
const ARCS = 8;
const FOV = 42;
const DIST = 4.4;
const RADIUS = 0.82;

// Eine Plasmakugel: Energiefäden auf der Oberfläche, eine Korona, die mit dem Spektrum lodert
const orbFrag = `
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uFlow;
uniform float uBass;
uniform float uFlash;
uniform float uHue;
uniform mat3 uSpin;
${palette}
${tint}
${hue}
${simplex2}
${simplex3}
${spectrumHistoryGlsl(ROWS)}
const float R = ${RADIUS.toFixed(3)};
const float TAU = 6.2831853;

float fbm3(vec3 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * snoise3(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return v;
}

vec3 plasmaColor(float t) {
  // Violett → Magenta → Cyan → Weiß, langsam wandernd
  vec3 a = hue2rgb(fract(uHue + 0.78));
  vec3 b = hue2rgb(fract(uHue + 0.9));
  vec3 c = hue2rgb(fract(uHue + 0.52));
  vec3 col = mix(a * 0.25, b, smoothstep(0.0, 0.45, t));
  col = mix(col, c, smoothstep(0.45, 0.8, t));
  return mix(col, vec3(1.0), smoothstep(0.8, 1.0, t));
}

void main() {
  float aspect = uRes.x / uRes.y;
  vec2 uv = (vUv - 0.5) * 2.0 * vec2(aspect, 1.0) * tan(radians(${FOV / 2}.0));
  vec3 ro = vec3(0.0, 0.0, ${DIST.toFixed(2)});
  vec3 rd = normalize(vec3(uv, -1.0));

  // Schnitt mit der Kugel
  float b = dot(ro, rd);
  float c = dot(ro, ro) - R * R;
  float disc = b * b - c;
  vec3 col = vec3(0.0);

  // Abstand des Strahls zur Mitte für Korona und Glühen
  float closest = length(ro - rd * b);
  vec2 sp = uv / max(length(uv), 1e-4);
  float ang = atan(sp.y, sp.x);
  float band = abs(fract(ang / TAU + 0.25) * 2.0 - 1.0);
  float e = specAt(band * 0.8, 0.0);
  float rim = closest - R;

  if (rim > 0.0) {
    // Flammen der Korona: Rauschen läuft nach außen, Höhe folgt dem Spektrum
    float flame = snoise(vec2(ang * 7.0 + uFlow * 0.2, rim * 1.6 - uFlow * 1.4)) * 0.5 + 0.5;
    flame *= snoise(vec2(ang * 19.0 - uFlow * 0.3, rim * 2.4 - uFlow * 2.0)) * 0.45 + 0.55;
    flame = pow(flame, 1.6);
    float reach = 0.08 + pow(e, 1.2) * 0.55 + uBass * 0.12;
    float corona = exp(-rim / reach * 2.2) * (0.2 + flame * 1.1);
    col += plasmaColor(0.55 + flame * 0.3) * corona * (0.6 + uFlash * 0.8);
    // Weiter, weicher Schein
    col += plasmaColor(0.5) * exp(-rim * 2.6) * (0.06 + uBass * 0.08);
  }

  if (disc > 0.0) {
    float t = -b - sqrt(disc);
    vec3 p = ro + rd * t;
    vec3 n = normalize(p);
    vec3 q = uSpin * n;
    // Verwirbelte Energiefäden auf der Oberfläche
    vec3 w = vec3(fbm3(q * 1.6 + uFlow * 0.25), fbm3(q * 1.6 + 7.0 - uFlow * 0.2), fbm3(q * 1.6 + 13.0));
    float f = fbm3(q * 2.4 + w * (1.2 + uBass * 0.8) + vec3(0.0, uFlow * 0.4, 0.0));
    float ridge = pow(1.0 - abs(f), 7.0);
    float cells = fbm3(q * 4.5 - uFlow * 0.3) * 0.5 + 0.5;
    float fres = pow(1.0 - max(dot(n, -rd), 0.0), 2.5);
    float heat = clamp(0.1 + ridge * 0.85 + cells * 0.12 + fres * 0.3 + uFlash * 0.15, 0.0, 1.0);
    vec3 surf = plasmaColor(heat) * (0.12 + ridge * 2.2 + fres * 0.6 + uBass * 0.35);
    // Kern scheint durch die Mitte
    surf += plasmaColor(0.85) * pow(max(dot(n, -rd), 0.0), 8.0) * (0.15 + uBass * 0.6);
    col = col * fres + surf;
  }

  // Hauchfeiner Nebel im Hintergrund
  float neb = snoise(uv * 0.8 + uTime * 0.01) * 0.5 + 0.5;
  col += plasmaColor(0.3) * neb * 0.006;
  gl_FragColor = vec4(tint(col), 1.0);
}
`;

// Blitze schießen auf Kicks aus der Oberfläche
const arcGlsl = `
${tint}
${hue}
uniform vec3 uArcDir[${ARCS}];
uniform float uArcLife[${ARCS}];
uniform float uArcSeed[${ARCS}];
uniform float uHue;
float n1(float x) { return fract(sin(x * 91.7) * 43758.5); }
float vnoise(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(n1(i), n1(i + 1.0), f) * 2.0 - 1.0; }
int arcIndex(float line) { return int(floor(line * ${ARCS - 1}.0 + 0.5)); }
vec3 linePos(float line, float t) {
  int i = arcIndex(line);
  vec3 d = normalize(uArcDir[i]);
  vec3 s = normalize(cross(d, abs(d.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 u = cross(d, s);
  float sd = uArcSeed[i];
  float len = 0.5 + n1(sd) * 0.9;
  float env = sin(t * 3.14159);
  float jag = vnoise(t * 14.0 + sd * 20.0 + uTime * 30.0) * 0.6 + vnoise(t * 37.0 + sd * 9.0 - uTime * 50.0) * 0.4;
  float jag2 = vnoise(t * 11.0 + sd * 13.0 - uTime * 25.0);
  vec3 bend = (s * jag + u * jag2) * 0.14 * env;
  // Leicht gekrümmt, als folge der Blitz einer Feldlinie
  vec3 curve = s * sin(t * 2.0) * 0.25 * (n1(sd + 3.0) - 0.5);
  return d * (${RADIUS.toFixed(3)} + t * len) + bend + curve * t;
}
float lineIntensity(float line, float t) {
  float life = uArcLife[arcIndex(line)];
  return life * life * 3.0 * (1.0 - t * 0.7);
}
vec3 lineColor(float line, float t) { return tint(mix(hue2rgb(fract(uHue + 0.52)), vec3(1.0), 0.6)); }
`;

// Zwei Umlaufbahnen aus der Wellenform
const ringGlsl = `
${tint}
${hue}
uniform sampler2D uWave;
uniform float uWaveRow;
uniform mat3 uRingRot[2];
uniform float uHue;
uniform float uEnergy;
vec3 linePos(float line, float t) {
  int k = int(floor(line + 0.5));
  float a = t * 6.2831853;
  float w = texture(uWave, vec2(fract(t * 2.0 + float(k) * 0.37), uWaveRow)).r;
  float r = (k == 0 ? 1.35 : 1.7) + w * 0.06 * (0.4 + uEnergy);
  return uRingRot[k] * vec3(cos(a) * r, w * 0.05, sin(a) * r);
}
float lineIntensity(float line, float t) { return 0.6 + uEnergy * 1.2; }
vec3 lineColor(float line, float t) {
  int k = int(floor(line + 0.5));
  return tint(hue2rgb(fract(uHue + (k == 0 ? 0.52 : 0.86))));
}
`;

class PlasmaCore implements VisualMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 100);
  private history!: SpectrumHistory;
  private wave!: WaveHistory;
  private orb!: FullscreenPass;
  private arcs!: LineSet;
  private rings!: LineSet;
  private stars!: Starfield;
  private height = 1080;
  private time = 0;
  private flow = 0;
  private flash = 0;
  private hue = 0;
  private arcNext = 0;
  private readonly arcDir = Array.from({ length: ARCS }, () => new THREE.Vector3(0, 1, 0));
  private readonly arcLife = new Float32Array(ARCS);
  private readonly arcSeed = new Float32Array(ARCS);
  private readonly spin = new THREE.Matrix3();
  private readonly ringRot = [new THREE.Matrix3(), new THREE.Matrix3()];
  private readonly euler = new THREE.Euler();
  private readonly m4 = new THREE.Matrix4();

  init(ctx: ModeContext) {
    this.history = new SpectrumHistory(ROWS);
    this.wave = new WaveHistory(1, 60, 4);
    const shared = { uPalette: { value: ctx.palette }, uPaletteMix: ctx.paletteMix, uHue: { value: 0 } };
    this.orb = new FullscreenPass(orbFrag, {
      ...shared,
      uSpecHist: { value: this.history.texture },
      uTime: { value: 0 },
      uFlow: { value: 0 },
      uBass: { value: 0 },
      uFlash: { value: 0 },
      uSpin: { value: this.spin },
    });
    this.arcs = new LineSet({
      lines: ARCS, points: 64, width: 1.8, palette: ctx.palette, glsl: arcGlsl,
      uniforms: {
        uPaletteMix: ctx.paletteMix, uHue: shared.uHue,
        uArcDir: { value: this.arcDir }, uArcLife: { value: this.arcLife }, uArcSeed: { value: this.arcSeed },
      },
    });
    this.rings = new LineSet({
      lines: 2, points: 720, width: 2.0, palette: ctx.palette, glsl: ringGlsl,
      uniforms: {
        uPaletteMix: ctx.paletteMix, uHue: shared.uHue,
        uWave: { value: this.wave.texture }, uWaveRow: { value: this.wave.rowCoord(0) },
        uRingRot: { value: this.ringRot }, uEnergy: { value: 0 },
      },
    });
    for (const l of [this.arcs, this.rings]) {
      l.uniforms.uFocus.value = DIST;
      l.uniforms.uDof.value = 1.2;
    }
    this.stars = new Starfield(2000, 80, 0.5);
    this.scene.add(this.stars.points, this.rings.mesh, this.arcs.mesh);
    this.camera.position.set(0, 0, DIST);
    this.camera.lookAt(0, 0, 0);
  }

  resize(width: number, height: number) {
    this.height = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.orb.resize(width, height);
    this.arcs.uniforms.uRes.value.set(width, height);
    this.rings.uniforms.uRes.value.set(width, height);
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    this.history.update(a);
    this.wave.update(a);
    this.flow += dt * (0.4 + a.energy * 1.2);
    this.flash = Math.max(this.flash * Math.exp(-dt * 6), a.beat ? 0.6 + a.bassRaw * 0.6 : 0);
    this.hue = (this.hue + dt * 0.008) % 1;

    // Blitze: jeder Kick zündet zwei, sie verglühen schnell
    for (let i = 0; i < ARCS; i++) this.arcLife[i] = Math.max(0, this.arcLife[i] - dt * 3.2);
    if (a.beat) {
      for (let k = 0; k < 2; k++) {
        const i = this.arcNext;
        this.arcNext = (this.arcNext + 1) % ARCS;
        this.arcDir[i].set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 0.8 + 0.2).normalize();
        this.arcLife[i] = 0.7 + a.bassRaw * 0.5;
        this.arcSeed[i] = Math.random() * 100;
      }
    }

    this.euler.set(this.time * 0.05, this.time * 0.11, 0);
    this.spin.setFromMatrix4(this.m4.makeRotationFromEuler(this.euler));
    this.euler.set(1.25 + Math.sin(this.time * 0.2) * 0.1, this.time * 0.3, 0.2);
    this.ringRot[0].setFromMatrix4(this.m4.makeRotationFromEuler(this.euler));
    this.euler.set(1.05, -this.time * 0.22, -0.45 + Math.sin(this.time * 0.15) * 0.1);
    this.ringRot[1].setFromMatrix4(this.m4.makeRotationFromEuler(this.euler));

    const o = this.orb.uniforms;
    o.uTime.value = this.time;
    o.uFlow.value = this.flow;
    o.uBass.value = a.bass;
    o.uFlash.value = this.flash;
    o.uHue.value = this.hue;
    for (const l of [this.arcs, this.rings]) l.uniforms.uTime.value = this.time;
    this.rings.uniforms.uEnergy.value = a.energy;
    this.stars.update(this.time, this.height);
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    this.orb.render(renderer, target);
    renderOver(renderer, target, this.scene, this.camera);
  }

  dispose() {
    this.history.dispose();
    this.wave.dispose();
    this.orb.dispose();
    this.arcs.dispose();
    this.rings.dispose();
    this.stars.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('plasma-core').meta,
  create: () => new PlasmaCore(),
};
export default definition;
