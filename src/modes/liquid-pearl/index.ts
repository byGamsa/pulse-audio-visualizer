import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { Motes } from '../../engine/field/Motes';
import { PointSphere } from '../../engine/field/PointSphere';
import { renderOver } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';

// Weiche Perlen aus Punkten, die der Bass verformt; ihr Perlmutt schillert durch alle Farben
const glsl = `
uniform float uMorph;
uniform float uFlow;
uniform float uPocket;
uniform float uDetail;
uniform float uSeed;
uniform float uHue;
uniform float uKick;

vec3 seeded(vec3 n) { return n + vec3(uSeed * 3.1, uSeed * 1.7, -uSeed * 2.3); }

float blob(vec3 n) {
  vec3 q = seeded(n) + vec3(uFlow * 0.25, -uFlow * 0.17, uFlow * 0.21);
  return snoise3(q * 0.9) * 0.6 + snoise3(q * 1.9 + 4.0) * 0.3 + snoise3(q * 3.7 - uFlow * 0.5) * 0.12 * uKick;
}

float pocket(vec3 n) {
  vec3 q = seeded(n) * 1.05 + vec3(-uFlow * 0.3, uFlow * 0.24, uFlow * 0.1);
  vec3 w = vec3(snoise3(q + 1.0), snoise3(q + 5.0), snoise3(q + 9.0)) * 0.4;
  return smoothstep(0.3, 0.58, snoise3(q + w));
}

float displace(vec3 n) {
  return blob(n) * uMorph - pocket(n) * uPocket + snoise3(n * 6.0 + uFlow) * 0.01 * uDetail;
}

vec3 surfaceColor(vec3 n, float d, vec3 nrm, vec3 view) {
  float b = blob(n);
  float p = pocket(n);
  float facing = max(dot(nrm, view), 0.0);
  float fres = pow(1.0 - facing, 2.2);
  // Perlmutt: der Farbton hängt von Höhe, Blickwinkel und Zeit ab
  float bands = 0.5 + 0.5 * sin(b * 20.0 + snoise3(n * 3.0 + uFlow * 0.3) * 3.0);
  vec3 iri = hue2rgb(fract(uHue + b * 0.35 + fres * 0.45 + bands * 0.08));
  vec3 cream = vec3(1.0, 0.95, 0.8);
  vec3 col = mix(cream, mix(iri, vec3(1.0), 0.2), smoothstep(0.15, 0.85, bands) * 0.9);
  col = mix(col, iri, 0.2 + fres * 0.65);
  float light = 0.4 + 0.6 * max(dot(nrm, normalize(vec3(-0.5, 0.7, 0.6))), 0.0);
  col *= light;
  // Mulden: dunkel, mit feinen Rillen
  float grooves = 0.5 + 0.5 * sin(d * 220.0);
  vec3 deep = mix(vec3(0.015, 0.012, 0.02), iri * 0.3, grooves * 0.5);
  col = mix(col, deep, smoothstep(0.15, 0.7, p));
  float edge = smoothstep(0.05, 0.2, p) * (1.0 - smoothstep(0.2, 0.45, p));
  col += iri * edge * 0.8;
  return tint(col) * (0.7 + uKick * 0.35);
}
`;

// Eine große Perle, drei kleine Trabanten
const PEARLS = [
  { seed: 0, scale: 1, orbit: 0, speed: 0, tilt: 0, phase: 0, hue: 0 },
  { seed: 1.7, scale: 0.36, orbit: 2.15, speed: 0.32, tilt: 0.5, phase: 0.4, hue: 0.33 },
  { seed: 3.3, scale: 0.26, orbit: 2.7, speed: -0.24, tilt: -0.35, phase: 2.3, hue: 0.6 },
  { seed: 5.1, scale: 0.2, orbit: 1.75, speed: 0.45, tilt: 1.1, phase: 4.1, hue: 0.8 },
];

class LiquidPearl implements VisualMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
  private sphere!: PointSphere;
  private motes!: Motes;
  private readonly dust = new THREE.Scene();
  private height = 1080;
  private time = 0;
  private flow = 0;
  private morph = 0;
  private pocket = 0;
  private spin = 0;
  private kick = 0;
  private hue = 0;
  private orbit = 0;

  init(ctx: ModeContext) {
    this.sphere = new PointSphere({
      columns: 900,
      rows: 450,
      palette: ctx.palette,
      paletteMix: ctx.paletteMix,
      size: 3.3,
      glsl,
      uniforms: {
        uMorph: { value: 0.15 }, uFlow: { value: 0 }, uPocket: { value: 0.1 }, uDetail: { value: 1 },
        uSeed: { value: 0 }, uHue: { value: 0 }, uKick: { value: 0 },
      },
    });
    this.scene.add(this.sphere.points);
    this.motes = new Motes({
      count: 220,
      box: new THREE.Vector3(7, 4, 5),
      drift: new THREE.Vector3(0.05, 0.08, 0.15),
      size: 5,
      color: new THREE.Color(0.85, 0.95, 1),
      focus: 6,
      dof: 3,
    });
    this.dust.add(this.motes.points);
  }

  resize(width: number, height: number) {
    this.height = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    this.flow += dt * (0.15 + a.energy * 0.7);
    this.morph += (0.13 + a.bass * 0.3 - this.morph) * Math.min(dt * 5, 1);
    this.pocket += (0.06 + a.mid * 0.22 - this.pocket) * Math.min(dt * 3, 1);
    this.kick = Math.max(this.kick * Math.exp(-dt * 4), a.beat ? 0.6 + a.bassRaw * 0.6 : 0);
    this.spin += dt * (0.1 + a.energy * 0.25) + this.kick * dt * 0.8;
    this.orbit += dt * (0.6 + a.energy * 1.2);
    this.hue = (this.hue + dt * (0.015 + a.treble * 0.04)) % 1;

    const u = this.sphere.uniforms;
    u.uFlow.value = this.flow;
    u.uPocket.value = this.pocket;
    u.uDetail.value = 0.5 + a.treble * 2;
    u.uKick.value = this.kick;
    this.sphere.update(this.time, this.height);
    this.motes.update(this.time, this.height);
    this.motes.uniforms.uGain.value = 0.25 + a.treble * 0.6;

    const t = this.time;
    this.camera.position.set(Math.sin(t * 0.07) * 0.9, Math.sin(t * 0.05) * 0.4, 6.4);
    this.camera.lookAt(0, 0, 0);
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(this.dust, this.camera);
    const p = this.sphere.points;
    const u = this.sphere.uniforms;
    // Dieselbe Punktkugel mehrfach, jede Perle mit eigenem Samen, Farbton und Umlauf
    for (const pearl of PEARLS) {
      const a = this.orbit * pearl.speed + pearl.phase;
      p.position.set(
        Math.cos(a) * pearl.orbit,
        Math.sin(a) * pearl.orbit * Math.sin(pearl.tilt) * 0.6,
        Math.sin(a) * pearl.orbit * Math.cos(pearl.tilt),
      );
      p.scale.setScalar(pearl.scale * (1 + this.kick * 0.05));
      p.rotation.set(Math.sin(this.time * 0.08 + pearl.seed) * 0.5, this.spin * (1 + pearl.seed * 0.2), pearl.seed);
      u.uSeed.value = pearl.seed;
      u.uHue.value = (this.hue + pearl.hue) % 1;
      // Kleine Perlen verformen sich stärker
      u.uMorph.value = this.morph * (pearl.scale < 1 ? 1.15 : 1);
      renderOver(renderer, target, this.scene, this.camera);
    }
    p.position.set(0, 0, 0);
  }

  dispose() {
    this.sphere.dispose();
    this.motes.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('liquid-pearl').meta,
  create: () => new LiquidPearl(),
};
export default definition;
