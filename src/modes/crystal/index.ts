import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { FullscreenPass } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { palette, tint } from '../../shared/glsl';
import { studioGlsl } from '../../shared/studio';

const SATS = 5;

// Ein doppelendiger Bergkristall mit Phantom im Inneren, umkreist von kleinen Spitzen
const frag = `
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform mat3 uRot;
uniform float uScale;
uniform float uFlash;
uniform float uCore;
uniform float uTime;
uniform vec3 uSatPos[${SATS}];
uniform mat3 uSatRot[${SATS}];
uniform vec2 uSatSize[${SATS}];
${palette}
${tint}
${studioGlsl}

// Lichtstreifen rundherum für Funkeln und Regenbogenkanten
vec3 env(vec3 d) {
  float phi = atan(d.x, d.z) + uStudioSpin * 2.0;
  float strips = pow(0.5 + 0.5 * cos(phi * 9.0), 60.0) * smoothstep(-0.5, 0.0, d.y) * smoothstep(0.9, 0.2, d.y);
  vec3 c = mix(vec3(1.0), pal(fract(phi / 6.2831 + 0.5)), 0.5);
  return studio(d) + c * strips * 3.0;
}

// Quarz: sechseckiges Prisma, an beiden Enden sechsseitige Spitzen
float quartz(vec3 p, float r, float len) {
  vec2 q = abs(p.xz);
  float hx = max(q.x * 0.8660254 + q.y * 0.5, q.y);
  float side = hx - r;
  // Spitzenflächen fluchten mit den Prismenflächen, Winkel wie beim echten Quarz
  float top = (hx - r) * 0.79 + (p.y - len) * 0.61;
  float bot = (hx - r) * 0.79 + (-p.y - len) * 0.61;
  return max(side, max(top, bot));
}

float mainGem(vec3 p) { return quartz(uRot * p / uScale, 0.42, 0.78) * uScale; }

float sats(vec3 p) {
  float d = 1e3;
  for (int i = 0; i < ${SATS}; i++) {
    vec3 q = uSatRot[i] * (p - uSatPos[i]);
    d = min(d, quartz(q, uSatSize[i].x, uSatSize[i].y));
  }
  return d;
}

float gem(vec3 p) { return min(mainGem(p), sats(p)); }

vec3 gemNormal(vec3 p) {
  vec2 e = vec2(0.0012, 0.0);
  return normalize(vec3(gem(p + e.xyy) - gem(p - e.xyy), gem(p + e.yxy) - gem(p - e.yxy), gem(p + e.yyx) - gem(p - e.yyx)));
}

vec3 glowCol() { return tint(mix(pal(0.72), vec3(0.75, 0.55, 1.0), 0.35)); }

void main() {
  vec2 uv = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  vec3 ro = vec3(0.0, 0.0, 5.6);
  vec3 rd = normalize(vec3(uv, -1.8));
  // Dunkler Raum mit weichem Hof hinter dem Kristall
  // Studiolicht nur in Spiegelungen, der sichtbare Hintergrund bleibt ruhig
  vec3 col = mix(vec3(0.004, 0.003, 0.006), vec3(0.001), smoothstep(0.0, 1.0, length(uv))) + glowCol() * exp(-dot(uv, uv) * 5.0) * (0.03 + uCore * 0.05);

  float t = 2.0;
  bool hit = false;
  for (int i = 0; i < 110; i++) {
    float d = gem(ro + rd * t);
    if (d < 0.0005) { hit = true; break; }
    t += d * 0.9;
    if (t > 10.0) break;
  }

  if (hit) {
    vec3 p = ro + rd * t;
    vec3 n = gemNormal(p);
    float cosI = max(dot(-rd, n), 0.0);
    float fres = 0.04 + 0.96 * pow(1.0 - cosI, 5.0);
    vec3 refl = env(reflect(rd, n));
    bool isMain = mainGem(p) < sats(p);

    // Durch den Kristall laufen und unterwegs das Leuchten im Inneren sammeln
    vec3 rIn = refract(rd, n, 1.0 / 1.55);
    vec3 q = p - n * 0.003;
    float travel = 0.0;
    vec3 inner = vec3(0.0);
    for (int i = 0; i < 48; i++) {
      float d = -gem(q);
      if (d < 0.0008) break;
      float stepLen = min(d, 0.06);
      if (isMain) {
        vec3 lq = uRot * q / uScale;
        // Phantom: ein kleinerer Geisterkristall, dessen Flächen schwach leuchten
        float ph = abs(quartz(lq, 0.24, 0.42));
        inner += glowCol() * exp(-ph * 160.0) * stepLen * (2.0 + uCore * 4.0);
        // Energiekern entlang der Achse
        float axis = length(lq.xz);
        inner += glowCol() * exp(-axis * axis * 400.0) * stepLen * (0.8 + uCore * 9.0) * smoothstep(0.7, 0.15, abs(lq.y));
      }
      q += rIn * stepLen;
      travel += stepLen;
    }
    vec3 nOut = -gemNormal(q);
    // Dispersion: drei Indizes, drei Austrittsrichtungen
    vec3 iors = vec3(1.52, 1.55, 1.585);
    vec3 trans = vec3(0.0);
    for (int c = 0; c < 3; c++) {
      vec3 rOut = refract(rIn, nOut, iors[c]);
      // Totalreflexion: kommt als Funkeln zurück
      vec3 dir = dot(rOut, rOut) < 0.01 ? reflect(rIn, nOut) : rOut;
      trans[c] = env(dir)[c];
    }
    // Leichter Rauchquarz-Schimmer, Absorption mit der Weglänge
    vec3 body = mix(vec3(1.0), vec3(0.9, 0.9, 1.0), 0.5);
    trans *= body * exp(-travel * 0.4);
    col = mix(trans + inner, refl, fres) + refl * 0.05;
    // Kanten: dort wo zwei Flächen sich treffen, blitzt es
    vec2 e = vec2(0.006, 0.0);
    float edge = length(gemNormal(p + e.xyy) - gemNormal(p - e.xyy)) + length(gemNormal(p + e.yxy) - gemNormal(p - e.yxy));
    col += vec3(1.0) * smoothstep(0.4, 1.2, edge) * (0.12 + uFlash * 0.5);
    col += glowCol() * uFlash * 0.25 * (1.0 - cosI);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

class Crystal implements VisualMode {
  private pass!: FullscreenPass;
  private readonly rot = new THREE.Matrix3();
  private readonly euler = new THREE.Euler();
  private readonly m4 = new THREE.Matrix4();
  private readonly satPos = Array.from({ length: SATS }, () => new THREE.Vector3());
  private readonly satRot = Array.from({ length: SATS }, () => new THREE.Matrix3());
  private readonly satSize = Array.from({ length: SATS }, () => new THREE.Vector2());
  private readonly seeds = Array.from({ length: SATS }, () => Math.random() * 10);
  private spin = 0;
  private spinVel = 0.3;
  private flash = 0;
  private core = 0;
  private orbit = 0;
  private time = 0;

  init(ctx: ModeContext) {
    for (let i = 0; i < SATS; i++) this.satSize[i].set(0.1 + Math.random() * 0.08, 0.14 + Math.random() * 0.2);
    this.pass = new FullscreenPass(frag, {
      uRot: { value: this.rot },
      uScale: { value: 1 },
      uFlash: { value: 0 },
      uCore: { value: 0 },
      uTime: { value: 0 },
      uStudioSpin: { value: 0 },
      uSatPos: { value: this.satPos },
      uSatRot: { value: this.satRot },
      uSatSize: { value: this.satSize },
      uPalette: { value: ctx.palette },
      uPaletteMix: ctx.paletteMix,
    });
  }

  resize(width: number, height: number) {
    this.pass.resize(width, height);
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    // Kick gibt Schwung und lässt das Innere aufleuchten
    if (a.beat) {
      this.spinVel += 0.5 + a.bassRaw * 0.7;
      this.flash = 1;
    }
    this.spinVel += (0.2 + a.mid * 0.4 - this.spinVel) * Math.min(dt * 1.5, 1);
    this.spin += this.spinVel * dt;
    this.flash *= Math.exp(-dt * 6);
    this.core += (a.bass * 0.8 + this.flash * 0.5 - this.core) * Math.min(dt * 8, 1);
    this.orbit += dt * (0.25 + a.energy * 0.5);

    // Hauptkristall steht schräg und dreht sich um seine Längsachse
    this.euler.set(0.35 + Math.sin(this.time * 0.15) * 0.15, this.spin, 0.5 + Math.sin(this.time * 0.11) * 0.1, 'ZXY');
    this.m4.makeRotationFromEuler(this.euler).invert();
    this.rot.setFromMatrix4(this.m4);

    // Kleine Spitzen kreisen in einem schiefen Ring
    for (let i = 0; i < SATS; i++) {
      const s = this.seeds[i];
      const ang = this.orbit + (i / SATS) * Math.PI * 2;
      const r = 1.55 + Math.sin(this.time * 0.3 + s) * 0.12;
      this.satPos[i].set(Math.cos(ang) * r, Math.sin(ang) * r * 0.35 + Math.sin(this.time * 0.5 + s) * 0.1, Math.sin(ang) * r * 0.6);
      this.euler.set(this.time * (0.3 + i * 0.07) + s, s * 2.0, this.time * 0.2 + s);
      this.m4.makeRotationFromEuler(this.euler).invert();
      this.satRot[i].setFromMatrix4(this.m4);
    }

    const u = this.pass.uniforms;
    u.uScale.value = 0.92 * (1 + a.bass * 0.04 + this.flash * 0.02);
    u.uFlash.value = this.flash;
    u.uCore.value = this.core;
    u.uTime.value = this.time;
    u.uStudioSpin.value = this.time * 0.05;
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    this.pass.render(renderer, target);
  }

  dispose() {
    this.pass.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('crystal').meta,
  create: () => new Crystal(),
};
export default definition;
