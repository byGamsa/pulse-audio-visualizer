// ScreenCaptureKit: Systemaudio ohne virtuelles Kabel (ab macOS 13)

use super::capture::{push_frames, CaptureInfo, SharedBuffer};
use screencapturekit::prelude::*;
use screencapturekit::CMTime;
use std::sync::mpsc::{Receiver, Sender};

const RATE: u32 = 48_000;
const NAME: &str = "System audio";

pub fn output_devices() -> (Vec<String>, Option<String>) {
    (vec![NAME.into()], Some(NAME.into()))
}

struct AudioSink {
    buffer: SharedBuffer,
}

fn floats(bytes: &[u8]) -> impl Iterator<Item = f32> + '_ {
    bytes.chunks_exact(4).map(|c| f32::from_ne_bytes([c[0], c[1], c[2], c[3]]))
}

impl SCStreamOutputTrait for AudioSink {
    fn did_output_sample_buffer(&self, sample: CMSampleBuffer, kind: SCStreamOutputType) {
        if !matches!(kind, SCStreamOutputType::Audio) {
            return;
        }
        let Ok(list) = sample.audio_buffer_list() else { return };
        let cap = RATE as usize;
        // Meist ein Puffer pro Kanal, selten ein verschachtelter
        match (list.get(0), list.get(1)) {
            (Some(l), Some(r)) => push_frames(&self.buffer, cap, floats(l.data()).zip(floats(r.data())).map(|(l, r)| [l, r])),
            (Some(b), None) if b.number_channels >= 2 => {
                let ch = b.number_channels as usize;
                let all: Vec<f32> = floats(b.data()).collect();
                push_frames(&self.buffer, cap, all.chunks_exact(ch).map(|f| [f[0], f[1]]));
            }
            (Some(b), None) => push_frames(&self.buffer, cap, floats(b.data()).map(|v| [v, v])),
            _ => {}
        }
    }
}

fn start(buffer: SharedBuffer) -> Result<SCStream, String> {
    // Ohne Freigabe „Bildschirm- und Systemaudioaufnahme“ gibt es hier keinen Inhalt
    let content = SCShareableContent::get().map_err(|e| {
        format!("Allow Pulse under System Settings → Privacy & Security → Screen & System Audio Recording, then try again. ({e})")
    })?;
    let display = content.displays().into_iter().next().ok_or("No display found")?;
    let filter = SCContentFilter::create()
        .with_display(&display)
        .with_excluding_windows(&[])
        .build()
        .map_err(|e| e.to_string())?;
    // Bild wird nicht gebraucht: winzig und 1 fps
    let config = SCStreamConfiguration::new()
        .with_width(2)
        .with_height(2)
        .with_minimum_frame_interval(&CMTime::new(1, 1))
        .with_captures_audio(true)
        .with_excludes_current_process_audio(true)
        .with_sample_rate(RATE as i32)
        .with_channel_count(2);
    let mut stream = SCStream::new(&filter, &config).map_err(|e| e.to_string())?;
    stream.add_output_handler(AudioSink { buffer }, SCStreamOutputType::Audio).map_err(|e| e.to_string())?;
    stream.start_capture().map_err(|e| e.to_string())?;
    Ok(stream)
}

pub fn run(_device: Option<&str>, buffer: SharedBuffer, ready: Sender<Result<CaptureInfo, String>>, stop: Receiver<()>) {
    match start(buffer) {
        Ok(stream) => {
            let _ = ready.send(Ok(CaptureInfo { name: NAME.into(), sample_rate: RATE, channels: 2, loopback: true }));
            let _ = stop.recv();
            let _ = stream.stop_capture();
        }
        Err(e) => {
            let _ = ready.send(Err(e));
        }
    }
}
