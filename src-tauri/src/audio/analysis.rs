// Liefert dasselbe Frame-Layout wie die Web-Audio-Quelle im Frontend

use rustfft::{num_complex::Complex, Fft, FftPlanner};
use std::sync::Arc;

pub const BAND_COUNT: usize = 128;
pub const WAVE_SIZE: usize = 512;
// Layout eines Frames: [Bänder dB][Welle L][Welle R][Kick-RMS]
pub const FRAME_FLOATS: usize = BAND_COUNT + 2 * WAVE_SIZE + 1;

// Muss zu src/audio/types.ts und WebAudioSource.ts passen
const MIN_FREQ: f32 = 30.0;
const MAX_FREQ: f32 = 16000.0;
const LOW_HIGH_SPLIT: f32 = 300.0;
const LOW_FFT: usize = 8192;
const HIGH_FFT: usize = 2048;
const WAVE_WINDOW: usize = 1024;
const KICK_WINDOW: usize = 1024;
const KICK_CUTOFF: f32 = 140.0;

enum Band {
    // Mittelwert der Leistung über die Bins b0..=b1
    Range { low: bool, b0: usize, b1: usize },
    // Band schmaler als ein Bin: zwischen zwei Bins interpolieren
    Interp { low: bool, b0: usize, frac: f32 },
}

// Biquad-Tiefpass (RBJ-Cookbook) für die Kick-Hüllkurve
struct Lowpass {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
    z1: f32,
    z2: f32,
}

impl Lowpass {
    fn new(sample_rate: f32, cutoff: f32, q: f32) -> Self {
        let w0 = 2.0 * std::f32::consts::PI * cutoff / sample_rate;
        let alpha = w0.sin() / (2.0 * q);
        let cos = w0.cos();
        let a0 = 1.0 + alpha;
        Self {
            b0: (1.0 - cos) / 2.0 / a0,
            b1: (1.0 - cos) / a0,
            b2: (1.0 - cos) / 2.0 / a0,
            a1: -2.0 * cos / a0,
            a2: (1.0 - alpha) / a0,
            z1: 0.0,
            z2: 0.0,
        }
    }

    fn process(&mut self, x: f32) -> f32 {
        // Transposed Direct Form II
        let y = self.b0 * x + self.z1;
        self.z1 = self.b1 * x - self.a1 * y + self.z2;
        self.z2 = self.b2 * x - self.a2 * y;
        y
    }
}

struct Spectrum {
    size: usize,
    fft: Arc<dyn Fft<f32>>,
    window: Vec<f32>,
    buffer: Vec<Complex<f32>>,
    scratch: Vec<Complex<f32>>,
    db: Vec<f32>,
}

impl Spectrum {
    fn new(planner: &mut FftPlanner<f32>, size: usize) -> Self {
        let fft = planner.plan_fft_forward(size);
        // Blackman-Fenster wie der AnalyserNode (alpha = 0.16)
        let window = (0..size)
            .map(|n| {
                let x = 2.0 * std::f32::consts::PI * n as f32 / size as f32;
                0.42 - 0.5 * x.cos() + 0.08 * (2.0 * x).cos()
            })
            .collect();
        Self {
            size,
            scratch: vec![Complex::default(); fft.get_inplace_scratch_len()],
            fft,
            window,
            buffer: vec![Complex::default(); size],
            db: vec![-200.0; size / 2],
        }
    }

    // `mono` muss mindestens `size` Samples haben; es zählen die jüngsten
    fn compute(&mut self, mono: &[f32]) {
        let start = mono.len() - self.size;
        for (i, c) in self.buffer.iter_mut().enumerate() {
            *c = Complex::new(mono[start + i] * self.window[i], 0.0);
        }
        self.fft.process_with_scratch(&mut self.buffer, &mut self.scratch);
        let norm = 1.0 / self.size as f32;
        for (k, db) in self.db.iter_mut().enumerate() {
            let mag = self.buffer[k].norm() * norm;
            *db = 20.0 * mag.max(1e-12).log10();
        }
    }
}

pub struct Analyzer {
    left: Vec<f32>,
    right: Vec<f32>,
    mono: Vec<f32>,
    kick: Vec<f32>,
    lowpass: Lowpass,
    low: Spectrum,
    high: Spectrum,
    bands: Vec<Band>,
}

fn band_edge(i: usize) -> f32 {
    MIN_FREQ * (MAX_FREQ / MIN_FREQ).powf(i as f32 / BAND_COUNT as f32)
}

// Schiebt new von rechts in buf, ohne Allokation
fn shift_in(buf: &mut [f32], new: &[f32]) {
    let n = new.len().min(buf.len());
    let new = &new[new.len() - n..];
    buf.copy_within(n.., 0);
    let len = buf.len();
    buf[len - n..].copy_from_slice(new);
}

impl Analyzer {
    pub fn new(sample_rate: f32) -> Self {
        let mut planner = FftPlanner::new();
        let bands = (0..BAND_COUNT)
            .map(|i| {
                let (f0, f1) = (band_edge(i), band_edge(i + 1));
                let low = f1 <= LOW_HIGH_SPLIT;
                let size = if low { LOW_FFT } else { HIGH_FFT };
                let hz = sample_rate / size as f32;
                let max_bin = size / 2 - 2;
                let b0 = (f0 / hz).ceil() as usize;
                let b1 = (f1 / hz).floor() as usize;
                if b1 >= b0 {
                    Band::Range { low, b0: b0.min(max_bin), b1: b1.min(max_bin) }
                } else {
                    let center = (f0 * f1).sqrt() / hz;
                    Band::Interp { low, b0: (center.floor() as usize).min(max_bin), frac: center.fract() }
                }
            })
            .collect();
        Self {
            left: vec![0.0; WAVE_WINDOW],
            right: vec![0.0; WAVE_WINDOW],
            mono: vec![0.0; LOW_FFT],
            kick: vec![0.0; KICK_WINDOW],
            lowpass: Lowpass::new(sample_rate, KICK_CUTOFF, 0.7),
            low: Spectrum::new(&mut planner, LOW_FFT),
            high: Spectrum::new(&mut planner, HIGH_FFT),
            bands,
        }
    }

    pub fn push(&mut self, left: &[f32], right: &[f32]) {
        if left.is_empty() {
            return;
        }
        let mono: Vec<f32> = left.iter().zip(right).map(|(l, r)| (l + r) * 0.5).collect();
        let filtered: Vec<f32> = mono.iter().map(|&x| self.lowpass.process(x)).collect();
        shift_in(&mut self.left, left);
        shift_in(&mut self.right, right);
        shift_in(&mut self.mono, &mono);
        shift_in(&mut self.kick, &filtered);
    }

    // Schreibt einen Frame im Layout von FRAME_FLOATS
    pub fn frame(&mut self, out: &mut [f32]) {
        self.low.compute(&self.mono);
        self.high.compute(&self.mono);

        for (i, band) in self.bands.iter().enumerate() {
            out[i] = match *band {
                Band::Range { low, b0, b1 } => {
                    let db = if low { &self.low.db } else { &self.high.db };
                    // Mittelwert in der Leistungsdomäne, nicht in dB
                    let power: f32 = db[b0..=b1].iter().map(|d| 10f32.powf(d / 10.0)).sum();
                    10.0 * (power / (b1 - b0 + 1) as f32 + 1e-12).log10()
                }
                Band::Interp { low, b0, frac } => {
                    let db = if low { &self.low.db } else { &self.high.db };
                    db[b0] * (1.0 - frac) + db[b0 + 1] * frac
                }
            };
        }

        // Wellenform: 1024 jüngste Samples, auf 512 ausgedünnt (wie im Frontend)
        let step = WAVE_WINDOW / WAVE_SIZE;
        for i in 0..WAVE_SIZE {
            out[BAND_COUNT + i] = self.left[i * step];
            out[BAND_COUNT + WAVE_SIZE + i] = self.right[i * step];
        }

        let sum: f32 = self.kick.iter().map(|x| x * x).sum();
        out[FRAME_FLOATS - 1] = (sum / KICK_WINDOW as f32).sqrt();
    }
}
