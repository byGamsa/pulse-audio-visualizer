import * as THREE from 'three';
import { hash, hue, palette, simplex2, tint } from '../../shared/glsl';

export interface StreaksOptions {
  count: number;
  segments: number;
  palette: THREE.Texture;
  paletteMix: THREE.IUniform<number>;
  uniforms?: Record<string, THREE.IUniform>;
  // Erwartet:
  //   vec3 streakPath(vec4 seed, float s)        Bahn, s = 0..1
  //   vec2 streakSpan(vec4 seed)                 Kopf (0..1) und Länge der Spur
  //   float streakWidth(vec4 seed, float s)      Breite in Welteinheiten
  //   vec3 streakColor(vec4 seed, float u, float s)  HDR-Farbe, u = 0 Schweif … 1 Kopf
  glsl: string;
}

// Lichtspuren als Bänder mit echter Breite, die einer Bahn folgen
export class Streaks {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  private readonly geometry: THREE.BufferGeometry;

  constructor(o: StreaksOptions) {
    const verts = o.count * (o.segments + 1) * 2;
    const pos = new Float32Array(verts * 3);
    const seed = new Float32Array(verts * 4);
    let k = 0;
    let q = 0;
    for (let i = 0; i < o.count; i++) {
      const s = [Math.random(), Math.random(), Math.random(), Math.random()];
      for (let j = 0; j <= o.segments; j++) {
        const u = j / o.segments;
        for (const side of [-1, 1]) {
          pos[k++] = u;
          pos[k++] = side;
          pos[k++] = 0;
          seed[q++] = s[0]; seed[q++] = s[1]; seed[q++] = s[2]; seed[q++] = s[3];
        }
      }
    }
    const index = new Uint32Array(o.count * o.segments * 6);
    k = 0;
    for (let i = 0; i < o.count; i++) {
      const base = i * (o.segments + 1) * 2;
      for (let j = 0; j < o.segments; j++) {
        const v = base + j * 2;
        index[k++] = v; index[k++] = v + 1; index[k++] = v + 2;
        index[k++] = v + 1; index[k++] = v + 3; index[k++] = v + 2;
      }
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geometry.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
    this.geometry.setIndex(new THREE.BufferAttribute(index, 1));

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uPalette: { value: o.palette },
        uPaletteMix: o.paletteMix,
        uTime: { value: 0 },
        ...o.uniforms,
      },
      vertexShader: `
        attribute vec4 seed;
        uniform float uTime;
        ${palette}
        ${tint}
        ${hash}
        ${hue}
        ${simplex2}
        out vec3 vColor;
        out float vSide;
        ${o.glsl}
        void main() {
          float u = position.x;
          float side = position.y;
          vec2 span = streakSpan(seed);
          float s = span.x - span.y * (1.0 - u);
          vec3 p = streakPath(seed, s);
          vec3 p2 = streakPath(seed, s + 0.004);
          vec3 tangent = normalize(p2 - p + 1e-5);
          vec3 world = (modelMatrix * vec4(p, 1.0)).xyz;
          vec3 view = normalize(cameraPosition - world);
          vec3 across = normalize(cross(mat3(modelMatrix) * tangent, view));
          world += across * side * streakWidth(seed, s) * 0.5;
          // Außerhalb der Bahn unsichtbar
          float alive = step(0.0, s) * step(s, 1.0);
          vColor = streakColor(seed, u, s) * alive;
          vSide = side;
          gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        in vec3 vColor;
        in float vSide;
        void main() {
          float a = exp(-vSide * vSide * 2.5);
          gl_FragColor = vec4(vColor * a, 1.0);
        }
      `,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
  }

  get uniforms() {
    return this.material.uniforms;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
