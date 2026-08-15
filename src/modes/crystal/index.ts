import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { FullscreenPass } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { palette } from '../../shared/glsl';
import { studioGlsl } from '../../shared/studio';

// Dispersion: drei Brechungsindizes für R, G und B
const frag = `
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform mat3 uRot;
uniform float uScale;
uniform float uFlash;
${palette}
${studioGlsl}

const float PHI = 1.618034;

// Lichtstreifen rundherum für Funkeln und Regenbogenkanten
vec3 env(vec3 d) {
  float phi = atan(d.x, d.z) + uStudioSpin * 2.0;
  float strips = pow(0.5 + 0.5 * cos(phi * 9.0), 60.0) * smoothstep(-0.5, 0.0, d.y) * smoothstep(0.9, 0.2, d.y);
  vec3 c = mix(vec3(1.0), pal(fract(phi / 6.2831 + 0.5)), 0.5);
  return studio(d) + c * strips * 3.0;
}

float gem(vec3 p) {
  p = uRot * p / uScale;
  vec3 a = abs(p);
  // Ikosaeder über seine Flächennormalen
  vec3 n1 = normalize(vec3(1.0, 1.0, 1.0));
  vec3 n2 = normalize(vec3(0.0, 1.0 / PHI, PHI));
  vec3 n3 = normalize(vec3(1.0 / PHI, PHI, 0.0));
  vec3 n4 = normalize(vec3(PHI, 0.0, 1.0 / PHI));
  float d = max(max(dot(a, n1), dot(a, n2)), max(dot(a, n3), dot(a, n4))) - 1.0;
  // Mit einem Oktaeder anschneiden: zusätzliche Facetten
  float oct = (a.x + a.y + a.z) * 0.5773 - 1.04;
  return max(d, oct) * uScale;
}

vec3 gemNormal(vec3 p) {
  vec2 e = vec2(0.0015, 0.0);
  return normalize(vec3(gem(p + e.xyy) - gem(p - e.xyy), gem(p + e.yxy) - gem(p - e.yxy), gem(p + e.yyx) - gem(p - e.yyx)));
}

void main() {
  vec2 uv = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  vec3 ro = vec3(0.0, 0.0, 5.0);
  vec3 rd = normalize(vec3(uv, -1.8));
  vec3 col = studio(rd) * 0.1;

  float t = 2.0;
  bool hit = false;
  for (int i = 0; i < 80; i++) {
    float d = gem(ro + rd * t);
    if (d < 0.0005) { hit = true; break; }
    t += d;
    if (t > 9.0) break;
  }

  if (hit) {
    vec3 p = ro + rd * t;
    vec3 n = gemNormal(p);
    float cosI = max(dot(-rd, n), 0.0);
    float fres = 0.04 + 0.96 * pow(1.0 - cosI, 5.0);
    vec3 refl = env(reflect(rd, n));

    // Eintritt mit mittlerem Index, bis zur Austrittsfläche laufen
    vec3 rIn = refract(rd, n, 1.0 / 1.55);
    vec3 q = p - n * 0.003;
    float travel = 0.0;
    for (int i = 0; i < 40; i++) {
      float d = -gem(q);
      if (d < 0.0008) break;
      q += rIn * d;
      travel += d;
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
    // Leichte Eigenfarbe und Absorption mit der Weglänge
    vec3 tint = mix(vec3(1.0), pal(0.7), 0.08);
    trans *= tint * exp(-travel * 0.15);
    col = mix(trans, refl, fres) + refl * 0.06;
    col += pal(0.85) * uFlash * 0.4 * (1.0 - cosI);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

class Crystal implements VisualMode {
  private pass!: FullscreenPass;
  private readonly rot = new THREE.Matrix3();
  private readonly euler = new THREE.Euler();
  private readonly m4 = new THREE.Matrix4();
  private spin = 0;
  private spinVel = 0.3;
  private flash = 0;
  private time = 0;

  init(ctx: ModeContext) {
    this.pass = new FullscreenPass(frag, {
      uRot: { value: this.rot },
      uScale: { value: 1 },
      uFlash: { value: 0 },
      uStudioSpin: { value: 0 },
      uPalette: { value: ctx.palette },
    });
  }

  resize(width: number, height: number) {
    this.pass.resize(width, height);
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    // Kick gibt Schwung, dann zurück auf Grundtempo
    if (a.beat) {
      this.spinVel += 0.8 + a.bassRaw;
      this.flash = 1;
    }
    this.spinVel += (0.25 + a.mid * 0.5 - this.spinVel) * Math.min(dt * 1.5, 1);
    this.spin += this.spinVel * dt;
    this.flash *= Math.exp(-dt * 6);
    this.euler.set(this.spin * 0.7, this.spin, Math.sin(this.time * 0.2) * 0.3);
    this.m4.makeRotationFromEuler(this.euler);
    this.rot.setFromMatrix4(this.m4);
    const u = this.pass.uniforms;
    u.uScale.value = 0.78 * (1 + a.bass * 0.05 + a.bassRaw * 0.03);
    u.uFlash.value = this.flash;
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
