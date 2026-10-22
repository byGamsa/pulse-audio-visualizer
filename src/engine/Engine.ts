import * as THREE from 'three';
import {
  BloomEffect,
  ChromaticAberrationEffect,
  EffectComposer,
  EffectPass,
  HueSaturationEffect,
  NoiseEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import { FeatureBus } from '../audio/FeatureBus';
import type { AudioFeatures, AudioSource } from '../audio/types';
import type { SendToDisplay } from '../display/link';
import { useSettings } from '../store/settings';
import { CompositePass } from './CompositePass';
import { BUILTIN_MODES, allModes, findMode } from './ModeRegistry';
import { PaletteTexture, STANDARD_PALETTE } from './palette';
import { PlaybackController } from './PlaybackController';
import { resolveTransition, type TransitionChoice, type TransitionType } from './transitions';
import type { ModeContext, ModeDefinition, ModeMeta, VisualMode } from './types';

interface Slot {
  meta: ModeMeta;
  mode: VisualMode;
  target: THREE.WebGLRenderTarget;
}

export interface EngineStats {
  fps: number;
  frameMs: number;
  renderScale: number;
  width: number;
  height: number;
  modeName: string;
  bpm: number;
  energy: number;
}

export interface EngineOptions {
  // Ausgabefenster: Audio und Modus kommen vom Hauptfenster, nichts wird gespeichert
  follower?: boolean;
}

const MAX_PIXEL_RATIO = 2;
const MIN_DYNAMIC_SCALE = 0.5;

export class Engine {
  readonly bus = new FeatureBus();
  readonly playback = new PlaybackController(this);
  readonly stats: EngineStats = {
    fps: 0, frameMs: 0, renderScale: 1, width: 0, height: 0, modeName: '', bpm: 0, energy: 0,
  };

  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly composite = new CompositePass();
  private readonly bloom: BloomEffect;
  private readonly chroma: ChromaticAberrationEffect;
  private readonly noise: NoiseEffect;
  private readonly vignette: VignetteEffect;
  private readonly saturate: HueSaturationEffect;
  private readonly palette: PaletteTexture;
  private readonly ctx: ModeContext;
  private readonly resizeObserver: ResizeObserver;

  private current: Slot | null = null;
  private next: Slot | null = null;
  private transition = 0;
  private transitionDuration = 2.5;
  private loadingId: string | null = null;
  private lastSwitch = 0;
  private paletteOverride: string | null = null;
  private transitionType: TransitionType = 'dissolve';

  // Ein anderes Fenster rendert; hier laufen nur Audio und Playback
  private remote: SendToDisplay | null = null;
  private remoteMode: { id: string; transition: TransitionChoice } | null = null;
  private readonly follower: boolean;
  private pendingBeat = false;

  private raf = 0;
  private lastFrame = 0;
  private time = 0;
  private cssWidth = 1;
  private cssHeight = 1;

  // Dynamic Resolution
  private dynamicScale = 1;
  private frameAvg = 1 / 60;
  private refreshInterval = 1 / 60;
  private stableTime = 0;
  private slowTime = 0;
  private fpsFrames = 0;
  private fpsTime = 0;

  constructor(readonly canvas: HTMLCanvasElement, options: EngineOptions = {}) {
    this.follower = options.follower ?? false;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, 1);

    const v = useSettings.getState().visual;
    this.palette = new PaletteTexture(v.paletteId);
    this.ctx = { renderer: this.renderer, palette: this.palette.texture, paletteMix: { value: v.paletteId === STANDARD_PALETTE ? 0 : 1 } };

    this.composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType });
    this.bloom = new BloomEffect({
      mipmapBlur: true,
      intensity: v.bloomIntensity,
      luminanceThreshold: v.bloomThreshold,
      luminanceSmoothing: 0.25,
      radius: v.bloomRadius,
      levels: 8,
    });
    this.chroma = new ChromaticAberrationEffect({
      offset: new THREE.Vector2(0.0015, 0.0015),
      radialModulation: true,
      modulationOffset: 0.25,
    });
    this.noise = new NoiseEffect({ premultiply: true });
    this.vignette = new VignetteEffect({ offset: 0.25, darkness: v.vignette });
    const tonemap = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
    this.saturate = new HueSaturationEffect({ saturation: 0 });
    const camera = new THREE.OrthographicCamera();
    this.composer.addPass(this.composite);
    this.composer.addPass(new EffectPass(camera, this.bloom, this.chroma, tonemap, this.saturate, this.vignette, this.noise));

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.handleResize();
  }

  get modes() {
    return allModes().map((m) => m.meta);
  }

  // null = globale Palette
  setPaletteOverride(id: string | null) {
    this.paletteOverride = id;
  }

  // Auf einen anderen Monitor ausgeben (null = wieder selbst rendern)
  setRemote(send: SendToDisplay | null) {
    if (send === this.remote) return;
    this.remote = send;
    this.remoteMode = null;
    this.loadingId = null;
    if (send) {
      for (const slot of [this.current, this.next]) if (slot) this.disposeSlot(slot);
      this.current = this.next = null;
      this.renderer.setRenderTarget(null);
      this.renderer.clear();
    }
    void this.setMode(useSettings.getState().playback.modeId, 0);
  }

  // Takt vom Ausgabefenster; minimierte Fenster bekommen kein requestAnimationFrame
  tick() {
    if (this.remote) this.frame(performance.now());
  }

  // Ausgabefenster ist (neu) geladen
  syncRemote() {
    if (this.remote && this.remoteMode) this.remote({ type: 'mode', id: this.remoteMode.id, seconds: 0, transition: this.remoteMode.transition });
  }

  // Ausgabefenster: Features aus dem Hauptfenster übernehmen
  receive(src: AudioFeatures, palette: string | null) {
    const f = this.bus.features;
    const { spectrum, waveL, waveR, time: _t, dt: _dt, beat, ...scalars } = src;
    f.spectrum.set(spectrum);
    f.waveL.set(waveL);
    f.waveR.set(waveR);
    Object.assign(f, scalars);
    // Bei unterschiedlichen Bildraten keinen Beat verlieren
    this.pendingBeat ||= beat;
    this.paletteOverride = palette;
  }

  setSource(source: AudioSource | null) {
    this.bus.source?.dispose();
    this.bus.source = source;
  }

  async setMode(
    id: string,
    transitionSeconds = useSettings.getState().playback.transitionDuration,
    transition: TransitionChoice = useSettings.getState().playback.transition,
  ) {
    if (this.remote) {
      if (this.remoteMode?.id === id) return;
      this.remoteMode = { id, transition };
      this.remote({ type: 'mode', id, seconds: transitionSeconds, transition });
      this.lastSwitch = this.time;
      this.stats.modeName = findMode(id).meta.name;
      useSettings.getState().setPlayback({ modeId: id });
      return;
    }
    if (this.current?.meta.id === id && !this.next) return;
    if (this.loadingId === id || this.next?.meta.id === id) return;
    this.loadingId = id;
    const entry = findMode(id);
    let def: ModeDefinition;
    try {
      def = await entry.load();
    } catch (err) {
      // Entferntes oder kaputtes Paket: auf den ersten eingebauten Modus ausweichen
      console.error(err);
      if (this.loadingId === id) this.loadingId = null;
      if (!this.current && id !== BUILTIN_MODES[0].meta.id) await this.setMode(BUILTIN_MODES[0].meta.id, 0);
      return;
    }
    if (this.loadingId !== id) return; // inzwischen wurde ein anderer Modus angefordert
    this.loadingId = null;

    const mode = def.create();
    await mode.init(this.ctx);
    const target = this.createTarget();
    mode.resize(target.width, target.height);
    // Shader vorab kompilieren, damit der Übergang nicht ruckelt
    mode.update(this.bus.features);
    mode.render(this.renderer, target);

    const slot: Slot = { meta: def.meta, mode, target };
    if (!this.current || transitionSeconds <= 0) {
      if (this.current) this.disposeSlot(this.current);
      this.current = slot;
    } else {
      if (this.next) this.disposeSlot(this.next);
      this.next = slot;
      this.transition = 0;
      this.transitionDuration = transitionSeconds;
      this.transitionType = resolveTransition(transition, def.meta.category);
    }
    this.lastSwitch = this.time;
    this.stats.modeName = def.meta.name;
    if (!this.follower) useSettings.getState().setPlayback({ modeId: id });
  }

  nextMode(direction: 1 | -1 = 1) {
    this.playback.next(direction);
  }

  start() {
    this.lastFrame = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      if (!this.remote) this.frame(now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    if (this.current) this.disposeSlot(this.current);
    if (this.next) this.disposeSlot(this.next);
    this.setSource(null);
    this.palette.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }

  private frame(now: number) {
    const dt = Math.min((now - this.lastFrame) / 1000, 0.1);
    this.lastFrame = now;
    this.time += dt;

    const settings = useSettings.getState();
    const audio = this.bus.features;
    if (this.follower) {
      audio.time = this.time;
      audio.dt = dt;
      audio.beat = this.pendingBeat;
      this.pendingBeat = false;
    } else {
      this.bus.update(this.time, dt, settings.audio);
      // Erst wenn der erste Modus steht
      if (this.current || this.remoteMode) this.playback.update(dt, audio);
    }

    if (this.remote) {
      this.remote({ type: 'frame', features: audio, palette: this.paletteOverride });
      this.updateStats(dt);
      return;
    }

    this.applyVisualSettings(dt);
    this.updateDynamicResolution(dt);

    if (this.current) {
      this.current.mode.update(audio);
      this.current.mode.render(this.renderer, this.current.target);
    }
    if (this.next) {
      this.next.mode.update(audio);
      this.next.mode.render(this.renderer, this.next.target);
      this.transition = Math.min(this.transition + dt / this.transitionDuration, 1);
      if (this.transition >= 1) {
        this.disposeSlot(this.current!);
        this.current = this.next;
        this.next = null;
      }
    }

    if (this.current) {
      const p = this.transition;
      const eased = p * p * (3 - 2 * p);
      this.composite.setInputs(
        this.current.target.texture,
        this.next?.target.texture ?? null,
        eased,
        this.time,
        this.cssWidth / this.cssHeight,
        this.transitionType,
      );
      // vivid zwischen beiden Modi überblenden
      const vivid = (this.current.meta.vivid ?? 0) * (1 - eased) + (this.next?.meta.vivid ?? this.current.meta.vivid ?? 0) * eased;
      this.saturate.saturation += (vivid - this.saturate.saturation) * Math.min(dt * 6, 1);
      this.composer.render(dt);
    }

    this.updateStats(dt);
  }

  private applyVisualSettings(dt: number) {
    const v = useSettings.getState().visual;
    const a = this.bus.features;
    // Standard: Hauspalette des Modus bzw. Originalfarben
    const standard = !this.paletteOverride && v.paletteId === STANDARD_PALETTE;
    const shown = this.next ?? this.current;
    this.palette.set(this.paletteOverride ?? (standard ? (shown?.meta.palette ?? 'synth') : v.paletteId));
    const mix = this.ctx.paletteMix;
    mix.value += ((standard ? 0 : 1) - mix.value) * Math.min(dt * 2.5, 1);
    this.palette.update(dt);
    this.bloom.intensity = v.bloomIntensity * (1 + a.bassRaw * v.bloomReactive);
    this.bloom.luminanceMaterial.threshold = v.bloomThreshold;
    this.bloom.mipmapBlurPass.radius = v.bloomRadius;
    const ca = 0.004 * v.chromaticAberration * (0.6 + a.bassRaw * 0.8);
    this.chroma.offset.set(ca, ca);
    this.noise.blendMode.opacity.value = v.grain;
    this.vignette.darkness = v.vignette;
  }

  private updateDynamicResolution(dt: number) {
    const v = useSettings.getState().visual;
    // Kürzester Frame-Abstand ≈ Bildwiederholrate, driftet langsam nach oben
    this.refreshInterval = Math.min(this.refreshInterval * 1.003, Math.max(dt, 1 / 360));
    this.frameAvg += (dt - this.frameAvg) * 0.05;

    let target = this.dynamicScale;
    const struggling = this.frameAvg > this.refreshInterval * 1.3;
    // Nach einem Wechsel ruckelt es durch Shader-Kompilierung
    const settling = this.time - this.lastSwitch < 2;
    if (!v.dynamicResolution) {
      target = 1;
    } else if (struggling && !settling) {
      this.stableTime = 0;
      this.slowTime += dt;
      if (this.slowTime > 0.5) {
        this.slowTime = 0;
        target = Math.max(this.dynamicScale - 0.1, MIN_DYNAMIC_SCALE);
      }
    } else {
      this.slowTime = 0;
      this.stableTime += dt;
      if (this.stableTime > 3) {
        this.stableTime = 0;
        target = Math.min(this.dynamicScale + 0.1, 1);
      }
    }
    if (Math.abs(target - this.dynamicScale) > 0.01) {
      this.dynamicScale = target;
      this.frameAvg = this.refreshInterval; // nach einem Sprung neu messen
      this.handleResize();
    } else if (Math.abs(this.effectiveScale() - this.stats.renderScale) > 0.01) {
      this.handleResize(); // Nutzer hat renderScale geändert
    }
  }

  private effectiveScale() {
    return useSettings.getState().visual.renderScale * this.dynamicScale;
  }

  private handleResize() {
    const parent = this.canvas.parentElement ?? this.canvas;
    this.cssWidth = Math.max(parent.clientWidth, 1);
    this.cssHeight = Math.max(parent.clientHeight, 1);
    const scale = this.effectiveScale();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO) * scale);
    this.renderer.setSize(this.cssWidth, this.cssHeight, false);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.composer.setSize(this.cssWidth, this.cssHeight, false);

    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    for (const slot of [this.current, this.next]) {
      if (!slot) continue;
      slot.target.setSize(size.x, size.y);
      slot.mode.resize(size.x, size.y);
    }
    this.stats.renderScale = scale;
    this.stats.width = size.x;
    this.stats.height = size.y;
  }

  private createTarget() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    return new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      depthBuffer: true,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
  }

  private disposeSlot(slot: Slot) {
    slot.mode.dispose();
    slot.target.dispose();
  }

  private updateStats(dt: number) {
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.stats.fps = this.fpsFrames / this.fpsTime;
      this.stats.frameMs = (this.fpsTime / this.fpsFrames) * 1000;
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
    this.stats.bpm = this.bus.features.bpm;
    this.stats.energy = this.bus.features.energy;
  }
}
