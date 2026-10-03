import type * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { FullscreenPass } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { hash, palette, tint } from '../../shared/glsl';

const TUBES = 10;
const LEDS = 30;

const frag = `
precision highp float;
${palette}
${tint}
in vec2 vUv;
uniform vec2 uRes;
uniform float uLevel[${TUBES}];
uniform float uPeak[${TUBES}];
uniform float uTime;
${hash}

vec3 hsv(float h, float s, float v) {
  vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return tint(v * mix(vec3(1.0), k, s));
}

// Unten Blau/Grün, Mitte Pink, oben Violett
vec3 ledColor(float t) { return hsv(fract(0.55 - t * 0.75), 0.75, 1.0); }

void main() {
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2((vUv.x - 0.5) * aspect, vUv.y);

  // Hintergrund: dunkler Schreibtisch, unscharfe Lichter einer Tastatur
  vec3 col = mix(vec3(0.005, 0.008, 0.02), vec3(0.02, 0.03, 0.07), vUv.y);
  vec2 bk = vec2(p.x * 6.0, (p.y - 0.62) * 14.0);
  vec2 bcell = floor(bk);
  float bh = hash12(bcell);
  if (p.y > 0.55 && p.y < 0.72 && bh > 0.5) {
    float d = length(fract(bk) - 0.5);
    col += tint(vec3(0.1, 0.25, 0.9)) * smoothstep(0.5, 0.0, d) * 0.06;
  }

  float rowW = min(aspect * 0.86, 1.5);
  float pitch = rowW / ${TUBES}.0;
  float tubeW = pitch * 0.62;
  float base = 0.2;
  float top = 0.86;

  // Sockel
  float baseTop = base, baseBottom = base - 0.075;
  if (abs(p.x) < rowW * 0.54 && p.y < baseTop && p.y > baseBottom) {
    col = vec3(0.025, 0.028, 0.035);
    col += vec3(0.3, 0.4, 0.6) * smoothstep(0.004, 0.0, abs(p.y - baseTop)) * 0.25;
  }
  // Blaues Unterlicht auf dem Tisch
  col += tint(vec3(0.1, 0.3, 1.0)) * exp(-abs(p.y - baseBottom) * 30.0) * smoothstep(rowW * 0.6, rowW * 0.3, abs(p.x)) * 0.12 * step(p.y, baseBottom);

  float idx = floor((p.x + rowW * 0.5) / pitch);
  if (idx >= 0.0 && idx < ${TUBES}.0) {
    int i = int(idx);
    float cx = -rowW * 0.5 + (idx + 0.5) * pitch;
    float lx = (p.x - cx) / (tubeW * 0.5);
    float capR = tubeW * 0.5;
    float ly = p.y;
    // Röhre: Zylinder mit Halbkugel oben
    float yTop = top - capR;
    bool inside = abs(lx) < 1.0 && ly > base && (ly < yTop || length(vec2(lx * capR, ly - yTop)) < capR);
    // Ringfassung am Fuß
    if (abs(lx) < 1.25 && ly > base && ly < base + 0.022) {
      col = vec3(0.03, 0.035, 0.045) + tint(vec3(0.2, 0.4, 1.0)) * 0.15 * smoothstep(0.004, 0.0, abs(ly - base - 0.022));
    } else if (inside) {
      float level = uLevel[i];
      float peak = uPeak[i];
      vec3 glass = vec3(0.02, 0.025, 0.04);
      // LED-Leiste: zwei Spalten runder Punkte
      float stripW = 0.36;
      float t = (ly - base - 0.03) / (yTop - base - 0.06);
      vec3 led = vec3(0.0);
      if (abs(lx) < stripW && t > 0.0 && t < 1.0) {
        float row = floor(t * ${LEDS}.0);
        float colI = lx < 0.0 ? 0.0 : 1.0;
        vec2 cell = vec2(fract((lx / stripW * 0.5 + 0.5) * 2.0), fract(t * ${LEDS}.0)) - 0.5;
        cell.x *= (stripW * capR) / ((yTop - base) / ${LEDS}.0) ;
        float dotMask = smoothstep(0.32, 0.22, length(cell));
        float rt = row / ${LEDS}.0;
        bool lit = rt < level;
        bool isPeak = abs(rt - peak) < 0.5 / ${LEDS}.0;
        vec3 c = ledColor(rt);
        led = c * dotMask * (lit ? 1.6 : isPeak ? 1.3 : 0.05);
        led += vec3(0.02) * dotMask * (1.0 - float(lit));
        led *= 1.0 - colI * 0.08;
      }
      // Farbiger Schein im Glas, solange die Säule leuchtet
      vec3 haze = ledColor(clamp(t, 0.0, level)) * 0.12 * smoothstep(level + 0.1, level - 0.05, t) * (1.0 - abs(lx) * 0.6);
      // Glas: dunkle Ränder, zwei Lichtkanten, Glanz auf der Kuppel
      float rim = pow(abs(lx), 6.0);
      float spec1 = exp(-pow((lx + 0.62) * 9.0, 2.0)) * 0.5;
      float spec2 = exp(-pow((lx - 0.7) * 14.0, 2.0)) * 0.25;
      float dome = ly > yTop ? exp(-pow(length(vec2(lx * capR + capR * 0.35, ly - yTop - capR * 0.4)) / (capR * 0.25), 2.0)) * 0.6 : 0.0;
      col = glass + led + haze + vec3(0.6, 0.7, 0.9) * (rim * 0.25 + spec1 + spec2 + dome) * 0.35;
    }
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

class LedTubes implements VisualMode {
  private pass!: FullscreenPass;
  private readonly level = new Float32Array(TUBES);
  private readonly peak = new Float32Array(TUBES);
  private readonly hold = new Float32Array(TUBES);
  private time = 0;

  init(ctx: ModeContext) {
    this.pass = new FullscreenPass(frag, {
      uPalette: { value: ctx.palette },
      uPaletteMix: ctx.paletteMix,
      uLevel: { value: this.level },
      uPeak: { value: this.peak },
      uTime: { value: 0 },
    });
  }

  resize(width: number, height: number) {
    this.pass.resize(width, height);
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    for (let i = 0; i < TUBES; i++) {
      const from = Math.floor((i / TUBES) * 108);
      const to = Math.floor(((i + 1) / TUBES) * 108);
      let v = 0;
      for (let k = from; k < to; k++) v += a.spectrum[k];
      v = Math.min((v / Math.max(to - from, 1)) * 1.25, 1);
      this.level[i] = v > this.level[i] ? v : Math.max(this.level[i] - dt * 1.3, 0);
      if (this.level[i] >= this.peak[i]) {
        this.peak[i] = this.level[i];
        this.hold[i] = 0.6;
      } else if ((this.hold[i] -= dt) < 0) {
        this.peak[i] = Math.max(this.peak[i] - dt * 0.45, 0);
      }
    }
    this.pass.uniforms.uTime.value = this.time;
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    this.pass.render(renderer, target);
  }

  dispose() {
    this.pass.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('led-tubes').meta,
  create: () => new LedTubes(),
};
export default definition;
