// Prozeduraler House-Loop mit Lookahead-Scheduler
const BPM = 124;
const STEP = 60 / BPM / 4; // 16tel
const LOOKAHEAD = 0.12;

// Am-F-C-G, als Grundtöne in Hz
const ROOTS = [55, 43.65, 65.41, 49];
const CHORDS = [
  [220, 261.63, 329.63],
  [174.61, 220, 261.63],
  [261.63, 329.63, 392],
  [196, 246.94, 293.66],
];

export class DemoSynth {
  readonly output: GainNode;
  private readonly noise: AudioBuffer;
  private timer = 0;
  private nextTime = 0;
  private step = 0;

  constructor(private readonly ctx: AudioContext) {
    this.output = ctx.createGain();
    this.output.gain.value = 0.55;
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  start() {
    this.nextTime = this.ctx.currentTime + 0.05;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  dispose() {
    clearInterval(this.timer);
    this.output.disconnect();
  }

  private schedule() {
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += STEP;
      this.step++;
    }
  }

  private playStep(step: number, t: number) {
    const s = step % 16;
    const bar = Math.floor(step / 16) % 4;
    // Die letzten zwei von 16 Takten ohne Kick, damit man Dynamik sieht
    const breakdown = Math.floor(step / 16) % 16 >= 14;

    if (s % 4 === 0 && !breakdown) this.kick(t);
    if (s === 4 || s === 12) this.clap(t);
    if (s % 2 === 1) this.hat(t, s % 4 === 3 ? 0.13 : 0.07);
    if ([0, 3, 6, 10, 11, 14].includes(s)) this.bass(t, ROOTS[bar] * (s === 11 ? 2 : 1));
    if (s === 0) this.pad(t, CHORDS[bar]);
  }

  private env(t: number, peak: number, attack: number, decay: number) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(this.output);
    return g;
  }

  private kick(t: number) {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    o.connect(this.env(t, 1.0, 0.002, 0.42));
    o.start(t);
    o.stop(t + 0.5);
  }

  private noiseBurst(t: number, type: BiquadFilterType, freq: number, peak: number, decay: number) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    src.connect(f).connect(this.env(t, peak, 0.001, decay));
    src.start(t, Math.random() * 0.5);
    src.stop(t + decay + 0.05);
  }

  private clap(t: number) {
    this.noiseBurst(t, 'bandpass', 1500, 0.5, 0.18);
  }

  private hat(t: number, peak: number) {
    this.noiseBurst(t, 'highpass', 8000, peak, 0.05);
  }

  private bass(t: number, freq: number) {
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(120, t + 0.2);
    f.Q.value = 6;
    o.connect(f).connect(this.env(t, 0.35, 0.005, 0.22));
    o.start(t);
    o.stop(t + 0.3);
  }

  private pad(t: number, freqs: number[]) {
    const len = STEP * 16;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(400, t);
    f.frequency.linearRampToValueAtTime(2400, t + len * 0.6);
    f.frequency.linearRampToValueAtTime(600, t + len);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.4);
    g.gain.linearRampToValueAtTime(0, t + len);
    f.connect(g).connect(this.output);
    for (const freq of freqs) {
      for (const detune of [-8, 8]) {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = freq;
        o.detune.value = detune;
        o.connect(f);
        o.start(t);
        o.stop(t + len);
      }
    }
  }
}
