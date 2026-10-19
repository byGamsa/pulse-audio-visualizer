import * as THREE from 'three';
import { hash, hue, palette, simplex2, tint } from '../../shared/glsl';

export interface WireMeshOptions {
  columns: number;
  rows: number;
  palette: THREE.Texture;
  paletteMix: THREE.IUniform<number>;
  // Diagonalen für die Dreiecksoptik
  diagonals?: boolean;
  uniforms?: Record<string, THREE.IUniform>;
  // Erwartet wirePos(vec2 g) und wireColor(vec2 g, vec3 world), g = 0..1
  glsl: string;
}

// Dichtes Drahtgitter als GL_LINES, die Form entsteht komplett im Vertex-Shader
export class WireMesh {
  readonly lines: THREE.LineSegments;
  readonly material: THREE.ShaderMaterial;
  private readonly geometry: THREE.BufferGeometry;

  constructor(o: WireMeshOptions) {
    const { columns: c, rows: r } = o;
    const pos = new Float32Array(c * r * 3);
    let k = 0;
    for (let y = 0; y < r; y++) {
      for (let x = 0; x < c; x++) {
        pos[k++] = x / (c - 1);
        pos[k++] = y / (r - 1);
        pos[k++] = 0;
      }
    }
    const idx: number[] = [];
    const at = (x: number, y: number) => y * c + x;
    for (let y = 0; y < r; y++) {
      for (let x = 0; x < c; x++) {
        if (x < c - 1) idx.push(at(x, y), at(x + 1, y));
        if (y < r - 1) idx.push(at(x, y), at(x, y + 1));
        if (o.diagonals !== false && x < c - 1 && y < r - 1) idx.push(at(x, y), at(x + 1, y + 1));
      }
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uPalette: { value: o.palette },
        uPaletteMix: o.paletteMix,
        uTime: { value: 0 },
        ...o.uniforms,
      },
      vertexShader: `
        uniform float uTime;
        ${palette}
        ${tint}
        ${hash}
        ${hue}
        ${simplex2}
        out vec3 vColor;
        ${o.glsl}
        void main() {
          vec2 g = position.xy;
          vec3 world = wirePos(g);
          vColor = wireColor(g, world);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        in vec3 vColor;
        void main() { gl_FragColor = vec4(vColor, 1.0); }
      `,
    });
    this.lines = new THREE.LineSegments(this.geometry, this.material);
    this.lines.frustumCulled = false;
  }

  get uniforms() {
    return this.material.uniforms;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
