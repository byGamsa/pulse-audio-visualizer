mod audio;
mod display;
mod media;

use std::sync::Mutex;
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::State;

// Höchstens eine Aufnahme gleichzeitig
#[derive(Default)]
struct AudioState(Mutex<AudioSlot>);

#[derive(Default)]
struct AudioSlot {
    next_id: u32,
    current: Option<(u32, audio::Capture)>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct StartedCapture {
    #[serde(flatten)]
    info: audio::CaptureInfo,
    id: u32,
}

#[tauri::command]
fn audio_devices() -> Vec<audio::DeviceInfo> {
    audio::list_devices()
}

#[tauri::command]
fn audio_start(
    state: State<'_, AudioState>,
    device: Option<String>,
    loopback: bool,
    on_frame: Channel<InvokeResponseBody>,
) -> Result<StartedCapture, String> {
    let mut slot = state.0.lock().map_err(|e| e.to_string())?;
    if let Some((_, old)) = slot.current.take() {
        old.stop();
    }
    let capture = audio::Capture::start(device, loopback, on_frame)?;
    let info = capture.info.clone();
    slot.next_id = slot.next_id.wrapping_add(1);
    let id = slot.next_id;
    slot.current = Some((id, capture));
    Ok(StartedCapture { info, id })
}

// Mit id nur stoppen, wenn genau diese Aufnahme noch läuft
#[tauri::command]
fn audio_stop(state: State<'_, AudioState>, id: Option<u32>) {
    if let Ok(mut slot) = state.0.lock() {
        let matches = match (&slot.current, id) {
            (Some((current, _)), Some(id)) => *current == id,
            (Some(_), None) => true,
            (None, _) => false,
        };
        if matches {
            if let Some((_, capture)) = slot.current.take() {
                capture.stop();
            }
        }
    }
}

// WinRT blockiert, daher im Hintergrund-Thread
#[tauri::command]
async fn now_playing() -> Option<media::NowPlaying> {
    tauri::async_runtime::spawn_blocking(media::now_playing).await.ok().flatten()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(AudioState::default())
        .on_window_event(display::on_window_event)
        .invoke_handler(tauri::generate_handler![
            audio_devices,
            audio_start,
            audio_stop,
            now_playing,
            display::monitors,
            display::display_set
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
