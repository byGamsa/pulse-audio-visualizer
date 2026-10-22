// PulseAudio/PipeWire: die Monitor-Quelle eines Ausgabegeräts ist das Loopback

use super::capture::{push_frames, CaptureInfo, SharedBuffer};
use libpulse_binding::def::BufferAttr;
use libpulse_binding::sample::{Format, Spec};
use libpulse_binding::stream::Direction;
use libpulse_simple_binding::Simple;
use std::process::Command;
use std::sync::mpsc::{Receiver, Sender, TryRecvError};

const RATE: u32 = 48_000;
const DEFAULT_NAME: &str = "Default output";

struct Sink {
    name: String,
    description: String,
}

// pactl gibt es mit PulseAudio und pipewire-pulse; LC_ALL=C, weil die Ausgabe übersetzt wird
fn sinks() -> (Vec<Sink>, Option<String>) {
    let run = |args: &[&str]| {
        Command::new("pactl")
            .args(args)
            .env("LC_ALL", "C")
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
    };
    let mut list: Vec<Sink> = Vec::new();
    for line in run(&["list", "sinks"]).unwrap_or_default().lines().map(str::trim) {
        if let Some(name) = line.strip_prefix("Name:") {
            list.push(Sink { name: name.trim().into(), description: name.trim().into() });
        } else if let (Some(desc), Some(last)) = (line.strip_prefix("Description:"), list.last_mut()) {
            last.description = desc.trim().into();
        }
    }
    let default = run(&["get-default-sink"]).map(|s| s.trim().to_string());
    let default = list.iter().find(|s| Some(&s.name) == default.as_ref()).map(|s| s.description.clone());
    (list, default)
}

pub fn output_devices() -> (Vec<String>, Option<String>) {
    let (list, default) = sinks();
    if list.is_empty() {
        return (vec![DEFAULT_NAME.into()], Some(DEFAULT_NAME.into()));
    }
    (list.into_iter().map(|s| s.description).collect(), default)
}

pub fn run(device: Option<&str>, buffer: SharedBuffer, ready: Sender<Result<CaptureInfo, String>>, stop: Receiver<()>) {
    let (list, default) = sinks();
    let sink = device.and_then(|d| list.iter().find(|s| s.description == d));
    let source = sink.map_or_else(|| "@DEFAULT_MONITOR@".to_string(), |s| format!("{}.monitor", s.name));
    let name = sink.map(|s| s.description.clone()).or(default).unwrap_or_else(|| DEFAULT_NAME.into());

    let spec = Spec { format: Format::F32le, channels: 2, rate: RATE };
    // Ohne fragsize liefert PulseAudio erst nach bis zu 2 s; 10 ms Stereo-f32
    let chunk = (RATE / 100 * 2 * 4) as usize;
    let attr = BufferAttr { maxlength: u32::MAX, tlength: u32::MAX, prebuf: u32::MAX, minreq: u32::MAX, fragsize: chunk as u32 };
    let simple = match Simple::new(None, "Pulse", Direction::Record, Some(&source), "System audio", &spec, None, Some(&attr)) {
        Ok(s) => s,
        Err(e) => {
            let _ = ready.send(Err(format!("PulseAudio/PipeWire not reachable: {e}")));
            return;
        }
    };
    let _ = ready.send(Ok(CaptureInfo { name, sample_rate: RATE, channels: 2, loopback: true }));

    let mut bytes = vec![0u8; chunk];
    while matches!(stop.try_recv(), Err(TryRecvError::Empty)) {
        if let Err(e) = simple.read(&mut bytes) {
            eprintln!("Audio-Stream-Fehler: {e}");
            break;
        }
        let frames = bytes.chunks_exact(8).map(|f| {
            [f32::from_le_bytes([f[0], f[1], f[2], f[3]]), f32::from_le_bytes([f[4], f[5], f[6], f[7]])]
        });
        push_frames(&buffer, RATE as usize, frames);
    }
}
