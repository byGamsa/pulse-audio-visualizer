import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { Motes } from '../../engine/field/Motes';
import { SpectrumHistory, spectrumHistoryGlsl } from '../../engine/field/SpectrumHistory';
import { LineSet } from '../../engine/field/primitives';
import { FullscreenPass, renderOver } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { hash, hue, palette, simplex2, tint } from '../../shared/glsl';

const ROWS = 60;
const VESICLES = 7;
const CILIA = 1400;
const DIST = 4.4;
// Gleiche Brennweite wie der Raymarcher (rd.z = -1.5)
const FOV = (2 * Math.atan(0.5 / 1.5) * 180) / Math.PI;

// Gemeinsame Form von Membran und Wimpern
const shapeGlsl = `
uniform float uBud;
uniform vec3 uBudDir;
uniform float uBreath;

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// Weiche, verwundene Wellen statt starrer Sinusraster
float wobble(vec3 p, float t) {
  vec3 q = p + 0.35 * vec3(sin(p.y * 2.3 + t * 0.7), sin(p.z * 2.1 - t * 0.6), sin(p.x * 2.5 + t * 0.5));
  return sin(q.x * 3.1 + t * 0.9) * sin(q.y * 2.7 - t * 0.8) * sin(q.z * 2.9 + t * 0.6);
}
`;

const cellFrag = `
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uHue;
uniform vec3 uVes[${VESICLES}];
uniform vec3 uNucleus;
${palette}
${tint}
${hash}
${hue}
${simplex2}
${spectrumHistoryGlsl(ROWS)}
${shapeGlsl}

float membrane(vec3 p) {
  vec3 q = p / vec3(1.08, 0.94, 1.0);
  float body = length(q) - 0.95 - uBreath;
  // Tochterzelle knospt auf starken Kicks
  vec3 bc = uBudDir * (0.95 + uBud * 0.55);
  float bud = length(p - bc) - (0.12 + uBud * 0.42);
  float d = smin(body, bud, 0.35);
  vec3 n = normalize(p + 1e-4);
  float band = acos(clamp(n.y, -1.0, 1.0)) / 3.14159;
  float e = specAt(band * 0.8, 0.05);
  return d - (0.025 + e * 0.11) * wobble(p * 1.4, uTime);
}

vec3 normalAt(vec3 p) {
  vec2 k = vec2(0.002, 0.0);
  return normalize(vec3(membrane(p + k.xyy) - membrane(p - k.xyy), membrane(p + k.yxy) - membrane(p - k.yxy), membrane(p + k.yyx) - membrane(p - k.yyx)));
}

vec3 col3(float off) { return hue2rgb(fract(uHue + off)); }

// Leuchten der Organellen im Inneren
vec3 organelles(vec3 p) {
  vec3 c = vec3(0.0);
  // Zellkern: klar umrissene Hülle, darin ein heller Nukleolus
  float dn = length(p - uNucleus) - 0.28 - uBass * 0.05;
  vec3 nuc = mix(col3(0.92), vec3(1.0, 0.75, 0.55), 0.35);
  c += nuc * exp(-abs(dn) * 40.0) * 1.4;
  c += nuc * 0.25 * step(dn, 0.0) * (0.6 + uBass);
  c += vec3(1.0, 0.92, 0.85) * exp(-max(length(p - uNucleus - vec3(0.06, 0.04, 0.0)) - 0.06, 0.0) * 30.0) * 1.6;
  for (int i = 0; i < ${VESICLES}; i++) {
    float dv = length(p - uVes[i]) - 0.07;
    c += col3(0.1 + float(i) * 0.05) * (exp(-abs(dv) * 55.0) * 2.0 + step(dv, 0.0) * 0.4) * (0.7 + uMid * 1.6);
  }
  // Feine Körnchen im Zytoplasma
  float gran = wobble(p * 11.0, uTime * 0.3);
  c += col3(0.5) * smoothstep(0.75, 0.95, gran) * 0.25;
  return c;
}

void main() {
  vec2 uv = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  vec3 ro = vec3(0.0, 0.0, ${DIST.toFixed(2)});
  vec3 rd = normalize(vec3(uv, -1.5));

  // Tiefsee: dunkles Petrol, schwache Lichtschleier von oben
  float shaft = pow(max(snoise(vec2(uv.x * 3.0 + uTime * 0.03, 0.0)) * 0.5 + 0.5, 0.0), 3.0);
  vec3 col = mix(vec3(0.0015, 0.004, 0.006), vec3(0.004, 0.012, 0.016), smoothstep(-0.6, 0.6, uv.y));
  col += col3(0.5) * shaft * smoothstep(-0.2, 0.7, uv.y) * 0.01;

  float t = 2.4;
  bool hit = false;
  for (int i = 0; i < 96; i++) {
    float d = membrane(ro + rd * t);
    if (d < 0.0008) { hit = true; break; }
    t += d * 0.7;
    if (t > 7.0) break;
  }

  if (hit) {
    vec3 p = ro + rd * t;
    vec3 n = normalAt(p);
    float facing = max(dot(n, -rd), 0.0);
    float fres = pow(1.0 - facing, 3.0);
    // Ins Innere schauen: leicht gebrochener Strahl sammelt Licht der Organellen
    vec3 rr = refract(rd, n, 0.92);
    vec3 inner = vec3(0.0);
    float travel = 0.0;
    for (int i = 0; i < 28; i++) {
      vec3 q = p + rr * (0.04 + float(i) * 0.065);
      if (membrane(q) > 0.0) break;
      inner += organelles(q) * 0.065;
      travel += 0.065;
    }
    // Zytoplasma: je tiefer, desto mehr türkiser Dunst
    vec3 cyto = col3(0.48) * (0.02 + travel * 0.035) * (0.6 + uMid);
    // Schillernde Membran
    vec3 film = mix(col3(0.45), col3(0.75), 0.5 + 0.5 * sin(fres * 9.0 + uTime * 0.4));
    vec3 l = normalize(vec3(-0.4, 0.8, 0.5));
    float spec = pow(max(dot(reflect(-l, n), -rd), 0.0), 60.0);
    col = col * (1.0 - facing * 0.6) + cyto + inner * (0.4 + facing * 0.6);
    col += film * fres * (0.55 + uTreble * 0.8 + uBass * 0.4);
    col += vec3(1.0) * spec * 0.6;
  }

  gl_FragColor = vec4(tint(col), 1.0);
}
`;

// Wimpern: feine Härchen am Rand, die mit den Höhen schlagen
const ciliaGlsl = `
${tint}
${hue}
${shapeGlsl}
uniform float uHue;
uniform float uBeatWave;
uniform float uTreble;
float h1(float x) { return fract(sin(x * 91.345) * 47453.5453); }
vec3 baseDir(float id) {
  float k = id + 0.5;
  float y = 1.0 - 2.0 * k / ${CILIA}.0;
  float r = sqrt(max(1.0 - y * y, 0.0));
  float th = k * 2.39996323;
  return vec3(cos(th) * r, y, sin(th) * r);
}
vec3 linePos(float line, float t) {
  float id = floor(line * ${CILIA - 1}.0 + 0.5);
  vec3 n = baseDir(id);
  vec3 base = n * vec3(1.08, 0.94, 1.0) * (0.95 + uBreath) * 1.02;
  vec3 side = normalize(cross(n, vec3(0.3, 1.0, 0.2)));
  // Schlagbewegung läuft wie eine Welle um die Zelle
  float beat = sin(uTime * (3.0 + uTreble * 6.0) + n.y * 6.0 + h1(id) * 2.0 + uBeatWave);
  vec3 dir = normalize(n + side * beat * 0.6 * t);
  float len = 0.12 + h1(id + 7.0) * 0.1 + uTreble * 0.08;
  return base + dir * len * t;
}
float lineIntensity(float line, float t) { return 0.22 * (1.0 - t * 0.7) * (0.6 + uTreble * 1.4); }
vec3 lineColor(float line, float t) { return tint(mix(hue2rgb(fract(uHue + 0.47)), vec3(1.0), 0.35)); }
`;

class Organism implements VisualMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 60);
  private history!: SpectrumHistory;
  private pass!: FullscreenPass;
  private cilia!: LineSet;
  private motes!: Motes;
  private height = 1080;
  private readonly ves = Array.from({ length: VESICLES }, () => new THREE.Vector3());
  private readonly seeds = Array.from({ length: VESICLES }, () => Math.random() * 100);
  private readonly nucleus = new THREE.Vector3();
  private readonly budDir = new THREE.Vector3(1, 0.3, 0.2).normalize();
  private time = 0;
  private phase = 0;
  private bud = 0;
  private budVel = 0;
  private breath = 0;
  private beatWave = 0;
  private hue = 0;

  init(ctx: ModeContext) {
    this.history = new SpectrumHistory(ROWS);
    const shared = {
      uBud: { value: 0 }, uBudDir: { value: this.budDir }, uBreath: { value: 0 }, uHue: { value: 0 },
      uTreble: { value: 0 }, uPalette: { value: ctx.palette }, uPaletteMix: ctx.paletteMix,
    };
    this.pass = new FullscreenPass(cellFrag, {
      ...shared,
      uSpecHist: { value: this.history.texture },
      uTime: { value: 0 }, uBass: { value: 0 }, uMid: { value: 0 },
      uVes: { value: this.ves }, uNucleus: { value: this.nucleus },
    });
    this.cilia = new LineSet({
      lines: CILIA, points: 6, width: 1.0, palette: ctx.palette, glsl: ciliaGlsl,
      uniforms: { ...shared, uBeatWave: { value: 0 } },
    });
    this.cilia.uniforms.uFocus.value = DIST;
    this.cilia.uniforms.uDof.value = 1.5;
    this.motes = new Motes({
      count: 260,
      box: new THREE.Vector3(5, 3.5, 3),
      drift: new THREE.Vector3(0.04, 0.12, 0.02),
      size: 4,
      color: new THREE.Color(0.6, 1, 0.9),
      focus: DIST,
      dof: 4,
    });
    this.scene.add(this.motes.points, this.cilia.mesh);
    this.camera.position.set(0, 0, DIST);
    this.camera.lookAt(0, 0, 0);
  }

  resize(width: number, height: number) {
    this.height = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.pass.resize(width, height);
    this.cilia.uniforms.uRes.value.set(width, height);
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    this.history.update(a);
    this.phase += dt * (0.3 + a.mid * 0.9);
    this.breath += (a.bass * 0.06 - this.breath) * Math.min(dt * 5, 1);
    this.hue = (this.hue + dt * 0.006) % 1;
    this.beatWave += dt * (1 + a.energy * 3) + (a.beat ? 1.2 : 0);

    // Starker Kick: eine Tochterzelle knospt und wird wieder aufgenommen
    if (a.beat && a.bassRaw > 0.5 && this.bud < 0.15) {
      this.budVel += 2.4 + a.bassRaw * 1.4;
      this.budDir.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() * 0.5).normalize();
    }
    this.budVel += (-this.bud * 10 - this.budVel * 3.2) * dt;
    this.bud = Math.max(this.bud + this.budVel * dt, 0);

    // Kern und Bläschen treiben langsam durch das Zellinnere
    this.nucleus.set(Math.sin(this.phase * 0.3) * 0.18, Math.cos(this.phase * 0.23) * 0.12, Math.sin(this.phase * 0.17) * 0.15);
    for (let i = 0; i < VESICLES; i++) {
      const s = this.seeds[i];
      const t = this.phase * (0.4 + (i % 3) * 0.15) + s;
      const r = 0.45 + 0.15 * Math.sin(t * 0.8 + s);
      this.ves[i].set(Math.cos(t) * r, Math.sin(t * 1.3 + s) * 0.45, Math.sin(t) * r * 0.7);
    }

    const u = this.pass.uniforms;
    u.uTime.value = this.time;
    u.uBass.value = a.bass;
    u.uMid.value = a.mid;
    u.uTreble.value = a.treble;
    u.uBud.value = this.bud;
    u.uBreath.value = this.breath;
    u.uHue.value = this.hue;
    const c = this.cilia.uniforms;
    c.uTime.value = this.time;
    c.uBeatWave.value = this.beatWave;
    this.motes.update(this.time, this.height);
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    this.pass.render(renderer, target);
    renderOver(renderer, target, this.scene, this.camera);
  }

  dispose() {
    this.history.dispose();
    this.pass.dispose();
    this.cilia.dispose();
    this.motes.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('organism').meta,
  create: () => new Organism(),
};
export default definition;
