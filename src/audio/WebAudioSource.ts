import { BAND_COUNT, bandEdge, type AudioSource, type AudioSourceKind } from './types';
import { DemoSynth } from './DemoSynth';

let sharedContext: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  sharedContext ??= new AudioContext({ latencyHint: 'interactive' });
  return sharedContext;
}

// Darunter hochauflösende FFT, darüber die schnelle
const LOW_HIGH_SPLIT = 300;

// Große FFT für Bässe, kleine für Mitten und Höhen, Tiefpass für Kicks
class AnalysisGraph {
  private readonly low: AnalyserNode;
  private readonly high: AnalyserNode;
  private readonly left: AnalyserNode;
  private readonly right: AnalyserNode;
  private readonly kick: AnalyserNode;
  private readonly lowDb: Float32Array<ArrayBuffer>;
  private readonly highDb: Float32Array<ArrayBuffer>;
  private readonly kickBuf: Float32Array<ArrayBuffer>;
  private readonly waveBuf: Float32Array<ArrayBuffer>;
  // [analyser, erster Bin, letzter Bin] pro Band
  private readonly bandMap: Int32Array;
  private readonly bandFrac: Float32Array;
  private readonly nodes: AudioNode[];

  constructor(ctx: AudioContext, input: AudioNode) {
    const mk = (fftSize: number) => {
      const a = ctx.createAnalyser();
      a.fftSize = fftSize;
      a.smoothingTimeConstant = 0; // Smoothing übernimmt der FeatureBus
      a.minDecibels = -110;
      a.maxDecibels = 0;
      return a;
    };
    this.low = mk(8192);
    this.high = mk(2048);
    this.left = mk(1024);
    this.right = mk(1024);
    this.kick = mk(1024);

    const splitter = ctx.createChannelSplitter(2);
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 140;
    lowpass.Q.value = 0.7;

    input.connect(this.low);
    input.connect(this.high);
    input.connect(splitter);
    splitter.connect(this.left, 0);
    splitter.connect(this.right, 1);
    input.connect(lowpass).connect(this.kick);
    this.nodes = [this.low, this.high, this.left, this.right, this.kick, splitter, lowpass];

    this.lowDb = new Float32Array(this.low.frequencyBinCount);
    this.highDb = new Float32Array(this.high.frequencyBinCount);
    this.kickBuf = new Float32Array(this.kick.fftSize);
    this.waveBuf = new Float32Array(this.left.fftSize);

    this.bandMap = new Int32Array(BAND_COUNT * 3);
    this.bandFrac = new Float32Array(BAND_COUNT);
    for (let i = 0; i < BAND_COUNT; i++) {
      const f0 = bandEdge(i);
      const f1 = bandEdge(i + 1);
      const useLow = f1 <= LOW_HIGH_SPLIT;
      const a = useLow ? this.low : this.high;
      const hz = ctx.sampleRate / a.fftSize;
      const b0 = Math.ceil(f0 / hz);
      const b1 = Math.floor(f1 / hz);
      this.bandMap[i * 3] = useLow ? 0 : 1;
      if (b1 >= b0) {
        this.bandMap[i * 3 + 1] = b0;
        this.bandMap[i * 3 + 2] = b1;
        this.bandFrac[i] = -1;
      } else {
        // Band schmaler als ein Bin: zwischen den Nachbar-Bins interpolieren
        const center = Math.sqrt(f0 * f1) / hz;
        this.bandMap[i * 3 + 1] = Math.floor(center);
        this.bandMap[i * 3 + 2] = Math.floor(center) + 1;
        this.bandFrac[i] = center - Math.floor(center);
      }
    }
  }

  readBandsDb(out: Float32Array) {
    this.low.getFloatFrequencyData(this.lowDb);
    this.high.getFloatFrequencyData(this.highDb);
    for (let i = 0; i < BAND_COUNT; i++) {
      const src = this.bandMap[i * 3] === 0 ? this.lowDb : this.highDb;
      const b0 = this.bandMap[i * 3 + 1];
      const b1 = this.bandMap[i * 3 + 2];
      const frac = this.bandFrac[i];
      if (frac >= 0) {
        out[i] = src[b0] * (1 - frac) + src[b1] * frac;
        continue;
      }
      // Mittelwert in der Leistungsdomäne, nicht in dB
      let p = 0;
      for (let b = b0; b <= b1; b++) p += Math.pow(10, src[b] / 10);
      out[i] = 10 * Math.log10(p / (b1 - b0 + 1) + 1e-12);
    }
  }

  readWaveform(left: Float32Array, right: Float32Array) {
    this.left.getFloatTimeDomainData(this.waveBuf);
    resample(this.waveBuf, left);
    this.right.getFloatTimeDomainData(this.waveBuf);
    resample(this.waveBuf, right);
  }

  readKick(): number {
    // 1024 Samples ≈ 21 ms bei 48 kHz
    this.kick.getFloatTimeDomainData(this.kickBuf);
    let sum = 0;
    for (let i = 0; i < this.kickBuf.length; i++) sum += this.kickBuf[i] ** 2;
    return Math.sqrt(sum / this.kickBuf.length);
  }

  dispose() {
    for (const n of this.nodes) n.disconnect();
  }
}

function resample(src: Float32Array, dst: Float32Array) {
  const step = src.length / dst.length;
  for (let i = 0; i < dst.length; i++) dst[i] = src[Math.floor(i * step)];
}

class WebAudioSource implements AudioSource {
  private readonly graph: AnalysisGraph;

  constructor(
    readonly kind: AudioSourceKind,
    readonly label: string,
    input: AudioNode,
    private readonly cleanup: () => void,
  ) {
    this.graph = new AnalysisGraph(getAudioContext(), input);
  }

  readBandsDb(out: Float32Array) { this.graph.readBandsDb(out); }
  readWaveform(l: Float32Array, r: Float32Array) { this.graph.readWaveform(l, r); }
  readKick() { return this.graph.readKick(); }

  dispose() {
    this.graph.dispose();
    this.cleanup();
  }
}

export async function createDemoSource(): Promise<AudioSource> {
  const ctx = getAudioContext();
  await ctx.resume();
  const synth = new DemoSynth(ctx);
  synth.output.connect(ctx.destination);
  synth.start();
  return new WebAudioSource('demo', 'Demo-Beat (124 BPM)', synth.output, () => synth.dispose());
}

export async function createFileSource(file: File): Promise<AudioSource> {
  const ctx = getAudioContext();
  await ctx.resume();
  const url = URL.createObjectURL(file);
  const el = new Audio(url);
  el.loop = true;
  const node = ctx.createMediaElementSource(el);
  node.connect(ctx.destination);
  await el.play();
  return new WebAudioSource('file', file.name, node, () => {
    el.pause();
    node.disconnect();
    URL.revokeObjectURL(url);
  });
}

const RAW_AUDIO: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

export async function createMicSource(): Promise<AudioSource> {
  const ctx = getAudioContext();
  await ctx.resume();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: RAW_AUDIO });
  const node = ctx.createMediaStreamSource(stream);
  const label = stream.getAudioTracks()[0]?.label || 'Mikrofon';
  return new WebAudioSource('mic', label, node, () => stopStream(stream, node));
}

// Chrome/Edge: „Systemaudio teilen“ anhaken
export async function createDisplaySource(): Promise<AudioSource> {
  const ctx = getAudioContext();
  await ctx.resume();
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: RAW_AUDIO });
  stream.getVideoTracks().forEach((t) => t.stop());
  if (stream.getAudioTracks().length === 0) {
    throw new Error('Keine Audiospur freigegeben. Bitte „Systemaudio teilen“ aktivieren.');
  }
  const node = ctx.createMediaStreamSource(stream);
  return new WebAudioSource('display', 'Systemaudio', node, () => stopStream(stream, node));
}

function stopStream(stream: MediaStream, node: AudioNode) {
  node.disconnect();
  stream.getTracks().forEach((t) => t.stop());
}
