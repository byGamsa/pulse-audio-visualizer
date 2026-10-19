import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { SpectrumHistory, spectrumHistoryGlsl } from '../../engine/field/SpectrumHistory';
import { Streaks } from '../../engine/field/Streaks';
import { TiltShift } from '../../engine/field/TiltShift';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';

const ROWS = 60;

// Lichtspuren stürzen durch die Mitte und rollen sich links und rechts zu Wirbeln ein
const glsl = `
${spectrumHistoryGlsl(ROWS)}
uniform float uFlow;
uniform float uCurl;
const float PI = 3.14159265;
const float DROP = 0.28;

float side(vec4 seed) { return seed.x < 0.5 ? -1.0 : 1.0; }

vec3 dropEnd(vec4 seed) {
  float sd = side(seed);
  return vec3(sd * (0.04 + seed.y * 0.35), 0.9 - seed.y * 0.5, -1.2 - seed.z * 1.6);
}

vec3 streakPath(vec4 seed, float s) {
  float sd = side(seed);
  vec3 e = dropEnd(seed);
  if (s < DROP) {
    float q = s / DROP;
    return vec3(e.x * (0.6 + q * 0.4), mix(6.0, e.y, q), e.z);
  }
  float q = (s - DROP) / (1.0 - DROP);
  vec3 c = vec3(sd * 2.1, 0.35 + sd * 0.12, e.z - 0.6);
  vec2 d0 = e.xy - c.xy;
  float r0 = length(d0);
  float th = atan(d0.y, d0.x) - sd * q * (2.2 + seed.w) * PI * uCurl;
  float r = r0 * mix(1.0, 0.25 + seed.y * 0.35, pow(q, 0.8));
  // Die Arme schwingen zur Kamera und ziehen sich dann ins Auge zurück
  float z = e.z + sin(min(q * 1.6, 1.0) * PI) * 2.4 - q * 2.2;
  return vec3(c.xy + vec2(cos(th), sin(th)) * r, z);
}

vec2 streakSpan(vec4 seed) {
  float len = 0.22 + seed.w * 0.3;
  float speed = 0.05 + seed.z * 0.05;
  return vec2(fract(seed.z * 7.7 + uFlow * speed) * (1.0 + len), len);
}

float streakWidth(vec4 seed, float s) {
  return 0.012 + pow(seed.w, 2.0) * 0.09;
}

vec3 pick(float h) {
  if (h < 0.3) return vec3(1.0, 0.18, 0.62);
  if (h < 0.48) return vec3(0.7, 0.18, 1.0);
  if (h < 0.64) return vec3(1.0, 0.42, 0.22);
  if (h < 0.8) return vec3(0.35, 1.0, 0.3);
  return vec3(1.0, 0.85, 0.2);
}

vec3 streakColor(vec4 seed, float u, float s) {
  float e = specAt(seed.y * 0.8, 0.0);
  float head = smoothstep(0.0, 0.5, u) * (0.6 + 0.4 * u);
  // Breite Spuren schwächer, damit sie wie Bewegungsunschärfe wirken
  float thin = 1.0 / (1.0 + pow(seed.w, 2.0) * 6.0);
  // Einzelne Spuren leuchten hell heraus
  float hot = step(0.9, fract(seed.w * 7.31 + seed.x * 3.7));
  vec3 c = pick(fract(seed.y * 2.3 + side(seed) * 0.21 + (seed.z - 0.5) * 0.08));
  c = mix(c, vec3(1.0, 1.0, 0.92), hot * 0.4);
  return tint(c) * (0.03 + e * 0.2) * head * thin * (1.0 + hot * 5.0);
}
`;

class TwinVortex implements VisualMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(68, 1, 0.05, 60);
  private history!: SpectrumHistory;
  private streaks!: Streaks;
  private blur!: TiltShift;
  private time = 0;
  private flow = 0;
  private curl = 1;

  init(ctx: ModeContext) {
    this.history = new SpectrumHistory(ROWS);
    this.streaks = new Streaks({
      count: 1400,
      segments: 40,
      palette: ctx.palette,
      paletteMix: ctx.paletteMix,
      glsl,
      uniforms: { uSpecHist: { value: this.history.texture }, uFlow: { value: 0 }, uCurl: { value: 1 } },
    });
    this.blur = new TiltShift({ focusY: 0.5, band: 0.18, maxBlur: 18, radial: 1 });
    this.scene.add(this.streaks.mesh);
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.blur.resize(width, height);
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    this.history.update(a);
    this.flow += dt * (0.7 + a.energy * 2.0 + (a.beat ? 1.2 : 0));
    this.curl += (0.9 + a.bass * 0.3 - this.curl) * Math.min(dt * 2, 1);
    const u = this.streaks.uniforms;
    u.uTime.value = this.time;
    u.uFlow.value = this.flow;
    u.uCurl.value = this.curl;

    const t = this.time;
    this.camera.position.set(Math.sin(t * 0.06) * 0.3, 0.7 + Math.sin(t * 0.08) * 0.1, 2.6);
    this.camera.lookAt(0, 0.6, -2);
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    this.blur.render(renderer, target, (rt) => {
      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(this.scene, this.camera);
    });
  }

  dispose() {
    this.history.dispose();
    this.streaks.dispose();
    this.blur.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('twin-vortex').meta,
  create: () => new TwinVortex(),
};
export default definition;
