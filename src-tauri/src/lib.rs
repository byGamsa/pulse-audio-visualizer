mod audio;

use std::sync::Mutex;
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::State;

// Höchstens eine Aufnahme gleichzeitig
#[derive(Default)]
struct AudioState(Mutex<Option<audio::Capture>>);

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
) -> Result<audio::CaptureInfo, String> {
    let mut slot = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(old) = slot.take() {
        old.stop();
    }
    let capture = audio::Capture::start(device, loopback, on_frame)?;
    let info = capture.info.clone();
    *slot = Some(capture);
    Ok(info)
}

#[tauri::command]
fn audio_stop(state: State<'_, AudioState>) {
    if let Ok(mut slot) = state.0.lock() {
        if let Some(capture) = slot.take() {
            capture.stop();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AudioState::default())
        .invoke_handler(tauri::generate_handler![audio_devices, audio_start, audio_stop])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
