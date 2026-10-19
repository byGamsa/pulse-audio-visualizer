import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { SpectrumHistory, spectrumHistoryGlsl } from '../../engine/field/SpectrumHistory';
import { FullscreenPass } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { hue, palette, simplex2, tint } from '../../shared/glsl';

const ROWS = 60;
const COUNT = 2800;

// Ein Ring aus weißen Tropfen; das Rückkopplungsbild trägt jeden Moment nach außen
const blobVert = `
attribute vec4 seed;
uniform float uTime;
uniform float uAspect;
uniform float uRadius;
uniform float uScale;
uniform float uSpin;
uniform float uBurst;
${simplex2}
${palette}
${tint}
${hue}
${spectrumHistoryGlsl(ROWS)}
out vec3 vColor;
const float TAU = 6.2831853;

void main() {
  float phi = seed.x * TAU + uSpin * (0.6 + seed.y * 0.8);
  float band = abs(fract(seed.x + 0.25) * 2.0 - 1.0);
  float e = specAt(band * 0.85, seed.y * 0.1);
  float r = uRadius * (0.82 + 0.32 * seed.y) + pow(e, 1.3) * 0.16 * (0.4 + seed.z)
          + snoise(vec2(phi * 3.0, uTime * 0.6 + seed.y * 4.0)) * 0.02;
  // Ein Teil der Tropfen sprüht nach innen
  float spray = step(0.9, seed.w);
  r *= mix(1.0, 0.15 + 0.7 * fract(seed.z * 7.3 + uTime * 0.05), spray);
  r *= 1.0 + uBurst * (0.3 + seed.y * 0.5);
  vec2 p = vec2(cos(phi), sin(phi)) * r;
  float size = (1.6 + pow(seed.z, 3.0) * 15.0 * (0.5 + e)) * uScale * (1.0 - spray * 0.5);
  gl_PointSize = size;
  vec3 c = mix(vec3(1.0), hue2rgb(fract(seed.y * 3.0 + uTime * 0.02)), 0.18);
  vColor = tint(c) * (0.22 + e * 0.9) * (1.0 - spray * 0.7);
  gl_Position = vec4(p.x / uAspect, p.y, 0.0, 1.0);
}
`;

const blobFrag = `
precision highp float;
in vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  if (d > 1.0) discard;
  // Feste Tropfen mit weichem Rand
  float a = smoothstep(1.0, 0.7, d);
  gl_FragColor = vec4(vColor * a, 1.0);
}
`;

const feedback = `
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform sampler2D uScene;
uniform sampler2D uPrev;
uniform float uZoom;
uniform float uDecay;
uniform float uSplit;
uniform float uInject;
uniform float uTwist;

vec2 warp(vec2 c, float z) {
  // Leichte Drehung verhindert Achsenartefakte, außen beschleunigt der Zoom
  float ca = cos(uTwist), sa = sin(uTwist);
  c = mat2(ca, -sa, sa, ca) * c;
  return c * (1.0 - z * (0.8 + length(c) * 0.45));
}

void main() {
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  vec2 c = (vUv - 0.5) * asp;
  vec3 cur = texture(uScene, vUv).rgb;
  float r = texture(uPrev, 0.5 + warp(c, uZoom * (1.0 + uSplit)) / asp).r;
  float g = texture(uPrev, 0.5 + warp(c, uZoom) / asp).g;
  float b = texture(uPrev, 0.5 + warp(c, uZoom * (1.0 - uSplit)) / asp).b;
  // Nur auf Beats wandert ein Abzug des Rings in die Rückkopplung
  gl_FragColor = vec4(cur * uInject + vec3(r, g, b) * uDecay, 1.0);
}
`;

const output = `
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform sampler2D uSrc;
uniform sampler2D uScene;
void main() {
  vec3 col = texture(uSrc, vUv).rgb + texture(uScene, vUv).rgb;
  vec2 c = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  col *= 1.0 - smoothstep(0.6, 1.2, length(c)) * 0.5;
  gl_FragColor = vec4(col, 1.0);
}
`;

class WarpRing implements VisualMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera();
  private history!: SpectrumHistory;
  private geometry!: THREE.BufferGeometry;
  private material!: THREE.ShaderMaterial;
  private sceneRT!: THREE.WebGLRenderTarget;
  private fb: THREE.WebGLRenderTarget[] = [];
  private feedback!: FullscreenPass;
  private output!: FullscreenPass;
  private ping = 0;
  private time = 0;
  private spin = 0;
  private burst = 0;
  private radius = 0.3;

  init(ctx: ModeContext) {
    this.history = new SpectrumHistory(ROWS);
    const seed = new Float32Array(COUNT * 4);
    for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
    this.geometry.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uSpecHist: { value: this.history.texture },
        uPalette: { value: ctx.palette },
        uPaletteMix: ctx.paletteMix,
        uTime: { value: 0 },
        uAspect: { value: 1 },
        uRadius: { value: 0.3 },
        uScale: { value: 1 },
        uSpin: { value: 0 },
        uBurst: { value: 0 },
      },
      vertexShader: blobVert,
      fragmentShader: blobFrag,
    });
    const points = new THREE.Points(this.geometry, this.material);
    points.frustumCulled = false;
    this.scene.add(points);

    const opts = { type: THREE.HalfFloatType, depthBuffer: false };
    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, opts);
    this.fb = [new THREE.WebGLRenderTarget(1, 1, opts), new THREE.WebGLRenderTarget(1, 1, opts)];
    this.feedback = new FullscreenPass(feedback, {
      uScene: { value: this.sceneRT.texture },
      uPrev: { value: this.fb[0].texture },
      uZoom: { value: 0.01 },
      uDecay: { value: 0.9 },
      uSplit: { value: 0.2 },
      uInject: { value: 0 },
      uTwist: { value: 0 },
    });
    this.output = new FullscreenPass(output, { uSrc: { value: this.fb[1].texture }, uScene: { value: this.sceneRT.texture } });
  }

  resize(width: number, height: number) {
    this.material.uniforms.uAspect.value = width / height;
    this.material.uniforms.uScale.value = height / 1080;
    this.sceneRT.setSize(width, height);
    for (const t of this.fb) t.setSize(width, height);
    this.feedback.resize(width, height);
    this.output.resize(width, height);
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    this.history.update(a);
    this.spin += dt * (0.1 + a.energy * 0.3);
    this.burst = Math.max(this.burst * Math.exp(-dt * 7), a.beat ? 0.12 + a.bassRaw * 0.12 : 0);
    this.radius += (0.27 + a.bass * 0.06 - this.radius) * Math.min(dt * 5, 1);

    const u = this.material.uniforms;
    u.uTime.value = this.time;
    u.uSpin.value = this.spin;
    u.uBurst.value = this.burst;
    u.uRadius.value = this.radius;

    const step = Math.min(dt * 60, 3);
    const f = this.feedback.uniforms;
    f.uDecay.value = Math.pow(0.962, step);
    f.uZoom.value = (0.011 + a.energy * 0.008) * step;
    f.uInject.value = a.beat ? 0.85 : 0;
    f.uTwist.value = 0.0035 * step;
    f.uSplit.value = 0.06 + a.treble * 0.1;
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    renderer.setRenderTarget(this.sceneRT);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    const prev = this.fb[this.ping];
    const next = this.fb[1 - this.ping];
    this.feedback.uniforms.uPrev.value = prev.texture;
    this.feedback.render(renderer, next);
    this.output.uniforms.uSrc.value = next.texture;
    this.output.render(renderer, target);
    this.ping = 1 - this.ping;
  }

  dispose() {
    this.history.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.sceneRT.dispose();
    for (const t of this.fb) t.dispose();
    this.feedback.dispose();
    this.output.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('warp-ring').meta,
  create: () => new WarpRing(),
};
export default definition;
