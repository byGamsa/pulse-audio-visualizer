import * as THREE from 'three';
import { palette } from '../../shared/glsl';
import { fieldGlsl } from './AudioField';

let emptyField: THREE.DataTexture | null = null;

// Platzhalter für Primitive ohne AudioField
function getEmptyField() {
  if (!emptyField) {
    emptyField = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat);
    emptyField.needsUpdate = true;
  }
  return emptyField;
}

function baseUniforms(fieldTex: THREE.Texture | undefined, paletteTex: THREE.Texture, extra: Record<string, THREE.IUniform>) {
  return {
    uField: { value: fieldTex ?? getEmptyField() },
    uPalette: { value: paletteTex },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uFocus: { value: 4 },
    uDof: { value: 2 },
    ...extra,
  };
}

export interface LineSetOptions {
  lines: number;
  points: number;
  // Basisbreite in Pixeln bei 1080p
  width: number;
  field?: THREE.Texture;
  palette: THREE.Texture;
  uniforms?: Record<string, THREE.IUniform>;
  // Erwartet linePos, lineIntensity und lineColor
  glsl: string;
}

// Linien als Quad-Streifen, GL_LINES kann nur 1 px
export class LineSet {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  private readonly geometry: THREE.BufferGeometry;

  constructor(o: LineSetOptions) {
    const verts = o.lines * o.points * 2;
    const pos = new Float32Array(verts * 3);
    let k = 0;
    for (let l = 0; l < o.lines; l++) {
      const line = o.lines > 1 ? l / (o.lines - 1) : 0;
      for (let p = 0; p < o.points; p++) {
        const t = p / (o.points - 1);
        pos[k++] = line; pos[k++] = t; pos[k++] = -1;
        pos[k++] = line; pos[k++] = t; pos[k++] = 1;
      }
    }
    const index = new Uint32Array(o.lines * (o.points - 1) * 6);
    k = 0;
    for (let l = 0; l < o.lines; l++) {
      const base = l * o.points * 2;
      for (let p = 0; p < o.points - 1; p++) {
        const v = base + p * 2;
        index[k++] = v; index[k++] = v + 1; index[k++] = v + 2;
        index[k++] = v + 1; index[k++] = v + 3; index[k++] = v + 2;
      }
    }
    this.geometry = new THREE.BufferGeometry();
    // „position“ trägt hier (line, t, side) und keine Weltkoordinaten
    this.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geometry.setIndex(new THREE.BufferAttribute(index, 1));

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      // Orientierung hängt von der Linienrichtung ab
      side: THREE.DoubleSide,
      uniforms: baseUniforms(o.field, o.palette, { uWidth: { value: o.width }, ...o.uniforms }),
      vertexShader: `
        uniform vec2 uRes;
        uniform float uTime;
        uniform float uWidth;
        uniform float uFocus;
        uniform float uDof;
        ${fieldGlsl}
        ${palette}
        out float vSide;
        out float vAlpha;
        out vec3 vColor;
        ${o.glsl}

        vec2 toScreen(vec4 c) { return c.xy / c.w * uRes * 0.5; }

        void main() {
          float line = position.x;
          float t = position.y;
          float side = position.z;
          const float dt = 1.0 / ${o.points - 1}.0;
          mat4 mvp = projectionMatrix * modelViewMatrix;
          vec4 c = mvp * vec4(linePos(line, t), 1.0);
          vec2 a = toScreen(mvp * vec4(linePos(line, max(t - dt, 0.0)), 1.0));
          vec2 b = toScreen(mvp * vec4(linePos(line, min(t + dt, 1.0)), 1.0));
          vec2 dir = b - a;
          dir = length(dir) > 1e-5 ? normalize(dir) : vec2(1.0, 0.0);
          vec2 nrm = vec2(-dir.y, dir.x);

          float scale = uRes.y / 1080.0;
          float blur = min(abs(c.w - uFocus) * uDof, 10.0);
          // Mindestens 1.5 px, Energie bleibt erhalten
          float w = max(uWidth * scale, 1.5) + blur * scale;
          c.xy += nrm * side * w / uRes * c.w;

          vSide = side;
          vAlpha = lineIntensity(line, t) * (uWidth * scale) / w;
          vColor = lineColor(line, t);
          gl_Position = c;
        }
      `,
      fragmentShader: `
        precision highp float;
        in float vSide;
        in float vAlpha;
        in vec3 vColor;
        void main() {
          float a = exp(-vSide * vSide * 3.5);
          gl_FragColor = vec4(vColor * vAlpha * a, 1.0);
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

export interface DotGridOptions {
  columns: number;
  rows: number;
  // Punktgröße in Pixeln bei 1080p und Distanz 1
  size: number;
  field?: THREE.Texture;
  palette: THREE.Texture;
  uniforms?: Record<string, THREE.IUniform>;
  // Erwartet dotPos, dotIntensity, dotColor, optional dotSize
  glsl: string;
}

// Großes Punktraster als Point-Sprites mit weicher Tiefenunschärfe
export class DotGrid {
  readonly points: THREE.Points;
  readonly material: THREE.ShaderMaterial;
  private readonly geometry: THREE.BufferGeometry;

  constructor(o: DotGridOptions) {
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
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: baseUniforms(o.field, o.palette, { uSize: { value: o.size }, ...o.uniforms }),
      vertexShader: `
        uniform vec2 uRes;
        uniform float uTime;
        uniform float uSize;
        uniform float uFocus;
        uniform float uDof;
        ${fieldGlsl}
        ${palette}
        out float vAlpha;
        out vec3 vColor;
        out float vSoft;
        ${o.glsl}

        void main() {
          vec2 g = position.xy;
          vec4 c = projectionMatrix * modelViewMatrix * vec4(dotPos(g), 1.0);
          float scale = uRes.y / 1080.0;
          #ifdef DOT_SIZE_FN
            float sizeMul = dotSize(g);
          #else
            float sizeMul = 1.0;
          #endif
          float base = uSize * sizeMul * scale / max(c.w, 0.05);
          float blur = min(abs(c.w - uFocus) * uDof, 14.0) * scale;
          float size = max(base, 1.5) + blur;
          gl_PointSize = size;
          // Flächenerhaltung: gleiche Lichtmenge, nur verteilt
          vAlpha = c.w > 0.0 ? dotIntensity(g) * (max(base, 0.6) * max(base, 0.6)) / (size * size) : 0.0;
          vSoft = clamp(blur / size, 0.0, 1.0);
          vColor = dotColor(g);
          gl_Position = c;
        }
      `,
      fragmentShader: `
        precision highp float;
        in float vAlpha;
        in vec3 vColor;
        in float vSoft;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float r2 = dot(c, c) * 4.0;
          if (r2 > 1.0) discard;
          // Scharf: Gauß, unscharf: Bokeh-Scheibe
          float sharp = exp(-r2 * 4.0);
          float bokeh = smoothstep(1.0, 0.75, r2) * (0.75 + 0.25 * r2);
          gl_FragColor = vec4(vColor * vAlpha * mix(sharp, bokeh, vSoft), 1.0);
        }
      `,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  get uniforms() {
    return this.material.uniforms;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
