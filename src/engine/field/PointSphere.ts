import * as THREE from 'three';
import { hash, hue, palette, simplex3, tint } from '../../shared/glsl';

export interface PointSphereOptions {
  columns: number;
  rows: number;
  palette: THREE.Texture;
  paletteMix: THREE.IUniform<number>;
  // Punktgröße in Pixeln bei 1080p
  size?: number;
  uniforms?: Record<string, THREE.IUniform>;
  // Erwartet float displace(vec3 n) und vec3 surfaceColor(vec3 n, float d, vec3 nrm, vec3 view)
  glsl: string;
}

// Kugel aus dichten, deckenden Punkten; das Raster selbst erzeugt das Moiré
export class PointSphere {
  readonly points: THREE.Points;
  readonly material: THREE.ShaderMaterial;
  private readonly geometry: THREE.BufferGeometry;

  constructor(o: PointSphereOptions) {
    const n = o.columns * o.rows;
    const pos = new Float32Array(n * 3);
    let k = 0;
    for (let y = 0; y < o.rows; y++) {
      for (let x = 0; x < o.columns; x++) {
        pos[k++] = (x + 0.5) / o.columns;
        pos[k++] = (y + 0.5) / o.rows;
        pos[k++] = 0;
      }
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.material = new THREE.ShaderMaterial({
      depthTest: true,
      depthWrite: true,
      uniforms: {
        uPalette: { value: o.palette },
        uPaletteMix: o.paletteMix,
        uTime: { value: 0 },
        uSize: { value: o.size ?? 2 },
        uScale: { value: 1 },
        ...o.uniforms,
      },
      vertexShader: `
        uniform float uTime;
        uniform float uSize;
        uniform float uScale;
        ${palette}
        ${tint}
        ${hash}
        ${hue}
        ${simplex3}
        out vec3 vColor;
        const float PI = 3.14159265;
        ${o.glsl}

        vec3 dirAt(vec2 g) {
          float th = g.x * 2.0 * PI;
          float ph = g.y * PI;
          return vec3(sin(ph) * cos(th), cos(ph), sin(ph) * sin(th));
        }
        vec3 surf(vec3 n) { return n * (1.0 + displace(n)); }

        void main() {
          vec3 n = dirAt(position.xy);
          vec3 wn = normalize(mat3(modelMatrix) * n);
          vec3 wp0 = (modelMatrix * vec4(n, 1.0)).xyz;
          vec3 view = normalize(cameraPosition - wp0);
          // Rückseite gar nicht erst zeichnen
          if (dot(wn, view) < -0.25) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            gl_PointSize = 0.0;
            vColor = vec3(0.0);
            return;
          }
          float d = displace(n);
          vec3 p = n * (1.0 + d);
          // Normale aus zwei Nachbarpunkten
          vec3 t1 = normalize(cross(n, abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
          vec3 t2 = cross(n, t1);
          vec3 p1 = surf(normalize(n + t1 * 0.01));
          vec3 p2 = surf(normalize(n + t2 * 0.01));
          vec3 nrm = normalize(mat3(modelMatrix) * normalize(cross(p1 - p, p2 - p)));
          if (dot(nrm, wn) < 0.0) nrm = -nrm;
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vColor = surfaceColor(n, d, nrm, normalize(cameraPosition - wp.xyz));
          gl_Position = projectionMatrix * viewMatrix * wp;
          gl_PointSize = uSize * uScale;
        }
      `,
      fragmentShader: `
        precision highp float;
        in vec3 vColor;
        void main() { gl_FragColor = vec4(vColor, 1.0); }
      `,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  get uniforms() {
    return this.material.uniforms;
  }

  update(time: number, height: number) {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uScale.value = Math.max(height / 1080, 0.6);
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
