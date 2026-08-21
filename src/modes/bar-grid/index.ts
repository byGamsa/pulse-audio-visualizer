import * as THREE from 'three';
import { BAND_COUNT, type AudioFeatures } from '../../audio/types';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { palette, tint } from '../../shared/glsl';

const COLS = 20;
const ROWS = 20;
// Neue Zeile alle x Sekunden: die Historie rollt von vorn nach hinten
const ROW_INTERVAL = 0.06;

const vert = `
${palette}
${tint}
attribute vec2 aCell;
attribute float aHeight;
varying vec3 vColor;
varying float vTop;
varying float vHeight;

vec3 hsv(float h, float s, float v) {
  vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return tint(v * mix(vec3(1.0), k, s));
}

void main() {
  float h = max(aHeight, 0.04);
  vec3 p = position;
  // Box geht von y = 0 bis 1; nach oben auf die Säulenhöhe strecken
  p.y *= h;
  vTop = position.y;
  vHeight = h;
  vColor = hsv(fract(0.95 - (aCell.x * 0.55 + aCell.y * 0.3)), 1.0, 1.0);
  vec4 world = instanceMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * world;
}
`;

const frag = `
precision highp float;
varying vec3 vColor;
varying float vTop;
varying float vHeight;
void main() {
  // Unten satt, oben heller; die Deckfläche glüht
  float lift = 0.45 + 0.55 * vTop;
  float cap = smoothstep(0.98, 1.0, vTop);
  vec3 col = vColor * lift * (0.45 + min(vHeight, 5.0) * 0.1) + vColor * cap * 0.6;
  gl_FragColor = vec4(col, 1.0);
}
`;

class BarGrid implements VisualMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  private mesh!: THREE.InstancedMesh;
  private geometry!: THREE.BoxGeometry;
  private material!: THREE.ShaderMaterial;
  private readonly heights = new Float32Array(COLS * ROWS);
  private readonly display = new Float32Array(COLS * ROWS);
  private heightAttr!: THREE.InstancedBufferAttribute;
  private clock = 0;
  private time = 0;

  init(ctx: ModeContext) {
    this.geometry = new THREE.BoxGeometry(0.62, 1, 0.62);
    this.geometry.translate(0, 0.5, 0);
    const cells = new Float32Array(COLS * ROWS * 2);
    this.heightAttr = new THREE.InstancedBufferAttribute(this.display, 1);
    this.heightAttr.setUsage(THREE.DynamicDrawUsage);
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: { uPalette: { value: ctx.palette }, uPaletteMix: ctx.paletteMix },
    });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, COLS * ROWS);
    const m = new THREE.Matrix4();
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        m.makeTranslation(c - (COLS - 1) / 2, 0, r - (ROWS - 1) / 2);
        this.mesh.setMatrixAt(i, m);
        cells[i * 2] = c / (COLS - 1);
        cells[i * 2 + 1] = r / (ROWS - 1);
      }
    this.geometry.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 2));
    this.geometry.setAttribute('aHeight', this.heightAttr);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    this.clock += dt;
    // Vorderste Zeile = jetzt
    if (this.clock >= ROW_INTERVAL) {
      this.clock = 0;
      this.heights.copyWithin(COLS, 0, COLS * (ROWS - 1));
    }
    for (let c = 0; c < COLS; c++) {
      const from = Math.floor((c / COLS) * 100);
      const to = Math.floor(((c + 1) / COLS) * 100);
      let v = 0;
      for (let k = from; k < Math.min(to, BAND_COUNT); k++) v = Math.max(v, a.spectrum[k]);
      this.heights[c] = v * 5.5;
    }
    // Weich nachführen, damit nichts ruckelt, wenn die Zeilen weiterrücken
    for (let i = 0; i < this.display.length; i++) this.display[i] += (this.heights[i] - this.display[i]) * Math.min(dt * 14, 1);
    this.heightAttr.needsUpdate = true;

    const t = this.time * 0.08;
    this.camera.position.set(Math.sin(t) * 31, 17 + Math.sin(this.time * 0.05) * 2, Math.cos(t) * 31);
    this.camera.lookAt(0, 1, 0);
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('bar-grid').meta,
  create: () => new BarGrid(),
};
export default definition;
