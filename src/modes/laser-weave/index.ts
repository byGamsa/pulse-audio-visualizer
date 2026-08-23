import type * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { FullscreenPass, getNoiseTexture } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { palette } from '../../shared/glsl';

const BEAMS = 14;

const frag = `
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uBeam[${BEAMS}];
uniform float uStrobe;
uniform sampler2D uNoise;
${palette}

float h11(float x) { return fract(sin(x * 127.1) * 43758.5453); }

void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  vec3 col = vec3(0.0);
  for (int i = 0; i < ${BEAMS}; i++) {
    float fi = float(i);
    bool vertical = h11(fi * 3.1) > 0.6;
    float tilt = (h11(fi * 7.3) - 0.5) * 0.5 + sin(uTime * (0.05 + h11(fi) * 0.08) + fi) * 0.12;
    float ang = (vertical ? 1.5708 : 0.0) + tilt;
    vec2 n = vec2(-sin(ang), cos(ang));
    float offset = (h11(fi * 11.0) - 0.5) * 0.9 + sin(uTime * (0.11 + h11(fi * 5.0) * 0.1) + fi * 2.0) * 0.18;
    float d = dot(p, n) - offset;
    float e = uBeam[i];
    // Spurenbündel wie beim Nachziehen der Belichtung
    float spread = 0.012 + h11(fi * 13.0) * 0.03;
    float w = 0.0018 + e * 0.002;
    float beam = 0.0;
    for (int k = 0; k < 5; k++) {
      float fk = float(k);
      float dk = d - fk * spread * (h11(fi * 17.0) > 0.5 ? 1.0 : -1.0);
      beam += exp(-dk * dk / (w * w)) * pow(0.55, fk);
      beam += exp(-abs(dk) * 30.0) * 0.07 * pow(0.6, fk);
    }
    // Strahl verläuft zu den Enden hin
    float along = dot(p, vec2(n.y, -n.x));
    float fade = smoothstep(1.1, 0.2, abs(along + (h11(fi * 19.0) - 0.5) * 0.6));
    vec3 c = pal(0.62 + h11(fi * 23.0) * 0.3);
    col += c * beam * fade * (0.05 + e * e * 3.2 + uStrobe * 0.55);
  }
  // Dunst im Raum, damit die Strahlen Luft haben
  float haze = textureLod(uNoise, vUv * 0.6 + uTime * 0.01, 0.0).r;
  col += pal(0.5) * haze * 0.015;
  gl_FragColor = vec4(col, 1.0);
}
`;

class LaserWeave implements VisualMode {
  private pass!: FullscreenPass;
  private readonly beams = new Float32Array(BEAMS);
  private strobe = 0;
  private time = 0;

  init(ctx: ModeContext) {
    this.pass = new FullscreenPass(frag, {
      uTime: { value: 0 },
      uBeam: { value: this.beams },
      uStrobe: { value: 0 },
      uNoise: { value: getNoiseTexture() },
      uPalette: { value: ctx.palette },
    });
  }

  resize(width: number, height: number) {
    this.pass.resize(width, height);
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    if (a.beat) this.strobe = 1;
    this.strobe *= Math.exp(-dt * 9);
    for (let i = 0; i < BEAMS; i++) {
      let s = 0;
      for (let k = 0; k < 7; k++) s += a.spectrum[i * 7 + k];
      const v = s / 7;
      // Laser springen an und fallen schnell ab, das wirkt wie echtes Pulsen
      this.beams[i] = v > this.beams[i] ? v : this.beams[i] * Math.exp(-dt * 6);
    }
    this.pass.uniforms.uTime.value = this.time;
    this.pass.uniforms.uStrobe.value = this.strobe;
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    this.pass.render(renderer, target);
  }

  dispose() {
    this.pass.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('laser-weave').meta,
  create: () => new LaserWeave(),
};
export default definition;
