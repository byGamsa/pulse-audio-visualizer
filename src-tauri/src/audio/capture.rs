// Windows: WASAPI-Input-Stream auf Output-Gerät = Loopback
// macOS/Linux: Loopback über das jeweilige System-Modul

use super::analysis::{Analyzer, FRAME_FLOATS};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, SizedSample};
use serde::Serialize;
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};
use tauri::ipc::{Channel, InvokeResponseBody};

// Höher als die Bildrate, damit kein Frame alte Daten zeigt
const FRAME_RATE: f64 = 120.0;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub name: String,
    // "output" = Loopback dieses Ausgabegeräts, "input" = Mikrofon/Line-In
    pub kind: &'static str,
    pub is_default: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CaptureInfo {
    pub name: String,
    pub sample_rate: u32,
    pub channels: u16,
    pub loopback: bool,
}

pub fn list_devices() -> Vec<DeviceInfo> {
    let host = cpal::default_host();
    let default_out = host.default_output_device().and_then(|d| d.name().ok());
    let default_in = host.default_input_device().and_then(|d| d.name().ok());
    let mut list: Vec<DeviceInfo> = Vec::new();
    // Virtuelle Kabel melden doppelte Namen, Auswahl läuft über den Namen
    let mut add = |name: String, kind: &'static str, default: &Option<String>| {
        if !list.iter().any(|d| d.kind == kind && d.name == name) {
            list.push(DeviceInfo { is_default: Some(&name) == default.as_ref(), name, kind });
        }
    };
    #[cfg(windows)]
    if let Ok(devices) = host.output_devices() {
        for name in devices.filter_map(|d| d.name().ok()) {
            add(name, "output", &default_out);
        }
    }
    #[cfg(not(windows))]
    {
        let _ = default_out;
        let (outputs, default) = super::system::output_devices();
        for name in outputs {
            add(name, "output", &default);
        }
    }
    if let Ok(devices) = host.input_devices() {
        for name in devices.filter_map(|d| d.name().ok()) {
            add(name, "input", &default_in);
        }
    }
    list
}

fn find_device(host: &cpal::Host, name: Option<&str>, loopback: bool) -> Result<cpal::Device, String> {
    let wanted = |d: &cpal::Device| name.is_some_and(|n| d.name().is_ok_and(|dn| dn == n));
    let found = if loopback {
        match name {
            Some(_) => host.output_devices().map_err(|e| e.to_string())?.find(wanted),
            None => host.default_output_device(),
        }
    } else {
        match name {
            Some(_) => host.input_devices().map_err(|e| e.to_string())?.find(wanted),
            None => host.default_input_device(),
        }
    };
    found.ok_or_else(|| format!("Audiogerät nicht gefunden: {}", name.unwrap_or("Standard")))
}

pub(super) type SharedBuffer = Arc<Mutex<VecDeque<[f32; 2]>>>;

// Höchstens 1 s puffern, älteste Samples verwerfen
pub(super) fn push_frames(buffer: &SharedBuffer, cap: usize, frames: impl Iterator<Item = [f32; 2]>) {
    let Ok(mut buf) = buffer.lock() else { return };
    buf.extend(frames);
    while buf.len() > cap {
        buf.pop_front();
    }
}

pub struct Capture {
    pub info: CaptureInfo,
    running: Arc<AtomicBool>,
    stop_stream: mpsc::Sender<()>,
    threads: Vec<JoinHandle<()>>,
}

impl Capture {
    pub fn start(device: Option<String>, loopback: bool, on_frame: Channel<InvokeResponseBody>) -> Result<Self, String> {
        let buffer: SharedBuffer = Arc::new(Mutex::new(VecDeque::with_capacity(48000)));
        let running = Arc::new(AtomicBool::new(true));
        let (stop_tx, stop_rx) = mpsc::channel::<()>();
        let (ready_tx, ready_rx) = mpsc::channel::<Result<CaptureInfo, String>>();

        // cpal::Stream ist nicht Send und lebt daher in einem eigenen Thread
        let stream_buffer = buffer.clone();
        let stream_thread = std::thread::Builder::new()
            .name("pulse-audio-capture".into())
            .spawn(move || {
                #[cfg(not(windows))]
                if loopback {
                    return super::system::run(device.as_deref(), stream_buffer, ready_tx, stop_rx);
                }
                let built = (|| {
                    let host = cpal::default_host();
                    let dev = find_device(&host, device.as_deref(), loopback)?;
                    let config = if loopback { dev.default_output_config() } else { dev.default_input_config() }
                        .map_err(|e| e.to_string())?;
                    let info = CaptureInfo {
                        name: dev.name().unwrap_or_else(|_| "Unbekanntes Gerät".into()),
                        sample_rate: config.sample_rate().0,
                        channels: config.channels(),
                        loopback,
                    };
                    let stream_config: cpal::StreamConfig = config.clone().into();
                    let stream = match config.sample_format() {
                        cpal::SampleFormat::F32 => build::<f32>(&dev, &stream_config, stream_buffer),
                        cpal::SampleFormat::I16 => build::<i16>(&dev, &stream_config, stream_buffer),
                        cpal::SampleFormat::U16 => build::<u16>(&dev, &stream_config, stream_buffer),
                        cpal::SampleFormat::I32 => build::<i32>(&dev, &stream_config, stream_buffer),
                        other => return Err(format!("Sample-Format {other:?} wird nicht unterstützt")),
                    }?;
                    stream.play().map_err(|e| e.to_string())?;
                    Ok((stream, info))
                })();
                match built {
                    Ok((stream, info)) => {
                        let _ = ready_tx.send(Ok(info));
                        let _ = stop_rx.recv();
                        drop(stream);
                    }
                    Err(e) => {
                        let _ = ready_tx.send(Err(e));
                    }
                }
            })
            .map_err(|e| e.to_string())?;

        let info = ready_rx.recv().map_err(|e| e.to_string())??;

        let analysis_running = running.clone();
        let sample_rate = info.sample_rate as f32;
        let analysis_thread = std::thread::Builder::new()
            .name("pulse-audio-analysis".into())
            .spawn(move || analysis_loop(sample_rate, buffer, analysis_running, on_frame))
            .map_err(|e| e.to_string())?;

        Ok(Self { info, running, stop_stream: stop_tx, threads: vec![stream_thread, analysis_thread] })
    }

    pub fn stop(mut self) {
        self.running.store(false, Ordering::Relaxed);
        let _ = self.stop_stream.send(());
        for t in self.threads.drain(..) {
            let _ = t.join();
        }
    }
}

fn build<T>(device: &cpal::Device, config: &cpal::StreamConfig, buffer: SharedBuffer) -> Result<cpal::Stream, String>
where
    T: SizedSample,
    f32: FromSample<T>,
{
    let channels = config.channels as usize;
    let cap = config.sample_rate.0 as usize;
    device
        .build_input_stream(
            config,
            move |data: &[T], _: &cpal::InputCallbackInfo| {
                let frames = data.chunks(channels).map(|frame| {
                    let l: f32 = frame[0].to_sample::<f32>();
                    let r: f32 = if channels > 1 { frame[1].to_sample::<f32>() } else { l };
                    [l, r]
                });
                push_frames(&buffer, cap, frames);
            },
            |err| eprintln!("Audio-Stream-Fehler: {err}"),
            None,
        )
        .map_err(|e| e.to_string())
}

fn analysis_loop(sample_rate: f32, buffer: SharedBuffer, running: Arc<AtomicBool>, on_frame: Channel<InvokeResponseBody>) {
    let mut analyzer = Analyzer::new(sample_rate);
    let mut frame = vec![0.0f32; FRAME_FLOATS];
    let mut bytes = Vec::with_capacity(FRAME_FLOATS * 4);
    let (mut left, mut right) = (Vec::new(), Vec::new());
    let interval = Duration::from_secs_f64(1.0 / FRAME_RATE);
    let mut next = Instant::now();

    while running.load(Ordering::Relaxed) {
        left.clear();
        right.clear();
        if let Ok(mut buf) = buffer.lock() {
            for [l, r] in buf.drain(..) {
                left.push(l);
                right.push(r);
            }
        }
        analyzer.push(&left, &right);
        analyzer.frame(&mut frame);

        bytes.clear();
        for v in &frame {
            bytes.extend_from_slice(&v.to_le_bytes());
        }
        // Schlägt das Senden fehl, ist das Fenster weg: dann aufhören
        if on_frame.send(InvokeResponseBody::Raw(bytes.clone())).is_err() {
            break;
        }

        next += interval;
        let now = Instant::now();
        if next > now {
            std::thread::sleep(next - now);
        } else {
            next = now; // nicht hinterherhetzen, falls wir einmal zu langsam waren
        }
    }
}
