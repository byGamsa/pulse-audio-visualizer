import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { FullscreenPass } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { hash, palette, tint } from '../../shared/glsl';
import { Urchin } from '../chroma-urchin/urchin';

const WATER = 0.0;

// Indigo-Körper, magenta Flanken, die Spitzen glühen pfirsichgold
const colorGlsl = `
vec3 urchinColor(vec3 world, float lift, float facing) {
  float tip = smoothstep(0.02, 0.85, lift);
  vec3 body = vec3(0.05, 0.02, 0.2);
  vec3 mid = vec3(0.85, 0.12, 0.55);
  vec3 hot = vec3(1.0, 0.68, 0.35);
  vec3 c = mix(body, mid, smoothstep(0.0, 0.35, tip));
  c = mix(c, hot, smoothstep(0.3, 0.9, tip));
  float rim = smoothstep(-0.2, 0.6, facing);
  return tint(c) * (0.45 + rim * 0.8 + tip * 2.4);
}
`;

const maskGlsl = `
float urchinMask(vec3 world) { return smoothstep(${WATER.toFixed(2)} - 0.01, ${WATER.toFixed(2)} + 0.03, world.y); }
`;

const composite = `
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform sampler2D uDirect;
uniform sampler2D uRefl;
uniform float uHorizon;
uniform float uTime;
uniform float uGlow;
${palette}
${tint}
${hash}

void main() {
  float h = uHorizon;
  vec3 sky = mix(vec3(0.03, 0.008, 0.035), vec3(0.008, 0.004, 0.03), smoothstep(h, 1.0, vUv.y));
  vec3 col;
  if (vUv.y >= h) {
    col = tint(sky) + texture(uDirect, vUv).rgb;
  } else {
    float depth = (h - vUv.y) / max(h, 0.001);
    // Wellen verzerren und verwischen die Spiegelung, je näher, desto stärker
    float ripple = sin(vUv.y * 320.0 * (1.0 - depth * 0.5) - uTime * 2.4) * 0.0012
                 + sin(vUv.y * 70.0 + vUv.x * 9.0 - uTime * 1.1) * 0.0018;
    vec2 uv = vUv + vec2(ripple * (0.4 + depth * 2.0), 0.0);
    float spread = 0.003 + depth * 0.04;
    vec3 refl = vec3(0.0);
    float wsum = 0.0;
    for (int i = -4; i <= 4; i++) {
      float w = exp(-float(i * i) * 0.18);
      refl += texture(uRefl, uv + vec2(0.0, float(i) * spread * 0.5)).rgb * w;
      wsum += w;
    }
    refl /= wsum;
    vec3 water = mix(vec3(0.02, 0.005, 0.03), vec3(0.002, 0.001, 0.006), depth);
    col = tint(water) + refl * 0.6 * (1.0 - depth * 0.6);
  }
  // Leuchtende Wasserlinie
  float line = exp(-abs(vUv.y - h) * uRes.y * 0.35);
  col += tint(vec3(1.0, 0.45, 0.6)) * line * (0.25 + uGlow * 0.8);
  gl_FragColor = vec4(col, 1.0);
}
`;

class LowTide implements VisualMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50);
  private urchin!: Urchin;
  private direct!: THREE.WebGLRenderTarget;
  private refl!: THREE.WebGLRenderTarget;
  private pass!: FullscreenPass;
  private readonly probe = new THREE.Vector3();
  private time = 0;
  private spike = 0;
  private spin = 0;
  private bob = 0;

  init(ctx: ModeContext) {
    this.urchin = new Urchin({ palette: ctx.palette, paletteMix: ctx.paletteMix, colorGlsl, maskGlsl });
    this.urchin.lines.uniforms.uFocus.value = 6.5;
    this.urchin.lines.uniforms.uDof.value = 0.5;
    this.scene.add(this.urchin.group);
    const opts = { type: THREE.HalfFloatType, depthBuffer: true };
    this.direct = new THREE.WebGLRenderTarget(1, 1, opts);
    this.refl = new THREE.WebGLRenderTarget(1, 1, opts);
    this.pass = new FullscreenPass(composite, {
      uDirect: { value: this.direct.texture },
      uRefl: { value: this.refl.texture },
      uHorizon: { value: 0.5 },
      uTime: { value: 0 },
      uGlow: { value: 0 },
      uPalette: { value: ctx.palette },
      uPaletteMix: ctx.paletteMix,
    });
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.urchin.resize(width, height);
    this.direct.setSize(width, height);
    // Halbe Auflösung reicht, die Spiegelung wird ohnehin verwischt
    this.refl.setSize(Math.max(1, width >> 1), Math.max(1, height >> 1));
    this.pass.resize(width, height);
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    this.urchin.history.update(a);
    this.spike += (0.7 + a.bass * 0.7 - this.spike) * Math.min(dt * 5, 1);
    this.spin += dt * (0.1 + a.energy * 0.25);
    this.bob = Math.sin(this.time * 0.6) * 0.04;

    const u = this.urchin.uniforms;
    u.uTime.value = this.time;
    u.uSpike.value = this.spike;
    this.urchin.group.rotation.set(0.15, this.spin, Math.sin(this.time * 0.2) * 0.1);
    this.urchin.group.position.y = 0.18 + this.bob;

    this.camera.position.set(Math.sin(this.time * 0.05) * 0.8, WATER + 0.06, 7.4);
    this.camera.lookAt(0, WATER + 0.3, 0);
    this.camera.updateMatrixWorld();

    // Wasserlinie auf dem Bildschirm
    this.probe.set(0, WATER, 0).project(this.camera);
    this.pass.uniforms.uHorizon.value = this.probe.y * 0.5 + 0.5;
    this.pass.uniforms.uTime.value = this.time;
    this.pass.uniforms.uGlow.value = a.energy;
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    const g = this.urchin.group;
    const u = this.urchin.uniforms;
    renderer.setRenderTarget(this.direct);
    renderer.clear();
    renderer.render(this.scene, this.camera);

    // Gespiegelt an der Wasserfläche
    const y = g.position.y;
    g.scale.y = -1;
    g.position.y = 2 * WATER - y;
    u.uMirror.value = -1;
    renderer.setRenderTarget(this.refl);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    g.scale.y = 1;
    g.position.y = y;
    u.uMirror.value = 1;

    this.pass.render(renderer, target);
  }

  dispose() {
    this.urchin.dispose();
    this.direct.dispose();
    this.refl.dispose();
    this.pass.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('low-tide').meta,
  create: () => new LowTide(),
};
export default definition;
