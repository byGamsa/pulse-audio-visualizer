import * as THREE from 'three';
import { BAND_COUNT, FullscreenPass, defineMode, palette, tint, type AudioFeatures, type ModeContext } from '@pulse/sdk';

const BANDS = 64;

const frag = `
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uBass;
uniform float uSpec[${BANDS}];
${palette}
${tint}

const float PI = 3.14159265;

float spec(float x) {
  x = clamp(x, 0.0, float(${BANDS - 1}));
  int i = int(floor(x));
  return mix(uSpec[i], uSpec[min(i + 1, ${BANDS - 1})], fract(x));
}

void main() {
  vec2 p = (vUv - 0.5) * uRes / min(uRes.x, uRes.y);
  float a = atan(p.y, p.x);
  float t = abs(a) / PI;
  float r = 0.24 + 0.05 * uBass + 0.16 * spec(t * float(${BANDS - 1}));
  float d = abs(length(p) - r);
  float line = 0.0018 / (d + 0.0018);
  vec3 col = tint(vec3(1.0, 0.42, 0.12)) * line * 1.4;
  col += tint(vec3(0.25, 0.5, 1.0)) * 0.004 / (abs(length(p) - 0.24) + 0.004) * 0.25;
  gl_FragColor = vec4(col, 1.0);
}
`;

export default defineMode({
  create() {
    let pass: FullscreenPass;
    const spec = new Float32Array(BANDS);
    return {
      init(ctx: ModeContext) {
        pass = new FullscreenPass(frag, {
          uTime: { value: 0 },
          uBass: { value: 0 },
          uSpec: { value: spec },
          uPalette: { value: ctx.palette },
          uPaletteMix: ctx.paletteMix,
        });
      },
      resize(width: number, height: number) {
        pass.resize(width, height);
      },
      update(audio: AudioFeatures) {
        const step = BAND_COUNT / BANDS;
        for (let i = 0; i < BANDS; i++) spec[i] = audio.spectrum[Math.floor(i * step)];
        pass.uniforms.uTime.value = audio.time;
        pass.uniforms.uBass.value = audio.bass;
      },
      render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
        pass.render(renderer, target);
      },
      dispose() {
        pass.dispose();
      },
    };
  },
});
