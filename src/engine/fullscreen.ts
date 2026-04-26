import * as THREE from 'three';
import { fullscreenVert } from '../shared/glsl';

// Fullscreen-Quad für Raymarching- und 2D-Modi
export class FullscreenPass {
  readonly material: THREE.ShaderMaterial;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera();
  private readonly geometry = new THREE.PlaneGeometry(2, 2);

  constructor(fragmentShader: string, uniforms: Record<string, THREE.IUniform>) {
    this.material = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: { uRes: { value: new THREE.Vector2(1, 1) }, ...uniforms },
      vertexShader: fullscreenVert,
      fragmentShader,
    });
    const quad = new THREE.Mesh(this.geometry, this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  get uniforms() {
    return this.material.uniforms;
  }

  resize(width: number, height: number) {
    this.material.uniforms.uRes.value.set(width, height);
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

let noiseTexture: THREE.DataTexture | null = null;

// Billiger als prozedurales Noise in Raymarch-Schleifen
export function getNoiseTexture(): THREE.DataTexture {
  if (noiseTexture) return noiseTexture;
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(Math.random() * 256);
  noiseTexture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  noiseTexture.wrapS = noiseTexture.wrapT = THREE.RepeatWrapping;
  noiseTexture.magFilter = THREE.LinearFilter;
  noiseTexture.minFilter = THREE.LinearFilter;
  noiseTexture.needsUpdate = true;
  return noiseTexture;
}

// Ohne vorher zu leeren
export function renderOver(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget, scene: THREE.Scene, camera: THREE.Camera) {
  const autoClear = renderer.autoClear;
  renderer.autoClear = false;
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  renderer.autoClear = autoClear;
}
