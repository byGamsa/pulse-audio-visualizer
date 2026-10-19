import * as THREE from 'three';

// Feine Sterne auf einer großen Kugel um die Kamera
export class Starfield {
  readonly points: THREE.Points;
  readonly material: THREE.ShaderMaterial;
  private readonly geometry: THREE.BufferGeometry;

  constructor(count = 2500, radius = 80, brightness = 1) {
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // Gleichverteilt auf der Kugel
      const z = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - z * z);
      pos[i * 3] = Math.cos(a) * s * radius;
      pos[i * 3 + 1] = z * radius;
      pos[i * 3 + 2] = Math.sin(a) * s * radius;
      seed[i] = Math.random();
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geometry.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uBright: { value: brightness }, uScale: { value: 1 } },
      vertexShader: `
        attribute float seed;
        uniform float uTime;
        uniform float uBright;
        uniform float uScale;
        out float vAlpha;
        void main() {
          // Wenige helle, viele schwache Sterne, leichtes Funkeln
          float b = pow(seed, 6.0) * 2.5 + 0.08;
          b *= 0.75 + 0.25 * sin(uTime * (1.0 + seed * 3.0) + seed * 40.0);
          vAlpha = b * uBright;
          gl_PointSize = (1.0 + seed * 1.6) * uScale;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        in float vAlpha;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float a = exp(-dot(c, c) * 16.0);
          gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * vAlpha * a, 1.0);
        }
      `,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  update(time: number, height: number) {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uScale.value = Math.max(height / 1080, 0.5);
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
