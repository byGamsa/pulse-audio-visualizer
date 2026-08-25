import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { FullscreenPass } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { palette, tint } from '../../shared/glsl';

const STROKES = 12;
const POINTS = 22;
// Abstand der Spurpunkte in Sekunden
const SAMPLE = 0.034;

const COLORS = [
  new THREE.Color(1.0, 0.0, 0.0),
  new THREE.Color(1.0, 0.92, 0.0),
  new THREE.Color(0.0, 0.85, 0.05),
  new THREE.Color(0.0, 0.12, 1.0),
  new THREE.Color(0.85, 0.0, 1.0),
  new THREE.Color(1.0, 0.35, 0.0),
  new THREE.Color(0.0, 0.85, 1.0),
  new THREE.Color(1.0, 0.0, 0.5),
];

// Jeder Strich ist eine Kette aus Kapseln
const frag = `
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform sampler2D uPoints;
uniform vec3 uColor[${STROKES}];
uniform float uLife[${STROKES}];
${palette}
${tint}

vec4 pt(int i, int s) { return texelFetch(uPoints, ivec2(i, s), 0); }

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// Kapsel mit unterschiedlichen Radien an beiden Enden
float capsule(vec2 p, vec2 a, vec2 b, float ra, float rb) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h) - mix(ra, rb, h);
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float px = 1.0 / uRes.y;
  vec3 col = vec3(0.0);

  for (int s = 0; s < ${STROKES}; s++) {
    if (uLife[s] <= 0.0) continue;
    float life = uLife[s];
    float d = 1e3;
    vec4 a = pt(0, s);
    vec2 tail = a.xy;
    for (int i = 1; i < ${POINTS}; i++) {
      vec4 b = pt(i, s);
      if (b.z <= 0.0) break;
      d = smin(d, capsule(p, a.xy, b.xy, a.z, b.z), 0.03);
      a = b;
      tail = b.xy;
    }
    // Einzelner Kopf, solange die Spur noch keine Länge hat
    d = min(d, length(p - pt(0, s).xy) - pt(0, s).z);
    vec3 c = tint(uColor[s]);

    // Weicher Rand, satter Körper, heller Kern
    float inside = smoothstep(px * 5.0, -px * 5.0, d);
    float depth = clamp(-d / 0.04, 0.0, 1.0);
    vec3 body = c * (0.75 + 0.35 * depth) + mix(c, vec3(1.0), 0.5) * pow(depth, 3.0) * 0.3;
    // Additiv: Farben mischen sich wie Licht
    col += body * inside * life;
    // Schein: eng und kräftig, dazu ein weiter, weicher Hof
    float o = max(d, 0.0);
    col += c * (exp(-o / 0.018) * 0.4 + exp(-o / 0.09) * 0.035) * life;

  }

  gl_FragColor = vec4(col, 1.0);
}
`;

interface Stroke {
  life: number;
  age: number;
  pos: THREE.Vector2;
  vel: THREE.Vector2;
  turn: number;
  radius: number;
  clock: number;
  // Spur: Index 0 = Kopf
  trail: THREE.Vector3[];
  color: THREE.Color;
}

class OilPaint implements VisualMode {
  private pass!: FullscreenPass;
  private readonly data = new Float32Array(POINTS * STROKES * 4);
  private texture!: THREE.DataTexture;
  private readonly colors = Array.from({ length: STROKES }, () => new THREE.Color());
  private readonly life = new Float32Array(STROKES);

  private readonly strokes: Stroke[] = Array.from({ length: STROKES }, () => ({
    life: 0, age: 0, pos: new THREE.Vector2(), vel: new THREE.Vector2(), turn: 0, radius: 0.05, clock: 0,
    trail: Array.from({ length: POINTS }, () => new THREE.Vector3()), color: new THREE.Color(),
  }));
  private time = 0;
  private next = 0;
  private colorIndex = 0;
  private aspect = 16 / 9;

  init(ctx: ModeContext) {
    this.texture = new THREE.DataTexture(this.data, POINTS, STROKES, THREE.RGBAFormat, THREE.FloatType);
    this.texture.needsUpdate = true;
    this.pass = new FullscreenPass(frag, {
      uPalette: { value: ctx.palette },
      uPaletteMix: ctx.paletteMix,
      uPoints: { value: this.texture },
      uColor: { value: this.colors },
      uLife: { value: this.life },

    });
  }

  resize(width: number, height: number) {
    this.aspect = width / height;
    this.pass.resize(width, height);
  }

  private spawn(strength: number) {
    // Der älteste bzw. freie Strich wird neu belegt
    let s = this.strokes.find((k) => k.life <= 0);
    if (!s) s = this.strokes.reduce((m, k) => (k.age > m.age ? k : m));
    const ang = Math.random() * Math.PI * 2;
    const speed = 1.6 + Math.random() * 0.8 + strength * 0.6;
    s.life = 1;
    s.age = 0;
    s.clock = 0;
    // Jeder Strich startet an einer eigenen, zufälligen Stelle im Bild
    s.pos.set((Math.random() - 0.5) * 0.8 * this.aspect, (Math.random() - 0.5) * 0.7);
    s.vel.set(Math.cos(ang), Math.sin(ang)).multiplyScalar(speed);
    s.turn = (Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random() * 1.8);
    s.radius = 0.034 + Math.random() * 0.028 + strength * 0.02;
    for (const t of s.trail) t.set(s.pos.x, s.pos.y, 0);
    s.trail[0].z = s.radius * 0.6;
    s.color.copy(COLORS[this.colorIndex++ % COLORS.length]);
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    if (a.beat) {
      this.spawn(a.bassRaw);
      if (a.bassRaw > 0.6) this.spawn(a.bassRaw * 0.6);
    }
    // In ruhigen Passagen gelegentlich trotzdem ein Strich
    this.next -= dt;
    if (this.next <= 0) {
      this.next = 1.6 + Math.random() * 1.4;
      if (!a.beat) this.spawn(0.2);
    }

    this.strokes.forEach((s, k) => {
      if (s.life <= 0) {
        this.life[k] = 0;
        return;
      }
      s.age += dt;
      // Schießt fast gerade hinaus und rollt sich beim Abbremsen ein
      const curl = 0.35 + 1.5 * THREE.MathUtils.smoothstep(s.age, 0.15, 0.7);
      const ang = s.turn * curl * dt * (1 + a.mid * 0.8);
      s.vel.rotateAround(new THREE.Vector2(), ang);
      s.vel.multiplyScalar(Math.exp(-dt * 2.0));
      s.pos.addScaledVector(s.vel, dt);
      // Neue Spurpunkte, solange sich der Kopf noch bewegt
      s.clock += dt;
      const moving = s.vel.length() > 0.05;
      while (moving && s.clock >= SAMPLE) {
        s.clock -= SAMPLE;
        for (let i = POINTS - 1; i > 0; i--) s.trail[i].copy(s.trail[i - 1]);
        // Zum Ende dünner und leicht wellig
        const w = 0.7 + 0.2 * Math.sin(s.age * 14 + k);
        s.trail[1].z = s.radius * w;
      }
      // Kopf: wächst zum dicken Tropfen, wenn er zur Ruhe kommt
      s.trail[0].set(s.pos.x, s.pos.y, s.radius * (0.85 + 0.3 * (1 - Math.min(s.vel.length() / 1.2, 1))));
      // Nach ein paar Sekunden schrumpft der Strich weg
      if (s.age > 2.4) s.life -= dt * 0.6;
      const shrink = Math.max(s.life, 0);
      this.life[k] = shrink;
      this.colors[k].copy(s.color);
      for (let i = 0; i < POINTS; i++) {
        const t = s.trail[i];
        const o = (k * POINTS + i) * 4;
        this.data[o] = t.x;
        this.data[o + 1] = t.y;
        // Radius 0 markiert das Ende der Spur
        this.data[o + 2] = t.z > 0 ? t.z * (0.25 + 0.75 * shrink) * (1 - (i / POINTS) * 0.35) : 0;
        this.data[o + 3] = 1;
      }
    });
    this.texture.needsUpdate = true;
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    this.pass.render(renderer, target);
  }

  dispose() {
    this.texture.dispose();
    this.pass.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('oil-paint').meta,
  create: () => new OilPaint(),
};
export default definition;
