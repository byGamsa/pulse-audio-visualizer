import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { fullscreenVert } from '../../shared/glsl';

// Stable Fluids (Jos Stam): Advektion, Vorticity, Jacobi-Druck
const SIM_RES = 256;
const DYE_RES = 1024;
const PRESSURE_ITERATIONS = 20;
const SIM_DT = 1 / 60;

const header = `
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
`;

const neighbours = `
vec2 L() { return vUv - vec2(uTexel.x, 0.0); }
vec2 R() { return vUv + vec2(uTexel.x, 0.0); }
vec2 T() { return vUv + vec2(0.0, uTexel.y); }
vec2 B() { return vUv - vec2(0.0, uTexel.y); }
`;

const shaders = {
  advect: header + `
    uniform sampler2D uVelocity;
    uniform sampler2D uSource;
    uniform vec2 uVelTexel;
    uniform float uDt;
    uniform float uDissipation;
    void main() {
      vec2 coord = vUv - uDt * texture(uVelocity, vUv).xy * uVelTexel;
      gl_FragColor = texture(uSource, coord) / (1.0 + uDissipation * uDt);
    }`,
  divergence: header + neighbours + `
    uniform sampler2D uVelocity;
    void main() {
      float l = texture(uVelocity, L()).x;
      float r = texture(uVelocity, R()).x;
      float t = texture(uVelocity, T()).y;
      float b = texture(uVelocity, B()).y;
      vec2 c = texture(uVelocity, vUv).xy;
      // Ränder reflektieren, damit nichts aus dem Bild „ausläuft“
      if (L().x < 0.0) l = -c.x;
      if (R().x > 1.0) r = -c.x;
      if (T().y > 1.0) t = -c.y;
      if (B().y < 0.0) b = -c.y;
      gl_FragColor = vec4(0.5 * (r - l + t - b), 0.0, 0.0, 1.0);
    }`,
  curl: header + neighbours + `
    uniform sampler2D uVelocity;
    void main() {
      float l = texture(uVelocity, L()).y;
      float r = texture(uVelocity, R()).y;
      float t = texture(uVelocity, T()).x;
      float b = texture(uVelocity, B()).x;
      gl_FragColor = vec4(0.5 * (r - l - t + b), 0.0, 0.0, 1.0);
    }`,
  vorticity: header + neighbours + `
    uniform sampler2D uVelocity;
    uniform sampler2D uCurl;
    uniform float uStrength;
    uniform float uDt;
    void main() {
      float l = texture(uCurl, L()).x;
      float r = texture(uCurl, R()).x;
      float t = texture(uCurl, T()).x;
      float b = texture(uCurl, B()).x;
      float c = texture(uCurl, vUv).x;
      vec2 force = 0.5 * vec2(abs(t) - abs(b), abs(r) - abs(l));
      force /= length(force) + 1e-4;
      force *= uStrength * c;
      force.y *= -1.0;
      vec2 vel = texture(uVelocity, vUv).xy + force * uDt;
      gl_FragColor = vec4(clamp(vel, -1000.0, 1000.0), 0.0, 1.0);
    }`,
  pressure: header + neighbours + `
    uniform sampler2D uPressure;
    uniform sampler2D uDivergence;
    void main() {
      float l = texture(uPressure, L()).x;
      float r = texture(uPressure, R()).x;
      float t = texture(uPressure, T()).x;
      float b = texture(uPressure, B()).x;
      float d = texture(uDivergence, vUv).x;
      gl_FragColor = vec4((l + r + t + b - d) * 0.25, 0.0, 0.0, 1.0);
    }`,
  gradient: header + neighbours + `
    uniform sampler2D uPressure;
    uniform sampler2D uVelocity;
    void main() {
      float l = texture(uPressure, L()).x;
      float r = texture(uPressure, R()).x;
      float t = texture(uPressure, T()).x;
      float b = texture(uPressure, B()).x;
      vec2 vel = texture(uVelocity, vUv).xy - vec2(r - l, t - b);
      gl_FragColor = vec4(vel, 0.0, 1.0);
    }`,
  scale: header + `
    uniform sampler2D uSource;
    uniform float uValue;
    void main() { gl_FragColor = texture(uSource, vUv) * uValue; }`,
  splat: header + `
    uniform sampler2D uTarget;
    uniform float uAspect;
    uniform vec3 uColor;
    uniform vec2 uPoint;
    uniform float uRadius;
    void main() {
      vec2 p = vUv - uPoint;
      p.x *= uAspect;
      vec3 splat = exp(-dot(p, p) / uRadius) * uColor;
      gl_FragColor = vec4(texture(uTarget, vUv).xyz + splat, 1.0);
    }`,
  display: header + `
    uniform sampler2D uDye;
    uniform vec2 uDyeTexel;
    void main() {
      vec3 c = texture(uDye, vUv).rgb;
      // Seidiger Glanz: Helligkeitsgradient als Normale, Licht von oben links
      float l = dot(texture(uDye, vUv - vec2(uDyeTexel.x, 0.0)).rgb, vec3(0.33));
      float r = dot(texture(uDye, vUv + vec2(uDyeTexel.x, 0.0)).rgb, vec3(0.33));
      float t = dot(texture(uDye, vUv + vec2(0.0, uDyeTexel.y)).rgb, vec3(0.33));
      float b = dot(texture(uDye, vUv - vec2(0.0, uDyeTexel.y)).rgb, vec3(0.33));
      vec3 n = normalize(vec3(l - r, b - t, 0.04));
      vec3 lightDir = normalize(vec3(-0.5, 0.6, 1.0));
      float diffuse = clamp(dot(n, lightDir), 0.0, 1.0);
      float spec = pow(clamp(dot(reflect(-lightDir, n), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 24.0);
      vec3 col = c * (0.55 + 0.65 * diffuse) + spec * min(length(c), 1.5) * 0.6;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

type ProgramName = keyof typeof shaders;

function createTarget(w: number, h: number, type: THREE.TextureDataType = THREE.HalfFloatType) {
  return new THREE.WebGLRenderTarget(w, h, {
    type,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
  });
}

// Ping-Pong-Targets
class DoubleTarget {
  read: THREE.WebGLRenderTarget;
  write: THREE.WebGLRenderTarget;
  constructor(w: number, h: number) {
    this.read = createTarget(w, h);
    this.write = createTarget(w, h);
  }
  swap() {
    [this.read, this.write] = [this.write, this.read];
  }
  dispose() {
    this.read.dispose();
    this.write.dispose();
  }
}

interface Emitter {
  angle: number;
  speed: number;
  radius: number;
  hue: number;
}

class LiquidSilk implements VisualMode {
  private renderer!: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera();
  private readonly quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  private readonly programs = {} as Record<ProgramName, THREE.ShaderMaterial>;
  private velocity!: DoubleTarget;
  private dye!: DoubleTarget;
  private pressure!: DoubleTarget;
  private divergence!: THREE.WebGLRenderTarget;
  private curlTarget!: THREE.WebGLRenderTarget;
  private palette!: THREE.Texture;
  private readonly paletteSampler = new Float32Array(256 * 3);
  private aspect = 1;
  private time = 0;
  private accumulator = 0;
  private readonly emitters: Emitter[] = [
    { angle: 0, speed: 0.35, radius: 0.28, hue: 0.25 },
    { angle: 2.1, speed: -0.5, radius: 0.22, hue: 0.55 },
    { angle: 4.2, speed: 0.8, radius: 0.33, hue: 0.72 },
  ];
  private readonly lastPos = this.emitters.map(() => new THREE.Vector2());

  init(ctx: ModeContext) {
    this.renderer = ctx.renderer;
    this.palette = ctx.palette;
    for (const [name, frag] of Object.entries(shaders) as [ProgramName, string][]) {
      this.programs[name] = new THREE.ShaderMaterial({
        depthTest: false,
        depthWrite: false,
        vertexShader: fullscreenVert,
        fragmentShader: frag,
        uniforms: {
          uTexel: { value: new THREE.Vector2() },
          uVelTexel: { value: new THREE.Vector2() },
          uDyeTexel: { value: new THREE.Vector2() },
          uVelocity: { value: null },
          uSource: { value: null },
          uCurl: { value: null },
          uPressure: { value: null },
          uDivergence: { value: null },
          uTarget: { value: null },
          uDye: { value: null },
          uDt: { value: SIM_DT },
          uDissipation: { value: 0 },
          uStrength: { value: 0 },
          uValue: { value: 0 },
          uAspect: { value: 1 },
          uColor: { value: new THREE.Vector3() },
          uPoint: { value: new THREE.Vector2() },
          uRadius: { value: 0 },
        },
      });
    }
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  resize(width: number, height: number) {
    this.aspect = width / height;
    const sim = this.size(SIM_RES);
    const dye = this.size(DYE_RES);
    // Bei Größenänderung neu starten
    this.velocity?.dispose();
    this.dye?.dispose();
    this.pressure?.dispose();
    this.divergence?.dispose();
    this.curlTarget?.dispose();
    this.velocity = new DoubleTarget(sim.x, sim.y);
    this.pressure = new DoubleTarget(sim.x, sim.y);
    this.dye = new DoubleTarget(dye.x, dye.y);
    this.divergence = createTarget(sim.x, sim.y);
    this.curlTarget = createTarget(sim.x, sim.y);
  }

  private size(res: number) {
    return this.aspect >= 1
      ? new THREE.Vector2(Math.round(res * this.aspect), res)
      : new THREE.Vector2(res, Math.round(res / this.aspect));
  }

  update(a: AudioFeatures) {
    this.time += a.dt;
    this.readPalette();
    // Fester Zeitschritt: gleiches Verhalten bei 60 und 240 Hz
    this.accumulator = Math.min(this.accumulator + a.dt, SIM_DT * 3);
    while (this.accumulator >= SIM_DT) {
      this.accumulator -= SIM_DT;
      this.inject(a);
      this.step();
    }
  }

  // Palette für die Splat-Farben auf der CPU
  private readPalette() {
    const img = (this.palette as THREE.DataTexture).image as { data: Uint8Array };
    const d = img.data;
    for (let i = 0; i < 256; i++) {
      for (let c = 0; c < 3; c++) this.paletteSampler[i * 3 + c] = Math.pow(d[i * 4 + c] / 255, 2.2);
    }
  }

  private pal(t: number, intensity: number) {
    const i = Math.min(Math.max(Math.floor(t * 255), 0), 255) * 3;
    return new THREE.Vector3(this.paletteSampler[i], this.paletteSampler[i + 1], this.paletteSampler[i + 2]).multiplyScalar(intensity);
  }

  private inject(a: AudioFeatures) {
    const bands = [a.bass, a.mid, a.treble];
    this.emitters.forEach((e, i) => {
      const energy = bands[i];
      e.angle += SIM_DT * e.speed * (0.4 + energy * 2.2);
      const wobble = Math.sin(this.time * (0.3 + i * 0.17)) * 0.08;
      const x = 0.5 + Math.cos(e.angle) * (e.radius + wobble) / this.aspect;
      const y = 0.5 + Math.sin(e.angle * 1.3) * (e.radius + wobble);
      const last = this.lastPos[i];
      const dx = (x - last.x) * this.aspect;
      const dy = y - last.y;
      last.set(x, y);
      if (energy < 0.04) return;
      const force = 2600 * (0.3 + energy);
      this.splat(this.velocity, x, y, new THREE.Vector3(dx * force, dy * force, 0), 0.0012 + energy * 0.002);
      const hue = (e.hue + this.time * 0.01 + energy * 0.2) % 1;
      this.splat(this.dye, x, y, this.pal(hue, 0.1 + energy * 0.45), 0.0015 + energy * 0.003);
    });

    if (a.beat) {
      const n = 6;
      const base = Math.random() * Math.PI * 2;
      for (let k = 0; k < n; k++) {
        const ang = base + (k / n) * Math.PI * 2;
        const power = 500 + a.bassRaw * 1500;
        this.splat(this.velocity, 0.5, 0.5, new THREE.Vector3(Math.cos(ang) * power, Math.sin(ang) * power, 0), 0.004);
      }
      this.splat(this.dye, 0.5, 0.5, this.pal(0.45 + Math.random() * 0.25, 0.25 + a.bassRaw * 0.6), 0.003 + a.bassRaw * 0.004);
    }
  }

  private splat(target: DoubleTarget, x: number, y: number, color: THREE.Vector3, radius: number) {
    const p = this.programs.splat;
    p.uniforms.uTarget.value = target.read.texture;
    p.uniforms.uAspect.value = this.aspect;
    p.uniforms.uPoint.value.set(x, y);
    p.uniforms.uColor.value.copy(color);
    p.uniforms.uRadius.value = radius;
    this.blit(p, target.write);
    target.swap();
  }

  private step() {
    const simTexel = new THREE.Vector2(1 / this.velocity.read.width, 1 / this.velocity.read.height);
    for (const p of Object.values(this.programs)) p.uniforms.uTexel.value.copy(simTexel);

    const curl = this.programs.curl;
    curl.uniforms.uVelocity.value = this.velocity.read.texture;
    this.blit(curl, this.curlTarget);

    const vort = this.programs.vorticity;
    vort.uniforms.uVelocity.value = this.velocity.read.texture;
    vort.uniforms.uCurl.value = this.curlTarget.texture;
    vort.uniforms.uStrength.value = 28;
    this.blit(vort, this.velocity.write);
    this.velocity.swap();

    const div = this.programs.divergence;
    div.uniforms.uVelocity.value = this.velocity.read.texture;
    this.blit(div, this.divergence);

    const scale = this.programs.scale;
    scale.uniforms.uSource.value = this.pressure.read.texture;
    scale.uniforms.uValue.value = 0.8;
    this.blit(scale, this.pressure.write);
    this.pressure.swap();

    const pressure = this.programs.pressure;
    pressure.uniforms.uDivergence.value = this.divergence.texture;
    for (let i = 0; i < PRESSURE_ITERATIONS; i++) {
      pressure.uniforms.uPressure.value = this.pressure.read.texture;
      this.blit(pressure, this.pressure.write);
      this.pressure.swap();
    }

    const grad = this.programs.gradient;
    grad.uniforms.uPressure.value = this.pressure.read.texture;
    grad.uniforms.uVelocity.value = this.velocity.read.texture;
    this.blit(grad, this.velocity.write);
    this.velocity.swap();

    const adv = this.programs.advect;
    adv.uniforms.uVelTexel.value.copy(simTexel);
    adv.uniforms.uVelocity.value = this.velocity.read.texture;
    adv.uniforms.uSource.value = this.velocity.read.texture;
    adv.uniforms.uDissipation.value = 0.25;
    this.blit(adv, this.velocity.write);
    this.velocity.swap();

    adv.uniforms.uVelocity.value = this.velocity.read.texture;
    adv.uniforms.uSource.value = this.dye.read.texture;
    adv.uniforms.uDissipation.value = 0.9;
    this.blit(adv, this.dye.write);
    this.dye.swap();
  }

  private blit(material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    const d = this.programs.display;
    d.uniforms.uDye.value = this.dye.read.texture;
    d.uniforms.uDyeTexel.value.set(1 / this.dye.read.width, 1 / this.dye.read.height);
    this.renderer = renderer;
    this.blit(d, target);
  }

  dispose() {
    for (const p of Object.values(this.programs)) p.dispose();
    this.quad.geometry.dispose();
    this.velocity.dispose();
    this.dye.dispose();
    this.pressure.dispose();
    this.divergence.dispose();
    this.curlTarget.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('liquid-silk').meta,
  create: () => new LiquidSilk(),
};
export default definition;
