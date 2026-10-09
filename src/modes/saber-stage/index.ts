import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { AudioFeatures } from '../../audio/types';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { palette, tint } from '../../shared/glsl';

const RINGS = 16;
const SIDE_LASERS = 4;
const BACK_LASERS = 7;
const CUBES = 28;
const SPARKS = 1200;
// Schweif-Proben; bei 240 Hz Teilschritten deckt das gut 0,15 s ab
const TRAIL = 36;
const SUBSTEP = 1 / 240;
// Würfel starten hier und werden kurz vor der Kamera geschnitten
const SPAWN_Z = -46;
const CUT_Z = -0.95;
// Flugzeit in Beats
const TRAVEL_BEATS = 4;
// Ausholen und Durchziehen in Sekunden
const WINDUP = 0.14;
const STRIKE = 0.15;
// Spiegelungen im Boden sind so viel dunkler als das Original
const MIRROR = 0.22;

const RED = new THREE.Color(1.0, 0.015, 0.05);
const BLUE = new THREE.Color(0.0, 0.28, 1.0);

const glowVert = `
varying vec2 vUv;
varying float vDist;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const glowFrag = `
${palette}
${tint}
uniform vec3 uColor;
uniform float uIntensity;
uniform float uAlong;
uniform float uAcross;
uniform float uCore;
varying vec2 vUv;
varying float vDist;
void main() {
  // ShapeGeometry liefert UVs außerhalb 0..1; ohne clamp ergäbe pow() NaN
  float a = mix(1.0, pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.2), uAlong);
  float x = min(abs(vUv.x - 0.5) * 2.0, 1.0);
  float halo = mix(1.0, exp(-x * x * 3.0), uAcross);
  // Weiß glühender Kern in der Mitte des Strahls, außen die Farbe
  float core = exp(-x * x * 70.0) * uCore;
  float fog = exp(-vDist * 0.006);
  // Kern nur leicht aufgehellt: so bleibt der Strahl farbig statt weiß
  vec3 c = tint(uColor);
  vec3 col = c * halo * 1.3 + mix(c, vec3(1.0), 0.3) * core * 1.5;
  gl_FragColor = vec4(col * uIntensity * a * fog, 1.0);
}
`;

const cubeVert = `
varying vec3 vN;
varying vec3 vObjN;
varying vec3 vView;
varying float vDist;
void main() {
  vObjN = normal;
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = normalize(-mv.xyz);
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const cubeFrag = `
${palette}
${tint}
uniform vec3 uColor;
uniform float uAlpha;
uniform float uCut;
uniform vec3 uCutN;
uniform vec3 uEnv;
varying vec3 vN;
varying vec3 vObjN;
varying vec3 vView;
varying float vDist;
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(vView);
  vec3 l = normalize(vec3(-0.3, 0.8, 0.6));
  float diff = max(dot(n, l), 0.0);
  float spec = pow(max(dot(reflect(-l, n), v), 0.0), 48.0);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 2.5);
  // Lack: dunkle Grundfarbe, farbiger Rand, scharfes Glanzlicht
  vec3 base = tint(uColor);
  vec3 col = base * (0.16 + 0.45 * diff) + base * fres * 1.8 + vec3(1.0) * spec * 0.5 + tint(uEnv) * (0.12 + fres * 0.3);
  // Schnittfläche glüht
  float cut = smoothstep(0.85, 0.98, dot(normalize(vObjN), uCutN)) * uCut;
  col = mix(col, mix(base, vec3(1.0), 0.45) * 3.0, cut);
  gl_FragColor = vec4(col * exp(-vDist * 0.006), uAlpha);
}
`;

const sparkVert = `
attribute float aLife;
attribute vec3 aColor;
uniform float uScale;
varying float vLife;
varying vec3 vColor;
void main() {
  vLife = aLife;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aLife > 0.0 ? uScale * (0.3 + aLife) / max(-mv.z, 0.1) : 0.0;
  gl_Position = projectionMatrix * mv;
}
`;

const sparkFrag = `
${palette}
${tint}
varying float vLife;
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = exp(-dot(c, c) * 20.0);
  gl_FragColor = vec4(mix(tint(vColor), vec3(1.0), 0.55) * a * vLife * 4.0, 1.0);
}
`;

const trailVert = `
attribute float aAge;
attribute float aEdge;
varying float vAge;
varying float vEdge;
void main() {
  vAge = aAge;
  vEdge = aEdge;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const trailFrag = `
${palette}
${tint}
uniform vec3 uColor;
uniform float uIntensity;
varying float vAge;
varying float vEdge;
void main() {
  // Zur Spitze hin heller, mit dem Alter verblassend
  float a = pow(1.0 - vAge, 2.0) * (0.3 + vEdge * 0.7);
  gl_FragColor = vec4(mix(tint(uColor), vec3(1.0), 0.3 * vEdge) * a * uIntensity, 1.0);
}
`;

const floorFrag = `
${palette}
${tint}
uniform vec3 uTint;
varying vec2 vUv;
varying float vDist;
void main() {
  // Hochglanzboden mit Fugenraster
  vec2 g = abs(fract(vUv * vec2(30.0, 100.0)) - 0.5);
  float line = exp(-min(g.x, g.y) * 80.0) * 0.04;
  vec3 col = tint(uTint) * (0.03 + line) * exp(-vDist * 0.03);
  gl_FragColor = vec4(col, 0.82);
}
`;

const hazeFrag = `
${palette}
${tint}
uniform vec3 uColor;
uniform float uIntensity;
varying vec2 vUv;
varying float vDist;
void main() {
  // Weicher Lichtnebel am Ende der Strecke, nach oben auslaufend
  vec2 p = vUv - vec2(0.5, 0.42);
  float d = length(p * vec2(1.0, 1.6));
  // Vor dem Rand auf null, sonst sieht man die Kante
  float fall = exp(-d * 4.0) * (1.0 - smoothstep(0.2, 0.48, d));
  gl_FragColor = vec4(tint(uColor) * fall * uIntensity, 1.0);
}
`;

function glowMaterial(along: number, across: number, color = RED, core = 1) {
  return new THREE.ShaderMaterial({
    vertexShader: glowVert,
    fragmentShader: glowFrag,
    uniforms: {
      uColor: { value: color.clone() },
      uIntensity: { value: 1 },
      uAlong: { value: along },
      uAcross: { value: across },
      uCore: { value: core },
    },
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function cubeMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: cubeVert,
    fragmentShader: cubeFrag,
    uniforms: {
      uColor: { value: RED.clone() },
      uAlpha: { value: 1 },
      uCut: { value: 0 },
      uCutN: { value: new THREE.Vector3(1, 0, 0) },
      uEnv: { value: new THREE.Color(0, 0, 0) },
    },
    transparent: true,
  });
}

// Quadratischer Rahmen als flache Fläche mit Loch
function frameGeometry(half: number, thick: number) {
  const s = new THREE.Shape();
  s.moveTo(-half, -half); s.lineTo(half, -half); s.lineTo(half, half); s.lineTo(-half, half); s.lineTo(-half, -half);
  const h = new THREE.Path();
  const i = half - thick;
  h.moveTo(-i, -i); h.lineTo(-i, i); h.lineTo(i, i); h.lineTo(i, -i); h.lineTo(-i, -i);
  s.holes.push(h);
  return new THREE.ShapeGeometry(s);
}

// Zwei gekreuzte Flächen, sichtbar aus jedem Winkel
function beam(width: number, length: number, mat: THREE.Material) {
  const g = new THREE.PlaneGeometry(width, length);
  g.translate(0, length / 2, 0);
  const grp = new THREE.Group();
  const a = new THREE.Mesh(g, mat);
  const b = new THREE.Mesh(g, mat);
  b.rotation.y = Math.PI / 2;
  grp.add(a, b);
  return grp;
}

// Material plus dunkleres Gegenstück für die Spiegelung
class LightGroup {
  readonly mat: THREE.ShaderMaterial;
  readonly mirror: THREE.ShaderMaterial;
  constructor(along: number, across: number, color: THREE.Color, core = 1) {
    this.mat = glowMaterial(along, across, color, core);
    this.mirror = glowMaterial(along, across, color, core);
  }
  set(intensity: number, color?: THREE.Color) {
    this.mat.uniforms.uIntensity.value = intensity;
    this.mirror.uniforms.uIntensity.value = intensity * MIRROR;
    if (color) {
      this.mat.uniforms.uColor.value.copy(color);
      this.mirror.uniforms.uColor.value.copy(color);
    }
  }
  dispose() {
    this.mat.dispose();
    this.mirror.dispose();
  }
}

interface Cube {
  group: THREE.Group;
  mat: THREE.ShaderMaterial;
  active: boolean;
  swung: boolean;
  angle: number;
  red: boolean;
}

interface Half {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
}

type SwingPhase = 'idle' | 'windup' | 'strike';

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// Ease-in-out wie ein echter Hieb
const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

// Ausholen, Durchziehen, Zurückfedern in festen 240-Hz-Schritten
class Saber {
  readonly group = new THREE.Group();
  private readonly base: THREE.Vector3;
  private readonly hand = new THREE.Vector3();
  private readonly handTarget = new THREE.Vector3();
  private readonly rest: THREE.Vector3;
  private readonly q = new THREE.Quaternion();
  private readonly qTarget = new THREE.Quaternion();
  private readonly qStart = new THREE.Quaternion();
  private readonly qFrom = new THREE.Quaternion();
  private readonly qTo = new THREE.Quaternion();
  private readonly tmp = new THREE.Vector3();
  private readonly lean = new THREE.Vector3();
  private phase: SwingPhase = 'idle';
  private phaseT = 0;
  private clock = 0;
  private time = 0;
  private activity = 0;
  private readonly prevTip = new THREE.Vector3();
  private readonly trailPos = new Float32Array(TRAIL * 2 * 3);
  private readonly trailAge = new Float32Array(TRAIL * 2);
  private readonly samples: THREE.Vector3[] = [];
  readonly trailGeo = new THREE.BufferGeometry();
  readonly trailMat: THREE.ShaderMaterial;
  readonly bladeMat: THREE.ShaderMaterial;
  private static readonly UP = new THREE.Vector3(0, 1, 0);
  static readonly BLADE = 1.25;

  constructor(private readonly side: number, color: THREE.Color, handleMat: THREE.Material, handleGeo: THREE.BufferGeometry) {
    this.base = new THREE.Vector3(side * 0.34, 1.05, 0.55);
    this.hand.copy(this.base);
    this.handTarget.copy(this.base);
    this.rest = new THREE.Vector3(side * 0.12, 0.75, -0.65).normalize();
    this.q.setFromUnitVectors(Saber.UP, this.rest);
    this.bladeMat = glowMaterial(0, 1, color, 0.9);
    this.bladeMat.uniforms.uIntensity.value = 2.6;
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.position.y = -0.12;
    this.group.add(handle, beam(0.11, Saber.BLADE, this.bladeMat));

    const tip = this.base.clone().addScaledVector(this.rest, Saber.BLADE);
    const root = this.base.clone().addScaledVector(this.rest, Saber.BLADE * 0.3);
    this.prevTip.copy(tip);
    for (let i = 0; i < TRAIL; i++) this.samples.push(root.clone(), tip.clone());
    const index: number[] = [];
    for (let i = 0; i < TRAIL - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const edge = new Float32Array(TRAIL * 2);
    for (let i = 0; i < TRAIL; i++) { edge[i * 2] = 0; edge[i * 2 + 1] = 1; }
    this.trailGeo.setIndex(index);
    this.trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.trailGeo.setAttribute('aAge', new THREE.BufferAttribute(this.trailAge, 1).setUsage(THREE.DynamicDrawUsage));
    this.trailGeo.setAttribute('aEdge', new THREE.BufferAttribute(edge, 1));
    for (let i = 0; i < TRAIL * 2; i++) this.trailAge[i] = Math.floor(i / 2) / (TRAIL - 1);
    this.trailMat = new THREE.ShaderMaterial({
      vertexShader: trailVert,
      fragmentShader: trailFrag,
      uniforms: { uColor: { value: color.clone() }, uIntensity: { value: 0 } },
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.writeTrail();
  }

  // Trifft nach WINDUP + STRIKE / 2
  strike(target: THREE.Vector3, swing: THREE.Vector3) {
    // Die Hand lehnt sich ein Stück zum Ziel
    this.lean.copy(target).sub(this.base).multiplyScalar(0.12);
    this.handTarget.copy(this.base).add(this.lean);
    const aim = target.clone().sub(this.handTarget);
    const reach = aim.length();
    // Bogen bekommt Tiefe
    const from = aim.clone().addScaledVector(swing, -reach * 0.8).add(new THREE.Vector3(0, 0, 0.25)).normalize();
    const to = aim.clone().addScaledVector(swing, reach * 0.85).add(new THREE.Vector3(0, 0, -0.2)).normalize();
    this.qStart.copy(this.q);
    this.qFrom.setFromUnitVectors(Saber.UP, from);
    this.qTo.setFromUnitVectors(Saber.UP, to);
    this.phase = 'windup';
    this.phaseT = 0;
  }

  update(dt: number) {
    // Feste Teilschritte, unabhängig von der Bildrate
    this.clock += dt;
    while (this.clock >= SUBSTEP) {
      this.clock -= SUBSTEP;
      this.step(SUBSTEP);
    }
    this.group.position.copy(this.hand);
    this.group.quaternion.copy(this.q);
    this.writeTrail();
    this.trailMat.uniforms.uIntensity.value = this.activity * 0.9;
  }

  private step(dt: number) {
    this.time += dt;
    let follow = 9;
    if (this.phase === 'windup') {
      this.phaseT = Math.min(this.phaseT + dt / WINDUP, 1);
      this.qTarget.slerpQuaternions(this.qStart, this.qFrom, easeInOut(this.phaseT));
      follow = 45;
      if (this.phaseT >= 1) { this.phase = 'strike'; this.phaseT = 0; }
    } else if (this.phase === 'strike') {
      this.phaseT = Math.min(this.phaseT + dt / STRIKE, 1);
      this.qTarget.slerpQuaternions(this.qFrom, this.qTo, smoother(this.phaseT));
      follow = 70;
      if (this.phaseT >= 1) { this.phase = 'idle'; this.handTarget.copy(this.base); }
    } else {
      // Ruhelage mit leichtem Wiegen
      this.tmp.set(
        this.rest.x + Math.sin(this.time * 0.9 + this.side) * 0.06,
        this.rest.y + Math.sin(this.time * 1.3 + this.side * 2) * 0.04,
        this.rest.z,
      ).normalize();
      this.qTarget.setFromUnitVectors(Saber.UP, this.tmp);
    }
    this.q.slerp(this.qTarget, 1 - Math.exp(-follow * dt));
    this.hand.lerp(this.handTarget, 1 - Math.exp(-12 * dt));

    // Helligkeit folgt der Klingengeschwindigkeit
    const dir = this.tmp.copy(Saber.UP).applyQuaternion(this.q);
    const tip = this.samples[TRAIL * 2 - 1];
    const root = this.samples[TRAIL * 2 - 2];
    this.samples.length -= 2;
    root.copy(this.hand).addScaledVector(dir, Saber.BLADE * 0.3);
    tip.copy(this.hand).addScaledVector(dir, Saber.BLADE);
    this.samples.unshift(root, tip);
    const speed = tip.distanceTo(this.prevTip) / dt;
    this.prevTip.copy(tip);
    const target = THREE.MathUtils.clamp((speed - 1.5) / 8, 0, 1);
    this.activity += (target - this.activity) * (1 - Math.exp(-(target > this.activity ? 40 : 6) * dt));
  }

  private writeTrail() {
    for (let i = 0; i < TRAIL * 2; i++) {
      const s = this.samples[i];
      this.trailPos[i * 3] = s.x; this.trailPos[i * 3 + 1] = s.y; this.trailPos[i * 3 + 2] = s.z;
    }
    this.trailGeo.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.trailGeo.dispose();
    this.trailMat.dispose();
    this.bladeMat.dispose();
  }
}

class SaberStage implements VisualMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(72, 1, 0.05, 300);
  private readonly disposables: { dispose(): void }[] = [];

  private readonly ringLight = new LightGroup(0, 0, RED, 0);
  private readonly backLight = new LightGroup(1, 1, BLUE);
  private readonly leftLight = new LightGroup(1, 1, RED);
  private readonly rightLight = new LightGroup(1, 1, BLUE);
  private readonly centerLight = new LightGroup(0, 1, BLUE);
  private arrowMat!: THREE.ShaderMaterial;
  private floorMat!: THREE.ShaderMaterial;
  private hazeMat!: THREE.ShaderMaterial;
  private readonly rings: THREE.Group[] = [];
  private readonly ringAngle = new Float32Array(RINGS);
  private readonly leftLasers: THREE.Group[] = [];
  private readonly rightLasers: THREE.Group[] = [];
  private readonly backLasers: THREE.Group[] = [];
  private readonly cubes: Cube[] = [];
  private readonly halves: Half[] = [];
  private sabers!: [Saber, Saber];

  private sparkGeo!: THREE.BufferGeometry;
  private readonly sparkPos = new Float32Array(SPARKS * 3);
  private readonly sparkVel = new Float32Array(SPARKS * 3);
  private readonly sparkLife = new Float32Array(SPARKS);
  private readonly sparkColor = new Float32Array(SPARKS * 3);
  private sparkHead = 0;
  private sparkMat!: THREE.ShaderMaterial;
  private readonly env = new THREE.Color();

  private time = 0;
  private beats = 0;
  private ringI = 0.5;
  private ringRed = true;
  private ringTarget = 0;
  private spinDir = 1;
  private spacing = 4.2;
  private spacingTarget = 4.2;
  private backI = 0.2;
  private centerI = 0.5;
  private laserPhase = 0;
  private onsetCooldown = 0;

  init(ctx: ModeContext) {
    const track = <T extends { dispose(): void }>(o: T) => { this.disposables.push(o); return o; };
    for (const l of [this.ringLight, this.backLight, this.leftLight, this.rightLight, this.centerLight]) track(l);
    this.arrowMat = track(glowMaterial(0, 0, new THREE.Color(1, 1, 1), 0));
    this.arrowMat.uniforms.uIntensity.value = 3;

    // Original oben, Spiegelung an der Bodenebene
    const mirror = new THREE.Group();
    mirror.scale.y = -1;
    this.scene.add(mirror);
    const body = track(frameGeometry(7.2, 1.1));
    const strip = track(frameGeometry(6.25, 0.12));
    const bodyMat = track(new THREE.MeshBasicMaterial({ color: 0x050507, side: THREE.DoubleSide }));
    const lineGeo = track(new THREE.PlaneGeometry(0.06, 90));
    for (const [parent, mirrored] of [[this.scene, false], [mirror, true]] as const) {
      const pick = (l: LightGroup) => (mirrored ? l.mirror : l.mat);
      for (let i = 0; i < RINGS; i++) {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(body, bodyMat), new THREE.Mesh(strip, pick(this.ringLight)));
        g.position.set(0, 1.4, -20 - i * this.spacing);
        this.rings.push(g);
        parent.add(g);
      }
      for (let i = 0; i < SIDE_LASERS; i++) {
        const l = beam(0.3, 90, pick(this.leftLight));
        l.position.set(-11, -3, -28 - i * 9);
        const r = beam(0.3, 90, pick(this.rightLight));
        r.position.set(11, -3, -28 - i * 9);
        this.leftLasers.push(l);
        this.rightLasers.push(r);
        parent.add(l, r);
      }
      for (let i = 0; i < BACK_LASERS; i++) {
        const b = beam(0.6, 160, pick(this.backLight));
        b.position.set((i - (BACK_LASERS - 1) / 2) * 7, -6, -135);
        this.backLasers.push(b);
        parent.add(b);
      }
      for (const x of [-1.25, 1.25, -1.6, 1.6]) {
        const m = new THREE.Mesh(lineGeo, pick(this.centerLight));
        m.rotation.x = -Math.PI / 2;
        m.position.set(x, 0.005, -46);
        parent.add(m);
      }
    }

    // Boden über der Spiegelung, Nebel am Ende
    this.floorMat = track(new THREE.ShaderMaterial({
      vertexShader: glowVert,
      fragmentShader: floorFrag,
      uniforms: { uTint: { value: new THREE.Color(0.5, 0.5, 0.6) } },
      transparent: true,
      depthWrite: false,
    }));
    const floor = new THREE.Mesh(track(new THREE.PlaneGeometry(80, 220)), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -100);
    floor.renderOrder = 1;
    this.scene.add(floor);
    const laneMat = track(new THREE.MeshBasicMaterial({ color: 0x07070a }));
    const lane = new THREE.Mesh(track(new THREE.PlaneGeometry(2.4, 90)), laneMat);
    lane.rotation.x = -Math.PI / 2;
    lane.position.set(0, 0.002, -46);
    const platform = new THREE.Mesh(track(new THREE.PlaneGeometry(3, 3)), laneMat);
    platform.rotation.x = -Math.PI / 2;
    platform.position.set(0, 0.002, 0.4);
    this.scene.add(lane, platform);
    const edgeGeo = track(new THREE.PlaneGeometry(3, 0.05));
    for (const z of [-1.1, 1.9]) {
      const m = new THREE.Mesh(edgeGeo, this.centerLight.mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, 0.006, z);
      this.scene.add(m);
    }
    this.hazeMat = track(new THREE.ShaderMaterial({
      vertexShader: glowVert,
      fragmentShader: hazeFrag,
      uniforms: { uColor: { value: RED.clone() }, uIntensity: { value: 0.3 } },
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }));
    const haze = new THREE.Mesh(track(new THREE.PlaneGeometry(260, 160)), this.hazeMat);
    haze.position.set(0, 20, -190);
    this.scene.add(haze);

    // Würfel: abgerundet, Pfeil (oder Punkt) auf der Vorderseite
    const cubeGeo = track(new RoundedBoxGeometry(0.5, 0.5, 0.5, 4, 0.07));
    const chevron = new THREE.Shape();
    chevron.moveTo(-0.19, 0.08); chevron.lineTo(0.19, 0.08); chevron.lineTo(0, -0.1); chevron.lineTo(-0.19, 0.08);
    const arrowGeo = track(new THREE.ShapeGeometry(chevron));
    const dotGeo = track(new THREE.CircleGeometry(0.075, 24));
    for (let i = 0; i < CUBES; i++) {
      const mat = track(cubeMaterial());
      const group = new THREE.Group();
      const arrow = new THREE.Mesh(arrowGeo, this.arrowMat);
      arrow.position.z = 0.253;
      const dot = new THREE.Mesh(dotGeo, this.arrowMat);
      dot.position.z = 0.253;
      group.add(new THREE.Mesh(cubeGeo, mat), arrow, dot);
      group.visible = false;
      this.cubes.push({ group, mat, active: false, swung: false, angle: 0, red: true });
      this.scene.add(group);
    }
    // Hälften: quer geteilt, jede mit eigener glühender Schnittfläche
    const halfGeo = track(new RoundedBoxGeometry(0.25, 0.5, 0.5, 3, 0.05));
    for (let i = 0; i < CUBES * 2; i++) {
      const mat = track(cubeMaterial());
      mat.uniforms.uCut.value = 1;
      const mesh = new THREE.Mesh(halfGeo, mat);
      mesh.visible = false;
      this.halves.push({ mesh, mat, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0 });
      this.scene.add(mesh);
    }

    // Lichtschwerter
    const handleGeo = track(new THREE.CylinderGeometry(0.022, 0.026, 0.26, 16));
    const handleMat = track(new THREE.MeshBasicMaterial({ color: 0x1a1b20 }));
    this.sabers = [new Saber(-1, RED, handleMat, handleGeo), new Saber(1, BLUE, handleMat, handleGeo)];
    for (const s of this.sabers) {
      track(s);
      const trail = new THREE.Mesh(s.trailGeo, s.trailMat);
      trail.frustumCulled = false;
      this.scene.add(s.group, trail);
    }

    // Funken
    this.sparkGeo = track(new THREE.BufferGeometry());
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.sparkGeo.setAttribute('aLife', new THREE.BufferAttribute(this.sparkLife, 1).setUsage(THREE.DynamicDrawUsage));
    this.sparkGeo.setAttribute('aColor', new THREE.BufferAttribute(this.sparkColor, 3).setUsage(THREE.DynamicDrawUsage));
    this.sparkMat = track(new THREE.ShaderMaterial({
      vertexShader: sparkVert,
      fragmentShader: sparkFrag,
      uniforms: { uScale: { value: 40 } },
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }));
    const sparks = new THREE.Points(this.sparkGeo, this.sparkMat);
    sparks.frustumCulled = false;
    this.scene.add(sparks);

    // Rot/Blau per tint() auf die Palette
    this.scene.traverse((o) => {
      const mats = (o as THREE.Mesh).material;
      for (const m of Array.isArray(mats) ? mats : mats ? [mats] : []) {
        if (m instanceof THREE.ShaderMaterial) {
          m.uniforms.uPalette = { value: ctx.palette };
          m.uniforms.uPaletteMix = ctx.paletteMix;
        }
      }
    });
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.sparkMat.uniforms.uScale.value = height * 0.03;
  }

  private spawnCube(lane: number, red: boolean) {
    const c = this.cubes.find((k) => !k.active);
    if (!c) return;
    const row = Math.floor(Math.random() * 3);
    c.active = true;
    c.swung = false;
    c.red = red;
    c.group.visible = true;
    c.group.position.set((lane - 1.5) * 0.6, 0.6 + row * 0.5, SPAWN_Z);
    // Acht Richtungen, selten ein Punkt-Würfel
    const dot = Math.random() < 0.12;
    c.group.children[1].visible = !dot;
    c.group.children[2].visible = dot;
    c.angle = Math.floor(Math.random() * 8) * (Math.PI / 4);
    c.mat.uniforms.uColor.value.copy(red ? RED : BLUE);
  }

  // Schlagrichtung = Pfeilrichtung
  private swingDir(c: Cube) {
    return new THREE.Vector3(Math.sin(c.angle), -Math.cos(c.angle), 0);
  }

  private slice(c: Cube) {
    c.active = false;
    c.group.visible = false;
    const p = c.group.position;
    const swing = this.swingDir(c);
    // Hälften trennen sich quer zur Schlagrichtung
    const across = new THREE.Vector3(Math.cos(c.angle), Math.sin(c.angle), 0);
    let made = 0;
    for (const h of this.halves) {
      if (h.life > 0) continue;
      const side = made === 0 ? -1 : 1;
      h.life = 1;
      h.mesh.visible = true;
      h.mesh.position.copy(p).addScaledVector(across, side * 0.13);
      h.mesh.rotation.set(0, 0, c.angle);
      // Schnittfläche zeigt zur Mitte, also entgegen der Verschiebung
      h.mat.uniforms.uCutN.value.set(-side, 0, 0);
      h.vel.copy(across).multiplyScalar(side * (1.4 + Math.random())).addScaledVector(swing, 1.2).add(new THREE.Vector3(0, 0.3, 0.4));
      h.spin.set((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, side * (2 + Math.random() * 3));
      h.mat.uniforms.uColor.value.copy(c.red ? RED : BLUE);
      if (++made === 2) break;
    }
    const col = c.red ? RED : BLUE;
    for (let n = 0; n < 55; n++) {
      const i = this.sparkHead;
      this.sparkHead = (this.sparkHead + 1) % SPARKS;
      this.sparkPos[i * 3] = p.x; this.sparkPos[i * 3 + 1] = p.y; this.sparkPos[i * 3 + 2] = p.z;
      const s = 1.5 + Math.random() * 5;
      // Funken sprühen bevorzugt in Schlagrichtung
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().addScaledVector(swing, 0.9).normalize();
      this.sparkVel[i * 3] = dir.x * s; this.sparkVel[i * 3 + 1] = dir.y * s + 1.2; this.sparkVel[i * 3 + 2] = dir.z * s + 0.4;
      this.sparkLife[i] = 0.5 + Math.random() * 0.5;
      this.sparkColor[i * 3] = col.r; this.sparkColor[i * 3 + 1] = col.g; this.sparkColor[i * 3 + 2] = col.b;
    }
    this.centerI = Math.max(this.centerI, 1.8);
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    const bpm = Math.min(Math.max(a.bpm || 120, 70), 180);
    const speed = (CUT_Z - SPAWN_Z) / ((TRAVEL_BEATS * 60) / bpm);

    // ---------- Licht-Events ----------
    if (a.beat) {
      this.beats++;
      if (this.beats % 4 === 1) this.ringRed = !this.ringRed;
      this.ringI = 4;
      if (this.beats % 2 === 0) this.ringTarget += (Math.PI / 4) * this.spinDir;
      if (this.beats % 16 === 0) this.spinDir *= -1;
      if (this.beats % 8 === 0) this.spacingTarget = this.spacingTarget > 3 ? 2.2 : 4.2;
      if (a.bassRaw > 0.45) this.backI = 3.5;
      // Einer pro Beat, bei harten Kicks ein Paar
      if (a.bassRaw > 0.7) {
        this.spawnCube(Math.floor(Math.random() * 2), true);
        this.spawnCube(2 + Math.floor(Math.random() * 2), false);
      } else {
        const red = Math.random() < 0.5;
        const lane = red ? (Math.random() < 0.85 ? Math.floor(Math.random() * 2) : 2) : (Math.random() < 0.85 ? 2 + Math.floor(Math.random() * 2) : 1);
        this.spawnCube(lane, red);
      }
    } else if (a.onset > 0.65 && this.onsetCooldown <= 0) {
      this.onsetCooldown = 0.25;
      const red = Math.random() < 0.5;
      this.spawnCube(red ? Math.floor(Math.random() * 2) : 2 + Math.floor(Math.random() * 2), red);
    }
    this.onsetCooldown -= dt;

    this.ringI = 0.9 + (this.ringI - 0.9) * Math.exp(-dt * 5);
    this.backI = 0.5 + (this.backI - 0.5) * Math.exp(-dt * 4);
    this.centerI = Math.max(0.7 + a.bass * 1.6, this.centerI * Math.exp(-dt * 5));
    const ringCol = this.ringRed ? RED : BLUE;
    this.ringLight.set(this.ringI, ringCol);
    this.backLight.set(this.backI, this.ringRed ? BLUE : RED);
    this.centerLight.set(this.centerI);
    const side = 0.5 + a.mid * 3;
    this.leftLight.set(side);
    this.rightLight.set(side);
    this.hazeMat.uniforms.uColor.value.copy(ringCol);
    this.hazeMat.uniforms.uIntensity.value = 0.3 + this.ringI * 0.12 + this.backI * 0.08;
    this.floorMat.uniforms.uTint.value.copy(ringCol).multiplyScalar(0.4 + this.ringI * 0.15);
    // Bühnenlicht, das sich auf den Würfeln spiegelt
    this.env.copy(ringCol).multiplyScalar(0.15 + this.ringI * 0.08);

    // Ringe drehen gestaffelt: vordere folgen schnell, hintere ziehen nach
    this.spacing += (this.spacingTarget - this.spacing) * Math.min(dt * 2.5, 1);
    for (let i = 0; i < RINGS; i++) {
      const k = 7 / (1 + i * 0.35);
      this.ringAngle[i] += (this.ringTarget - this.ringAngle[i]) * Math.min(dt * k, 1);
      for (const g of [this.rings[i], this.rings[i + RINGS]]) {
        g.rotation.z = this.ringAngle[i];
        g.position.z = -20 - i * this.spacing;
      }
    }

    // Seitenlaser schwenken, schneller bei hellen Passagen
    this.laserPhase += dt * (0.4 + a.treble * 3);
    for (let i = 0; i < this.leftLasers.length; i++) {
      const s = Math.sin(this.laserPhase + (i % SIDE_LASERS) * 0.7) * 0.55;
      this.leftLasers[i].rotation.set(0, 0, -0.35 + s);
      this.rightLasers[i].rotation.set(0, 0, 0.35 - s);
    }
    for (let i = 0; i < this.backLasers.length; i++) {
      const k = i % BACK_LASERS;
      this.backLasers[i].rotation.z = -(k - (BACK_LASERS - 1) / 2) * 0.16 + Math.sin(this.time * 0.6 + k) * 0.03;
    }

    // ---------- Würfel und Schwerter ----------
    for (const c of this.cubes) {
      if (!c.active) continue;
      const p = c.group.position;
      p.z += speed * dt;
      // Würfel drehen sich beim Anflug in ihre Richtung ein
      const settle = THREE.MathUtils.smoothstep(p.z, SPAWN_Z, SPAWN_Z + 14);
      c.group.rotation.set(0, 0, c.angle + (1 - settle) * Math.PI);
      c.mat.uniforms.uEnv.value.copy(this.env);
      if (!c.swung && (CUT_Z - p.z) / speed <= WINDUP + STRIKE * 0.5) {
        c.swung = true;
        const hit = p.clone();
        hit.z = CUT_Z;
        this.sabers[c.red ? 0 : 1].strike(hit, this.swingDir(c));
      }
      if (p.z >= CUT_Z) this.slice(c);
    }
    this.sabers[0].update(dt);
    this.sabers[1].update(dt);

    for (const h of this.halves) {
      if (h.life <= 0) continue;
      h.life -= dt * 1.8;
      h.vel.y -= 7 * dt;
      h.mesh.position.addScaledVector(h.vel, dt);
      h.mesh.rotation.x += h.spin.x * dt;
      h.mesh.rotation.y += h.spin.y * dt;
      h.mesh.rotation.z += h.spin.z * dt;
      h.mat.uniforms.uAlpha.value = Math.min(Math.max(h.life, 0) * 1.5, 1);
      h.mat.uniforms.uCut.value = Math.max(h.life, 0);
      h.mat.uniforms.uEnv.value.copy(this.env);
      if (h.life <= 0) h.mesh.visible = false;
    }
    for (let i = 0; i < SPARKS; i++) {
      if (this.sparkLife[i] <= 0) continue;
      this.sparkLife[i] -= dt * 1.3;
      this.sparkVel[i * 3 + 1] -= 9.8 * dt;
      this.sparkPos[i * 3] += this.sparkVel[i * 3] * dt;
      this.sparkPos[i * 3 + 1] += this.sparkVel[i * 3 + 1] * dt;
      this.sparkPos[i * 3 + 2] += this.sparkVel[i * 3 + 2] * dt;
      // Funken prallen vom Boden ab
      if (this.sparkPos[i * 3 + 1] < 0) {
        this.sparkPos[i * 3 + 1] = 0;
        this.sparkVel[i * 3 + 1] *= -0.35;
      }
      if (this.sparkLife[i] < 0) this.sparkLife[i] = 0;
    }
    this.sparkGeo.attributes.position.needsUpdate = true;
    this.sparkGeo.attributes.aLife.needsUpdate = true;
    this.sparkGeo.attributes.aColor.needsUpdate = true;

    // Kamera auf Kopfhöhe, minimal federnd
    this.camera.position.set(Math.sin(this.time * 0.3) * 0.05, 1.7 + a.bass * 0.03, 1.5);
    this.camera.lookAt(0, 1.2, -12);
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('saber-stage').meta,
  create: () => new SaberStage(),
};
export default definition;
