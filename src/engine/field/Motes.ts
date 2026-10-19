import * as THREE from 'three';

export interface MotesOptions {
  count: number;
  // Halbe Kantenlängen der Box um den Ursprung
  box: THREE.Vector3;
  // Drift pro Sekunde
  drift?: THREE.Vector3;
  // Größe in Pixeln bei 1080p und Distanz 1
  size?: number;
  color?: THREE.Color;
  // Ab welchem Abstand zur Schärfe Punkte zu Bokeh-Scheiben werden
  focus?: number;
  dof?: number;
}

// Schwebende Lichtpunkte mit weicher Tiefenunschärfe
export class Motes {
  readonly points: THREE.Points;
  readonly material: THREE.ShaderMaterial;
  private readonly geometry: THREE.BufferGeometry;

  constructor(o: MotesOptions) {
    const pos = new Float32Array(o.count * 3);
    const seed = new Float32Array(o.count);
    for (let i = 0; i < o.count; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * o.box.x;
      pos[i * 3 + 1] = (Math.random() * 2 - 1) * o.box.y;
      pos[i * 3 + 2] = (Math.random() * 2 - 1) * o.box.z;
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
      uniforms: {
        uTime: { value: 0 },
        uBox: { value: o.box.clone() },
        uDrift: { value: (o.drift ?? new THREE.Vector3(0, 0.1, 0)).clone() },
        uSize: { value: o.size ?? 6 },
        uColor: { value: (o.color ?? new THREE.Color(1, 1, 1)).clone() },
        uGain: { value: 1 },
        uFocus: { value: o.focus ?? 6 },
        uDof: { value: o.dof ?? 3 },
        uScale: { value: 1 },
      },
      vertexShader: `
        attribute float seed;
        uniform float uTime;
        uniform vec3 uBox;
        uniform vec3 uDrift;
        uniform float uSize;
        uniform float uGain;
        uniform float uFocus;
        uniform float uDof;
        uniform float uScale;
        out float vAlpha;
        out float vSoft;
        void main() {
          // Drift mit Wiedereintritt auf der Gegenseite
          vec3 p = position + uDrift * uTime * (0.6 + seed * 0.8);
          p += vec3(sin(uTime * 0.3 + seed * 30.0), cos(uTime * 0.23 + seed * 17.0), sin(uTime * 0.27 + seed * 9.0)) * 0.15;
          p = mod(p + uBox, uBox * 2.0) - uBox;
          vec4 c = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          float base = uSize * (0.4 + seed * 0.9) * uScale / max(c.w, 0.1);
          float blur = min(abs(c.w - uFocus) * uDof, 40.0) * uScale;
          float size = max(base, 1.0) + blur;
          gl_PointSize = size;
          vAlpha = c.w > 0.0 ? uGain * (0.4 + 0.6 * fract(seed * 7.3)) * (base * base) / (size * size) : 0.0;
          vSoft = clamp(blur / size, 0.0, 1.0);
          gl_Position = c;
        }
      `,
      fragmentShader: `
        precision highp float;
        uniform vec3 uColor;
        in float vAlpha;
        in float vSoft;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float r2 = dot(c, c) * 4.0;
          if (r2 > 1.0) discard;
          float sharp = exp(-r2 * 5.0);
          float bokeh = smoothstep(1.0, 0.8, r2) * (0.6 + 0.4 * r2);
          gl_FragColor = vec4(uColor * vAlpha * mix(sharp, bokeh, vSoft), 1.0);
        }
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
    this.material.uniforms.uScale.value = height / 1080;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
