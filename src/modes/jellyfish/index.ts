import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { DotGrid, LineSet } from '../../engine/field/primitives';
import { FullscreenPass } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { palette } from '../../shared/glsl';

const JELLIES = 3;
const LINES_PER_JELLY = 400;

// Linien pro Qualle: 35 % Glocke, 10 % Mundarme, 55 % Tentakel
const glsl = `
uniform vec4 uJelly[${JELLIES}];
uniform float uContract[${JELLIES}];
uniform float uSwim[${JELLIES}];
uniform float uTreble;

const float TAU = 6.2831853;
float h11(float x) { return fract(sin(x * 127.1) * 43758.5453); }

void decode(float line, out int j, out float local) {
  float f = line * ${JELLIES}.0;
  float jf = min(floor(f), ${JELLIES - 1}.0);
  j = int(jf);
  local = f - jf;
}

vec3 bell(float phi, float t, int j) {
  float c = uContract[j];
  float theta = t * 1.75;
  float squeeze = 1.0 - c * 0.32 * t * t;
  float r = sin(theta) * squeeze;
  float y = cos(theta) * 0.72 - c * 0.12 * t;
  r *= 1.0 + 0.045 * sin(phi * 16.0 + uSwim[j] * 2.0) * t * t;
  return vec3(cos(phi) * r, y, sin(phi) * r);
}

vec3 linePos(float line, float t) {
  int j; float local;
  decode(line, j, local);
  vec4 J = uJelly[j];
  vec3 p;
  if (local < 0.35) {
    p = bell(local / 0.35 * TAU, t, j);
  } else if (local < 0.45) {
    float k = (local - 0.35) / 0.1;
    float arm = floor(k * 4.0);
    float fr = fract(k * 4.0);
    float phi = arm / 4.0 * TAU + fr * 0.7;
    float sway = sin(t * 5.0 - uSwim[j] * 1.5 + arm) * 0.15 * t;
    float rad = 0.1 + 0.1 * sin(t * 14.0 + fr * 6.0) * (0.4 + t);
    p = vec3(cos(phi) * rad + sway, 0.3 - t * 1.7, sin(phi) * rad + sway * 0.5);
  } else {
    float k = (local - 0.45) / 0.55;
    float phi = k * TAU + h11(line * 311.0) * 0.1;
    vec3 rim = bell(phi, 1.0, j);
    float len = 2.4 + h11(line * 97.0) * 1.2;
    float wave = sin(t * 7.0 - uSwim[j] * 2.2 + phi * 3.0);
    vec3 dir = vec3(cos(phi), 0.0, sin(phi));
    // Tentakel werden beim Zusammenziehen nach außen geschleudert
    p = rim + vec3(0.0, -t * len, 0.0) + dir * (wave * 0.12 * t + uContract[j] * 0.35 * t * (1.0 - t));
  }
  return J.xyz + p * J.w;
}

float lineIntensity(float line, float t) {
  int j; float local;
  decode(line, j, local);
  float c = uContract[j];
  if (local < 0.35) return 0.045 * (0.4 + t * 1.3) * (1.0 + c * 1.8);
  if (local < 0.45) return 0.03 * (1.0 - t * 0.6) * (1.0 + c);
  float tw = 1.0 + uTreble * 1.5 * step(0.92, h11(line * 53.0 + floor(t * 30.0)));
  return 0.028 * pow(1.0 - t, 1.3) * tw * (1.0 + c * 0.8);
}

vec3 lineColor(float line, float t) {
  int j; float local;
  decode(line, j, local);
  vec3 c = local < 0.35 ? pal(0.45 + t * 0.3) : local < 0.45 ? pal(0.78) : pal(0.62 - t * 0.2);
  return mix(c, vec3(1.0), uContract[j] * 0.35);
}
`;

const snowGlsl = `
float h21(vec2 p, float k) { return fract(sin(dot(p, vec2(127.1, 311.7)) + k * 74.7) * 43758.5453); }
vec3 dotPos(vec2 g) {
  float y = mod(h21(g, 2.0) * 9.0 + uTime * (0.04 + h21(g, 4.0) * 0.05), 9.0) - 4.5;
  return vec3(h21(g, 1.0) * 14.0 - 7.0, y, h21(g, 3.0) * 12.0 - 9.0);
}
float dotIntensity(vec2 g) { return 0.12 + 0.12 * h21(g, 5.0); }
vec3 dotColor(vec2 g) { return mix(pal(0.6), vec3(1.0), 0.2); }
`;

const backgroundFrag = `
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
${palette}
void main() {
  vec2 uv = vUv;
  vec3 col = mix(pal(0.02) * 0.01, pal(0.2) * 0.09, pow(uv.y, 1.6));
  // Lichtstrahlen von der Oberfläche
  float x = (uv.x - 0.5) * uRes.x / uRes.y;
  float rays = 0.0;
  rays += pow(0.5 + 0.5 * sin(x * 7.0 + uv.y * 2.0 + uTime * 0.15), 8.0);
  rays += pow(0.5 + 0.5 * sin(x * 11.0 - uv.y * 3.0 - uTime * 0.11 + 2.0), 10.0) * 0.6;
  col += pal(0.45) * rays * smoothstep(0.2, 1.0, uv.y) * 0.05;
  gl_FragColor = vec4(col, 1.0);
}
`;

interface Jelly {
  pos: THREE.Vector3;
  scale: number;
  vy: number;
  since: number;
  swim: number;
  seed: number;
}

class Jellyfish implements VisualMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 60);
  private lines!: LineSet;
  private snow!: DotGrid;
  private background!: FullscreenPass;
  private readonly jellyUniform = Array.from({ length: JELLIES }, () => new THREE.Vector4());
  private readonly contract = new Float32Array(JELLIES);
  private readonly swim = new Float32Array(JELLIES);
  private readonly jellies: Jelly[] = [
    { pos: new THREE.Vector3(0, 0, 0), scale: 1, vy: 0, since: 10, swim: 0, seed: 0.3 },
    { pos: new THREE.Vector3(-2.6, -1.5, -4), scale: 0.6, vy: 0, since: 10, swim: 1, seed: 1.7 },
    { pos: new THREE.Vector3(2.8, 1.2, -7), scale: 0.5, vy: 0, since: 10, swim: 2, seed: 3.1 },
  ];
  private next = 0;
  private time = 0;

  init(ctx: ModeContext) {
    this.background = new FullscreenPass(backgroundFrag, { uTime: { value: 0 }, uPalette: { value: ctx.palette } });
    this.lines = new LineSet({
      lines: JELLIES * LINES_PER_JELLY,
      points: 80,
      width: 1.1,
      palette: ctx.palette,
      glsl,
      uniforms: {
        uJelly: { value: this.jellyUniform },
        uContract: { value: this.contract },
        uSwim: { value: this.swim },
        uTreble: { value: 0 },
      },
    });
    this.lines.uniforms.uFocus.value = 8;
    this.lines.uniforms.uDof.value = 1.4;
    this.snow = new DotGrid({ columns: 70, rows: 50, size: 3, palette: ctx.palette, glsl: snowGlsl });
    this.snow.uniforms.uFocus.value = 8;
    this.snow.uniforms.uDof.value = 2.5;
    this.scene.add(this.snow.points, this.lines.mesh);
    this.camera.position.set(0, 0, 8);
    this.camera.lookAt(0, -0.5, 0);
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.lines.uniforms.uRes.value.set(width, height);
    this.snow.uniforms.uRes.value.set(width, height);
    this.background.resize(width, height);
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    // Beats reihum verteilen, kein Gleichschritt
    if (a.beat) {
      const j = this.jellies[this.next];
      if (j.since > 0.6) {
        j.since = 0;
        j.vy += (0.5 + a.bassRaw * 0.6) * j.scale;
      }
      this.next = (this.next + 1) % JELLIES;
    }
    this.jellies.forEach((j, i) => {
      j.since += dt;
      // Schnelles Zusammenziehen, langsames Entspannen
      const c = THREE.MathUtils.smoothstep(j.since, 0, 0.15) * Math.exp(-Math.max(j.since - 0.15, 0) * 2.2);
      this.contract[i] = c;
      j.vy *= Math.exp(-dt * 1.2);
      j.pos.y += (0.04 * j.scale + j.vy) * dt;
      j.pos.x += Math.sin(this.time * 0.1 + j.seed) * 0.05 * dt;
      // Oben raus, unten wieder rein
      if (j.pos.y > 4.5) j.pos.y = -5.5;
      j.swim += dt * (1 + c * 3 + a.mid);
      this.swim[i] = j.swim;
      this.jellyUniform[i].set(j.pos.x, j.pos.y, j.pos.z, j.scale);
    });

    this.lines.uniforms.uTime.value = this.time;
    this.lines.uniforms.uTreble.value = a.treble;
    this.snow.uniforms.uTime.value = this.time;
    this.background.uniforms.uTime.value = this.time;
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    this.background.render(renderer, target);
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.camera);
    renderer.autoClear = autoClear;
  }

  dispose() {
    this.lines.dispose();
    this.snow.dispose();
    this.background.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('jellyfish').meta,
  create: () => new Jellyfish(),
};
export default definition;
