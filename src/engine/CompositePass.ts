import * as THREE from 'three';
import { Pass } from 'postprocessing';
import { fullscreenVert, hash, simplex2 } from '../shared/glsl';
import { TRANSITIONS, type TransitionType } from './transitions';

// Blendet im linearen HDR-Raum zwischen zwei Modi über
const frag = `
precision highp float;
in vec2 vUv;
uniform sampler2D tA;
uniform sampler2D tB;
uniform float uProgress;
uniform float uTime;
uniform float uAspect;
uniform int uType;
${simplex2}
${hash}

// textureLod: sicher in Schleifen mit break/continue
vec3 A(vec2 uv) { return textureLod(tA, clamp(uv, 0.0, 1.0), 0.0).rgb; }
vec3 B(vec2 uv) { return textureLod(tB, clamp(uv, 0.0, 1.0), 0.0).rgb; }

// Noise Dissolve
vec3 dissolve(vec2 uv, float p) {
  vec2 q = (uv - 0.5) * vec2(uAspect, 1.0);
  float n = fbm(q * 2.2 + uTime * 0.05) * 0.5 + 0.5;
  n = mix(n, 1.0 - length(q) * 1.1, 0.35);
  float edge = 0.08;
  float t = p * (1.0 + 2.0 * edge) - edge;
  float mask = smoothstep(t + edge, t - edge, n);
  vec3 ca = A((uv - 0.5) * (1.0 - 0.06 * p) + 0.5);
  vec3 cb = B((uv - 0.5) * (1.0 + 0.06 * (1.0 - p)) + 0.5);
  float glow = exp(-pow((n - t) / (edge * 0.6), 2.0)) * sin(p * 3.14159);
  return mix(ca, cb, mask) + (ca + cb + 0.15) * 2.5 * glow;
}

void main() {
  float p = uProgress;
  if (p <= 0.0) { gl_FragColor = vec4(A(vUv), 1.0); return; }
  vec3 col;
  if (uType == 0) col = mix(A(vUv), B(vUv), p);
  else col = dissolve(vUv, p);
  gl_FragColor = vec4(col, 1.0);
}
`;

export class CompositePass extends Pass {
  private readonly material: THREE.ShaderMaterial;

  constructor() {
    super('CompositePass');
    this.needsSwap = false; // schreibt wie ein RenderPass in den Input-Buffer der Kette
    this.material = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tA: { value: null },
        tB: { value: null },
        uProgress: { value: 0 },
        uTime: { value: 0 },
        uAspect: { value: 1 },
        uType: { value: 1 },
      },
      vertexShader: fullscreenVert,
      fragmentShader: frag,
    });
    this.fullscreenMaterial = this.material;
  }

  setInputs(
    a: THREE.Texture,
    b: THREE.Texture | null,
    progress: number,
    time: number,
    aspect: number,
    type: TransitionType,
  ) {
    const u = this.material.uniforms;
    u.tA.value = a;
    u.tB.value = b ?? a;
    u.uProgress.value = b ? progress : 0;
    u.uTime.value = time;
    u.uAspect.value = aspect;
    u.uType.value = TRANSITIONS.indexOf(type);
  }

  override render(renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget | null) {
    renderer.setRenderTarget(this.renderToScreen ? null : inputBuffer);
    renderer.render(this.scene, this.camera);
  }
}
