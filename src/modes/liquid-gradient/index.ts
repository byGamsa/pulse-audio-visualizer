import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { fullscreenVert, hash, palette, simplex2 } from '../../shared/glsl';

const frag = `
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uFlow;
uniform float uBass;
uniform float uMid;
uniform float uCentroid;
${palette}
${hash}
${simplex2}

// Nur 3 Oktaven: große, weiche Felder statt feiner Marmorierung
float soft(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0) * 0.75;

  // Doppeltes Domain-Warping (Inigo Quilez)
  vec2 q = vec2(soft(p + uFlow * 0.30), soft(p + vec2(5.2, 1.3) - uFlow * 0.25));
  vec2 r = vec2(
    soft(p + 1.1 * q + vec2(1.7, 9.2) + uFlow * 0.18),
    soft(p + 1.1 * q + vec2(8.3, 2.8) - uFlow * 0.22)
  );
  float f = soft(p + (1.0 + uBass * 0.4) * r);

  float t = clamp(0.45 + 0.6 * f + 0.12 * (uCentroid - 0.4), 0.0, 1.0);
  vec3 col = pal(t) * 0.8;
  // Glanz an den Kämmen der Felder, atmet mit dem Bass
  float sheen = smoothstep(0.4, 0.8, length(r)) * (0.25 + 0.9 * uBass);
  col += pal(min(t + 0.25, 1.0)) * sheen * 0.35;
  col *= 0.65 + 0.35 * smoothstep(1.3, 0.2, length(p)) + uMid * 0.15;

  // Dithering gegen Banding in den weichen Verläufen
  col += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

class LiquidGradient implements VisualMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera();
  private material!: THREE.ShaderMaterial;
  private geometry!: THREE.PlaneGeometry;
  private flow = Math.random() * 100;

  init(ctx: ModeContext) {
    this.geometry = new THREE.PlaneGeometry(2, 2);
    this.material = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uRes: { value: new THREE.Vector2(1, 1) },
        uFlow: { value: 0 },
        uBass: { value: 0 },
        uMid: { value: 0 },
        uCentroid: { value: 0 },
        uPalette: { value: ctx.palette },
      },
      vertexShader: fullscreenVert,
      fragmentShader: frag,
    });
    const quad = new THREE.Mesh(this.geometry, this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  resize(width: number, height: number) {
    this.material.uniforms.uRes.value.set(width, height);
  }

  update(a: AudioFeatures) {
    // Bewusst träge: Energie beschleunigt das Fließen nur sanft
    this.flow += a.dt * (0.06 + a.energy * 0.22);
    const u = this.material.uniforms;
    u.uFlow.value = this.flow;
    u.uBass.value += (a.bass - u.uBass.value) * Math.min(a.dt * 3, 1);
    u.uMid.value = a.mid;
    u.uCentroid.value = a.centroid;
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('liquid-gradient').meta,
  create: () => new LiquidGradient(),
};
export default definition;
