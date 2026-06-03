import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { FullscreenPass } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { hash, palette } from '../../shared/glsl';

const BLOBS = 10;

const frag = `
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uBass;
uniform vec3 uBlobs[${BLOBS}];
${palette}
${hash}

// Metaball-Feld: Summe von r²/d², die Oberfläche liegt bei 1
float field(vec2 p) {
  float f = 0.0;
  for (int i = 0; i < ${BLOBS}; i++) {
    vec2 d = p - uBlobs[i].xy;
    f += uBlobs[i].z * uBlobs[i].z / (dot(d, d) + 1e-4);
  }
  return f;
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float f = field(p);

  // Hinterleuchtet wie von einer Glühbirne unten
  vec3 bg = mix(pal(0.35) * 0.18, pal(0.08) * 0.03, smoothstep(-0.6, 0.6, p.y));
  bg += pal(0.6) * exp(-pow(p.y + 0.62, 2.0) * 12.0) * exp(-p.x * p.x * 3.0) * 0.25;
  vec3 col = bg;

  // Weicher Lichthof um die Blasen
  col += pal(0.7) * smoothstep(0.35, 1.0, f) * 0.12;

  if (f > 1.0) {
    // Hinterleuchtet: heller Kern, dunkler Rand
    float thick = smoothstep(1.0, 6.0, f);
    vec3 wax = mix(pal(0.55), pal(0.82), thick);
    col = wax * (0.35 + 0.9 * thick) * (1.0 + uBass * 0.5);
    col *= 0.75 + 0.6 * smoothstep(0.5, -0.5, p.y);
    // Schmaler, heller Saum direkt an der Oberfläche
    col += pal(0.9) * (1.0 - smoothstep(1.0, 1.25, f)) * 0.5;
  }

  col += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

interface Blob {
  x: number;
  phase: number;
  speed: number;
  radius: number;
  wobble: number;
}

class LavaLamp implements VisualMode {
  private pass!: FullscreenPass;
  private readonly uniformBlobs = Array.from({ length: BLOBS }, () => new THREE.Vector3());
  private blobs: Blob[] = [];
  private aspect = 1;
  private time = 0;

  init(ctx: ModeContext) {
    this.blobs = Array.from({ length: BLOBS }, (_, i) => ({
      x: (i / (BLOBS - 1) - 0.5) * 1.4 + (Math.random() - 0.5) * 0.15,
      phase: Math.random() * Math.PI * 2,
      speed: 0.12 + Math.random() * 0.12,
      radius: 0.035 + Math.random() * 0.035,
      wobble: Math.random() * 10,
    }));
    this.pass = new FullscreenPass(frag, {
      uTime: { value: 0 },
      uBass: { value: 0 },
      uBlobs: { value: this.uniformBlobs },
      uPalette: { value: ctx.palette },
    });
  }

  resize(width: number, height: number) {
    this.aspect = width / height;
    this.pass.resize(width, height);
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    // Energie heizt auf, Bass lässt die Blasen anschwellen
    const heat = 0.6 + a.energy * 1.6;
    this.blobs.forEach((b, i) => {
      b.phase += dt * b.speed * heat;
      const y = Math.sin(b.phase) * 0.42;
      const x = b.x * this.aspect * 0.55 + Math.sin(this.time * 0.2 + b.wobble) * 0.08;
      // Oben und unten breiter, beim Aufsteigen schlanker
      const r = b.radius * (1 + 0.25 * Math.abs(Math.sin(b.phase))) * (1 + a.bass * 0.25 + a.bassRaw * 0.1);
      this.uniformBlobs[i].set(x, y, r);
    });
    const u = this.pass.uniforms;
    u.uTime.value = this.time;
    u.uBass.value = a.bass;
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    this.pass.render(renderer, target);
  }

  dispose() {
    this.pass.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('lava-lamp').meta,
  create: () => new LavaLamp(),
};
export default definition;
