import * as THREE from 'three';
import { LineSet } from '../../engine/field/primitives';
import { SpectrumHistory, spectrumHistoryGlsl } from '../../engine/field/SpectrumHistory';
import { hue, simplex3, tint } from '../../shared/glsl';

const ROWS = 60;

export interface UrchinOptions {
  palette: THREE.Texture;
  paletteMix: THREE.IUniform<number>;
  // Erwartet urchinColor(vec3 world, float lift, float facing) → HDR-Farbe
  colorGlsl: string;
  rings?: number;
  points?: number;
  // Optional: Sichtbarkeit pro Weltpunkt (z. B. Wasserlinie), Standard 1
  maskGlsl?: string;
  uniforms?: Record<string, THREE.IUniform>;
}

// Kugel aus Breitenkreisen, jede Stachel hängt an einem Frequenzband
export class Urchin {
  readonly group = new THREE.Group();
  readonly lines: LineSet;
  readonly history: SpectrumHistory;
  private readonly occluder: THREE.Mesh;

  constructor(o: UrchinOptions) {
    const rings = o.rings ?? 260;
    const points = o.points ?? 520;
    this.history = new SpectrumHistory(ROWS);
    const glsl = `
${simplex3}
${tint}
${hue}
${spectrumHistoryGlsl(ROWS)}
uniform float uSpike;
uniform float uFreq;
uniform float uMirror;
const float PI = 3.14159265;

vec3 _u_hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

// Nächste Zelle: Abstand und Kennung
vec2 _u_cell(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  float md = 9.0, id = 0.0;
  for (int z = -1; z <= 1; z++)
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 h = _u_hash33(i + g);
    vec3 r = g + h * 0.85 - f;
    float d = dot(r, r);
    if (d < md) { md = d; id = h.x; }
  }
  return vec2(sqrt(md), id);
}

float urchinLift(vec3 n) {
  vec2 c = _u_cell(n * uFreq);
  float cone = pow(clamp(1.0 - c.x / 0.78, 0.0, 1.0), 2.2);
  float e = specAt(c.y * 0.8, c.y * 0.15);
  float wob = snoise3(n * 2.0 + uTime * 0.15) * 0.05;
  return wob + cone * (0.24 + pow(e, 1.2) * 1.15) * uSpike;
}

vec3 urchinPoint(float line, float t) {
  float phi = (line * ${rings - 1}.0 + 0.5) / ${rings}.0 * PI;
  float th = t * 2.0 * PI;
  vec3 n = vec3(sin(phi) * cos(th), cos(phi), sin(phi) * sin(th));
  return n * (1.0 + urchinLift(n));
}

${o.maskGlsl ?? 'float urchinMask(vec3 world) { return 1.0; }'}
${o.colorGlsl}

vec3 linePos(float line, float t) { return urchinPoint(line, t); }

float lineIntensity(float line, float t) {
  vec3 p = urchinPoint(line, t);
  vec3 world = (modelMatrix * vec4(p, 1.0)).xyz;
  return urchinMask(world * vec3(1.0, uMirror, 1.0));
}

vec3 lineColor(float line, float t) {
  vec3 p = urchinPoint(line, t);
  float lift = length(p) - 1.0;
  vec3 world = (modelMatrix * vec4(p, 1.0)).xyz;
  vec3 nrm = normalize(mat3(modelMatrix) * p);
  float facing = dot(nrm, normalize(cameraPosition - world));
  return urchinColor(world * vec3(1.0, uMirror, 1.0), lift, facing);
}
`;
    this.lines = new LineSet({
      lines: rings,
      points,
      width: 1.15,
      palette: o.palette,
      glsl,
      uniforms: {
        uSpecHist: { value: this.history.texture },
        uSpike: { value: 1 },
        uFreq: { value: 3.9 },
        uMirror: { value: 1 },
        uPaletteMix: o.paletteMix,
        ...o.uniforms,
      },
    });
    // Rückseite verdecken: Linien mit Tiefentest gegen eine schwarze Kugel
    this.lines.material.depthTest = true;
    this.occluder = new THREE.Mesh(
      new THREE.SphereGeometry(0.93, 64, 32),
      new THREE.MeshBasicMaterial({ color: 0x000000 }),
    );
    this.occluder.renderOrder = -1;
    this.lines.mesh.renderOrder = 1;
    this.group.add(this.occluder, this.lines.mesh);
  }

  get uniforms() {
    return this.lines.uniforms;
  }

  resize(width: number, height: number) {
    this.lines.uniforms.uRes.value.set(width, height);
  }

  dispose() {
    this.history.dispose();
    this.lines.dispose();
    this.occluder.geometry.dispose();
    (this.occluder.material as THREE.Material).dispose();
  }
}
