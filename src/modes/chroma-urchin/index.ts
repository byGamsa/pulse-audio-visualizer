import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { Urchin } from './urchin';

// Regenbogen von oben nach unten, die Spitzen leuchten heller
const colorGlsl = `
uniform float uHue;
vec3 urchinColor(vec3 world, float lift, float facing) {
  float y = clamp(world.y / 1.45 * 0.5 + 0.5, 0.0, 1.0);
  vec3 c = hue2rgb(fract(uHue + (1.0 - y) * 0.72));
  float rim = smoothstep(-0.1, 0.5, facing);
  float tip = smoothstep(0.05, 0.9, lift);
  return tint(mix(c, vec3(1.0), tip * 0.2)) * (0.3 + rim * 0.7 + tip * 1.6);
}
`;

class ChromaUrchin implements VisualMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
  private urchin!: Urchin;
  private time = 0;
  private spike = 0;
  private spin = 0;
  private pump = 0;

  init(ctx: ModeContext) {
    this.urchin = new Urchin({ palette: ctx.palette, paletteMix: ctx.paletteMix, colorGlsl, uniforms: { uHue: { value: 0 } } });
    this.urchin.lines.uniforms.uFocus.value = 6;
    this.urchin.lines.uniforms.uDof.value = 0.6;
    this.scene.add(this.urchin.group);
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.urchin.resize(width, height);
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    this.urchin.history.update(a);
    this.spike += (0.75 + a.bass * 0.6 - this.spike) * Math.min(dt * 5, 1);
    this.spin += dt * (0.12 + a.energy * 0.3);

    const u = this.urchin.uniforms;
    u.uTime.value = this.time;
    u.uSpike.value = this.spike;
    u.uHue.value = Math.sin(this.time * 0.05) * 0.04;
    this.urchin.group.rotation.set(Math.sin(this.time * 0.13) * 0.3, this.spin, 0.2);
    // Kick lässt die Kugel kurz anschwellen
    this.pump = Math.max(this.pump * Math.exp(-dt * 6), a.beat ? 0.05 + a.bassRaw * 0.04 : 0);
    this.urchin.group.scale.setScalar(1 + this.pump);

    this.camera.position.set(0, 0.2, 6.6);
    this.camera.lookAt(0, 0, 0);
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.urchin.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('chroma-urchin').meta,
  create: () => new ChromaUrchin(),
};
export default definition;
