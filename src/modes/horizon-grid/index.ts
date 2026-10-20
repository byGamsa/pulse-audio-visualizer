import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { SpectrumHistory, spectrumHistoryGlsl } from '../../engine/field/SpectrumHistory';
import { Starfield } from '../../engine/field/Starfield';
import { WireMesh } from '../../engine/field/WireMesh';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';

const ROWS = 120;

// Ein Planet aus Drahtdreiecken; in der Mitte wächst das Spektrum als Krater aus Spitzen
const glsl = `
${spectrumHistoryGlsl(ROWS)}
uniform float uRing;
uniform float uRingAmp;
uniform float uLift;
const float RADIUS = 260.0;
const vec2 CENTER = vec2(0.0, -1.0);

float heightAt(vec2 g, vec2 xz) {
  float r = length(xz - CENTER);
  float rn = r / 6.5;
  // Mitte = Bass, nach außen die Höhen; ältere Werte wandern nach außen
  // Über ~120 ms gemittelt, damit Bässe die Spitzen nicht ruckartig hochreißen
  float bnd = pow(clamp(rn, 0.0, 1.0), 0.8) * 0.85;
  float age = rn * 0.35;
  float e = (specAt(bnd, age) + specAt(bnd, age + 0.02) + specAt(bnd, age + 0.04) + specAt(bnd, age + 0.06)) * 0.25;
  float rnd = hash12(floor(g * vec2(560.0, 320.0)));
  float spike = 0.3 + 0.7 * pow(rnd, 1.6) + 0.35 * snoise(xz * 0.9 + uTime * 0.4);
  float h = pow(e, 1.3) * 4.6 * spike * pow(max(1.0 - rn, 0.0), 0.55) * (0.7 + uLift);
  // Schockwelle auf Beats
  float w = (r - uRing) * 1.3;
  h += exp(-w * w) * uRingAmp * (0.5 + 0.8 * rnd);
  // Feine Dünung im ganzen Feld
  h += specAt(0.06, clamp(r / 30.0, 0.0, 1.0)) * 0.12 * (0.5 + 0.5 * sin(r * 1.7 - uTime * 3.0));
  return max(h, 0.0);
}

vec3 wirePos(vec2 g) {
  // Zeilen werden nach hinten gröber, damit das Raster auf dem Bildschirm gleichmäßig bleibt
  float u = 1.0 - g.y;
  vec2 xz = vec2((g.x - 0.5) * (110.0 + u * 170.0), 12.0 - 95.0 * pow(u, 1.7));
  vec2 d = xz - CENTER;
  float y = -dot(d, d) / (2.0 * RADIUS);
  return vec3(xz.x, y + heightAt(g, xz), xz.y);
}

vec3 wireColor(vec2 g, vec3 p) {
  vec2 xz = p.xz;
  vec2 d = xz - CENTER;
  float h = p.y + dot(d, d) / (2.0 * RADIUS);
  float hn = clamp(h / 3.0, 0.0, 1.0);
  vec3 low = vec3(0.36, 0.2, 1.0);
  vec3 mid = vec3(0.1, 0.85, 1.0);
  vec3 high = vec3(0.6, 1.0, 0.25);
  vec3 col = mix(low, mid, smoothstep(0.08, 0.45, hn));
  col = mix(col, high, smoothstep(0.45, 0.9, hn));
  float dist = length(p - cameraPosition);
  // Zum Horizont hin dichter, daher schwächer; gehobene Spitzen leuchten
  float a = 0.55 * smoothstep(90.0, 10.0, dist) + hn * 1.8;
  return tint(col) * a;
}
`;

class HorizonGrid implements VisualMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
  private history!: SpectrumHistory;
  private mesh!: WireMesh;
  private stars!: Starfield;
  private height = 1080;
  private time = 0;
  private ring = 99;
  private ringAmp = 0;
  private ringPeak = 0;
  private ringAge = 99;
  private lift = 0;

  init(ctx: ModeContext) {
    this.history = new SpectrumHistory(ROWS);
    this.mesh = new WireMesh({
      columns: 560,
      rows: 320,
      palette: ctx.palette,
      paletteMix: ctx.paletteMix,
      glsl,
      uniforms: {
        uSpecHist: { value: this.history.texture },
        uRing: { value: 99 },
        uRingAmp: { value: 0 },
        uLift: { value: 0 },
      },
    });
    this.stars = new Starfield(3000, 90, 0.9);
    this.scene.add(this.stars.points, this.mesh.lines);
  }

  resize(width: number, height: number) {
    this.height = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    this.history.update(a);
    if (a.beat) {
      this.ring = 0;
      this.ringAge = 0;
      this.ringPeak = 0.45 + a.bassRaw * 0.7;
    }
    this.ring += dt * 8;
    // Weicher Anstieg statt Sprung, dann langsames Ausklingen
    this.ringAge += dt;
    this.ringAmp = this.ringPeak * (1 - Math.exp(-this.ringAge * 7)) * Math.exp(-this.ringAge * 1.3);
    this.lift += (a.bass * 0.5 - this.lift) * Math.min(dt * 1.5, 1);

    const u = this.mesh.uniforms;
    u.uTime.value = this.time;
    u.uRing.value = this.ring;
    u.uRingAmp.value = this.ringAmp;
    u.uLift.value = this.lift;

    // Langsamer Schwenk über den Planeten
    const t = this.time;
    this.camera.position.set(Math.sin(t * 0.045) * 2.5, 5.2 + Math.sin(t * 0.07) * 0.4, 12.5 + Math.cos(t * 0.05) * 1.2);
    this.camera.lookAt(Math.sin(t * 0.045 + 0.8) * 0.8, -0.6, -9);
    this.stars.points.position.copy(this.camera.position);
    this.stars.update(t, this.height);
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.history.dispose();
    this.mesh.dispose();
    this.stars.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('horizon-grid').meta,
  create: () => new HorizonGrid(),
};
export default definition;
