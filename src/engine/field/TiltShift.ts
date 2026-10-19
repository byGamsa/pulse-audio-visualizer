import * as THREE from 'three';
import { FullscreenPass } from '../fullscreen';

// Szene in ein eigenes Target rendern und dann mit ortsabhängiger Unschärfe ausgeben.
// Die Unschärfe wächst mit dem Abstand zur Schärfezone (uFocusY ± uBand) in Bildhöhe.
const frag = `
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform vec2 uRes;
uniform float uFocusY;
uniform float uBand;
uniform float uMaxBlur;
uniform float uRadial;

const int TAPS = 24;
const float GOLDEN = 2.39996323;

void main() {
  float dy = abs(vUv.y - uFocusY);
  float dr = length((vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0));
  float d = mix(dy, dr, uRadial);
  float amount = smoothstep(uBand, uBand + 0.35, d);
  float radius = amount * uMaxBlur * uRes.y / 1080.0;
  vec3 sum = texture(uScene, vUv).rgb;
  float wsum = 1.0;
  if (radius > 0.5) {
    // Vogel-Spirale: gleichmäßige Scheibe wie eine Blende
    for (int i = 1; i < TAPS; i++) {
      float r = sqrt(float(i) / float(TAPS)) * radius;
      float a = float(i) * GOLDEN;
      vec2 o = vec2(cos(a), sin(a)) * r / uRes;
      sum += texture(uScene, vUv + o).rgb;
      wsum += 1.0;
    }
  }
  gl_FragColor = vec4(sum / wsum, 1.0);
}
`;

export class TiltShift {
  readonly target: THREE.WebGLRenderTarget;
  private readonly pass: FullscreenPass;

  constructor(opts: { focusY?: number; band?: number; maxBlur?: number; radial?: number } = {}) {
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true });
    this.pass = new FullscreenPass(frag, {
      uScene: { value: this.target.texture },
      uFocusY: { value: opts.focusY ?? 0.5 },
      uBand: { value: opts.band ?? 0.15 },
      uMaxBlur: { value: opts.maxBlur ?? 14 },
      uRadial: { value: opts.radial ?? 0 },
    });
  }

  get uniforms() {
    return this.pass.uniforms;
  }

  resize(width: number, height: number) {
    this.target.setSize(width, height);
    this.pass.resize(width, height);
  }

  // Szene unscharf in target zeichnen
  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget, draw: (rt: THREE.WebGLRenderTarget) => void) {
    draw(this.target);
    this.pass.render(renderer, target);
  }

  dispose() {
    this.target.dispose();
    this.pass.dispose();
  }
}
