import type * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { FullscreenPass, getNoiseTexture } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { palette, tint } from '../../shared/glsl';

const ARCHES = 26;
const BANDS = 16;

const frag = `
precision highp float;
${palette}
${tint}
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uTravel;
uniform float uBand[${BANDS}];
uniform float uFlash;
uniform sampler2D uNoise;

const float FLOOR = -0.52;
const float CAM_Y = 0.08;
const float FOCAL = 1.15;
const float SPACING = 1.1;

float h11(float x) { return fract(sin(x * 127.1) * 43758.5453); }

vec3 archColor(float id) {
  float h = h11(id * 3.3);
  vec3 pink = vec3(1.0, 0.12, 0.7);
  vec3 violet = vec3(0.6, 0.15, 1.0);
  vec3 blue = vec3(0.25, 0.25, 1.0);
  return tint(h < 0.45 ? pink : (h < 0.8 ? violet : blue));
}

// Leuchtender Ring in Bildschirmkoordinaten; liefert (Kern, Glühen)
vec2 ring(vec2 p, vec2 c, float r, float w) {
  float d = abs(length(p - c) - r) * uRes.y;
  return vec2(exp(-d * d / (w * w)), exp(-d / (w * 9.0)));
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float px = uRes.y / 1080.0;
  vec3 col = vec3(0.0);
  vec3 refl = vec3(0.0);

  // Weg so breit wie die Bögen
  float horizon = 0.0;
  float slope = sqrt(1.0 - FLOOR * FLOOR) / (CAM_Y - FLOOR);
  bool onFloor = p.y < horizon && abs(p.x) < (horizon - p.y) * slope;
  // Tiefe des Bodens unter diesem Pixel: Bögen dahinter verdeckt der Boden
  float floorZ = onFloor ? FOCAL * (FLOOR - CAM_Y) / min(p.y, -1e-4) : 1e9;

  float base = floor(uTravel / SPACING);
  float frac = fract(uTravel / SPACING);
  for (int i = 0; i < ${ARCHES}; i++) {
    float fi = float(i);
    float z = (fi + 1.0 - frac) * SPACING;
    float id = base + fi;
    float s = FOCAL / z;
    vec2 c = vec2(0.0, -CAM_Y * s);
    float r = s;
    float floorY = (FLOOR - CAM_Y) * s;
    float e = uBand[int(clamp(fi / ${ARCHES}.0 * ${BANDS}.0, 0.0, ${BANDS - 1}.0))];
    float fog = exp(-z * 0.11);
    // Ein- und Ausblenden vorn, damit kein Bogen hart aus dem Bild springt
    float nearFade = smoothstep(0.25, 1.1, z);
    float level = (0.35 + e * e * 2.2 + uFlash * exp(-z * 0.6) * 1.5) * fog * nearFade;
    float w = (1.2 + 2.4 * s) * px;
    vec3 ac = archColor(id);
    vec2 g = ring(p, c, r, w);
    float above = smoothstep(floorY - 0.002, floorY + 0.002, p.y) * step(z, floorZ);
    col += (mix(ac, vec3(1.0), 0.35) * g.x * 1.3 + ac * g.y * 0.32) * level * above;
    // Spiegelbild im Boden
    vec2 cr = vec2(0.0, (2.0 * FLOOR - CAM_Y) * s);
    vec2 gr = ring(p, cr, r, w * 7.0);
    refl += ac * (gr.x * 0.16 + gr.y * 0.07) * level * (1.0 - above);
  }

  // Dunst in der Tunnelmitte, mit dunklem Fluchtpunkt
  float vp = length(p - vec2(0.0, -CAM_Y * FOCAL / 20.0));
  vec3 haze = tint(vec3(0.6, 0.12, 0.8)) * exp(-vp * 4.0) * 0.18;
  haze *= smoothstep(0.02, 0.09, vp);
  col += haze;
  if (onFloor) {
    float n = textureLod(uNoise, vec2(p.x * 0.4, uTravel * 0.02 + p.y), 0.0).r;
    col += refl * (0.6 + n * 0.4) + tint(vec3(0.18, 0.06, 0.3)) * 0.05;
  }
  // Bodenkanten laufen zum Fluchtpunkt
  float edge = abs(abs(p.x) - (horizon - p.y) * slope) * uRes.y;
  col += tint(vec3(0.6, 0.35, 0.9)) * exp(-edge * 0.8) * step(p.y, horizon) * 0.35;
  gl_FragColor = vec4(col, 1.0);
}
`;

class NeonArches implements VisualMode {
  private pass!: FullscreenPass;
  private readonly bands = new Float32Array(BANDS);
  private time = 0;
  private travel = 0;
  private speed = 1;
  private flash = 0;

  init(ctx: ModeContext) {
    this.pass = new FullscreenPass(frag, {
      uPalette: { value: ctx.palette },
      uPaletteMix: ctx.paletteMix,
      uTime: { value: 0 },
      uTravel: { value: 0 },
      uBand: { value: this.bands },
      uFlash: { value: 0 },
      uNoise: { value: getNoiseTexture() },
    });
  }

  resize(width: number, height: number) {
    this.pass.resize(width, height);
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    for (let i = 0; i < BANDS; i++) {
      let v = 0;
      for (let k = 0; k < 7; k++) v = Math.max(v, a.spectrum[i * 7 + k]);
      this.bands[i] = v > this.bands[i] ? v : this.bands[i] * Math.exp(-dt * 4);
    }
    if (a.beat) {
      this.flash = 1;
      this.speed += 1.2;
    }
    this.flash *= Math.exp(-dt * 7);
    this.speed += (0.9 + a.energy * 2.2 - this.speed) * Math.min(dt * 2, 1);
    this.travel += this.speed * dt;
    const u = this.pass.uniforms;
    u.uTime.value = this.time;
    u.uTravel.value = this.travel;
    u.uFlash.value = this.flash;
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    this.pass.render(renderer, target);
  }

  dispose() {
    this.pass.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('neon-arches').meta,
  create: () => new NeonArches(),
};
export default definition;
