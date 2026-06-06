import type * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { FullscreenPass } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { hash, palette } from '../../shared/glsl';

const frag = `
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uSwell;
uniform float uChop;
uniform float uRipple;
uniform float uTreble;
uniform float uMoon;
${palette}
${hash}

const vec3 MOON = normalize(vec3(0.18, 0.2, 1.0));

// Spitze Wellenkämme: Sinus nach oben gestaucht
float crest(float x) {
  float s = 0.5 + 0.5 * sin(x);
  return s * s * 2.0 - 1.0;
}

// Dünung (Bass), Kabbelung (Mitten), Kräuseln (Höhen)
float height(vec2 p) {
  float t = uTime;
  float h = 0.0;
  h += crest(dot(p, vec2(0.12, 0.99)) * 0.55 + t * 0.55) * uSwell;
  h += crest(dot(p, vec2(-0.45, 0.89)) * 0.42 + t * 0.47) * uSwell * 0.7;
  h += crest(dot(p, vec2(0.7, 0.71)) * 1.5 + t * 1.1) * uChop;
  h += crest(dot(p, vec2(-0.85, 0.53)) * 1.9 + t * 1.3) * uChop * 0.8;
  h += crest(dot(p, vec2(0.31, -0.95)) * 2.6 + t * 1.6) * uChop * 0.5;
  h += sin(dot(p, vec2(0.93, 0.37)) * 6.5 + t * 2.4) * uRipple;
  h += sin(dot(p, vec2(-0.2, 0.98)) * 8.1 + t * 2.9) * uRipple * 0.7;
  return h;
}

vec3 sky(vec3 rd) {
  float y = max(rd.y, 0.0);
  vec3 col = mix(pal(0.14) * 0.09, pal(0.04) * 0.02, pow(y, 0.5));
  // Sterne
  vec2 sp = rd.xy / max(rd.z, 0.05) * 180.0;
  float hs = hash12(floor(sp));
  if (hs > 0.982) {
    float d = length(fract(sp) - 0.5);
    col += vec3(0.9, 0.95, 1.0) * exp(-d * d * 50.0) * smoothstep(0.03, 0.2, y) * (0.5 + 0.5 * sin(uTime * 2.0 + hs * 40.0));
  }
  // Mond mit Hof
  float m = dot(rd, MOON);
  col += vec3(1.0, 0.97, 0.9) * smoothstep(0.99955, 0.9997, m) * 5.0 * uMoon;
  col += pal(0.7) * pow(max(m, 0.0), 200.0) * 0.6 * uMoon + pal(0.5) * pow(max(m, 0.0), 12.0) * 0.08;
  return col;
}

void main() {
  vec2 uv = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  vec3 ro = vec3(0.0, 1.4, uTime * 0.6);
  vec3 rd = normalize(vec3(uv.x, uv.y + 0.02, 1.25));

  vec3 col;
  if (rd.y > 0.0) {
    col = sky(rd);
  } else {
    // Schrittweite proportional zum Abstand zur Oberfläche
    float t = 0.0;
    vec3 p = ro;
    for (int i = 0; i < 72; i++) {
      p = ro + rd * t;
      float d = p.y - height(p.xz);
      if (d < 0.002 * t || t > 90.0) break;
      t += max(d * 0.6, 0.01 * t + 0.01);
    }
    float e = 0.01 + t * 0.002;
    vec3 n = normalize(vec3(
      height(p.xz - vec2(e, 0.0)) - height(p.xz + vec2(e, 0.0)),
      2.0 * e,
      height(p.xz - vec2(0.0, e)) - height(p.xz + vec2(0.0, e))
    ));
    // In der Ferne flacher werden, sonst flimmert der Horizont
    n = normalize(mix(n, vec3(0.0, 1.0, 0.0), smoothstep(20.0, 80.0, t)));
    vec3 r = reflect(rd, n);
    r.y = abs(r.y);
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(-rd, n), 0.0), 5.0);
    col = pal(0.08) * 0.02;
    col = mix(col, sky(r), fres);
    // Glitzerpfad des Mondes: Höhen machen ihn funkelnder
    float glitter = pow(max(dot(r, MOON), 0.0), 900.0 - uTreble * 500.0);
    col += vec3(1.0, 0.96, 0.9) * glitter * 9.0 * uMoon;
    // Leuchtende Gischt auf hohen Kämmen
    float h = height(p.xz);
    col += pal(0.38) * smoothstep(uSwell * 0.8, uSwell * 1.6 + 0.1, h) * 0.25;
    float fog = 1.0 - exp(-t * 0.025);
    col = mix(col, sky(vec3(rd.x, 0.001, rd.z)), fog);
  }
  // Dunst über dem Horizont
  col += pal(0.3) * exp(-abs(rd.y) * 40.0) * 0.06;
  gl_FragColor = vec4(col, 1.0);
}
`;

class MidnightOcean implements VisualMode {
  private pass!: FullscreenPass;
  private time = 0;
  private swell = 0.3;
  private moon = 1;

  init(ctx: ModeContext) {
    this.pass = new FullscreenPass(frag, {
      uTime: { value: 0 },
      uSwell: { value: 0.3 },
      uChop: { value: 0.06 },
      uRipple: { value: 0.015 },
      uTreble: { value: 0 },
      uMoon: { value: 1 },
      uPalette: { value: ctx.palette },
    });
  }

  resize(width: number, height: number) {
    this.pass.resize(width, height);
  }

  update(a: AudioFeatures) {
    this.time += a.dt * (0.8 + a.energy * 0.6);
    // Dünung reagiert träge, wie echtes Wasser
    this.swell += (0.22 + a.bass * 0.45 - this.swell) * Math.min(a.dt * 1.5, 1);
    if (a.beat) this.moon = 1.6;
    this.moon += (1 - this.moon) * Math.min(a.dt * 3, 1);
    const u = this.pass.uniforms;
    u.uTime.value = this.time;
    u.uSwell.value = this.swell;
    u.uChop.value = 0.05 + a.mid * 0.14;
    u.uRipple.value = 0.012 + a.treble * 0.035;
    u.uTreble.value = a.treble;
    u.uMoon.value = this.moon;
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    this.pass.render(renderer, target);
  }

  dispose() {
    this.pass.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('midnight-ocean').meta,
  create: () => new MidnightOcean(),
};
export default definition;
