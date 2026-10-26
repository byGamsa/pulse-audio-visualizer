mod audio;
mod auth;
mod display;
mod media;
mod modes;

use std::path::PathBuf;
use std::sync::Mutex;
use tauri::http::{Response, StatusCode};
use tauri::ipc::{Channel, InvokeBody, InvokeResponseBody, Request};
use tauri::{AppHandle, Manager, Runtime, State};

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

fn modes_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("modes");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

// Feste Adresse, damit die Oberfläche keine beliebigen Seiten öffnen kann
#[tauri::command]
fn open_terms(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener().open_url("https://pulse.dendree.de/terms", None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
fn auth_begin(app: AppHandle, auth_url: String, state: String) -> Result<(), String> {
    auth::begin(app, &auth_url, state)
}

#[tauri::command]
async fn modes_list(app: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    Ok(modes::list(&modes_dir(&app)?))
}

// Das .pulsemode-Paket kommt als rohe Bytes
#[tauri::command]
async fn modes_install(app: AppHandle, request: Request<'_>) -> Result<serde_json::Value, String> {
    let InvokeBody::Raw(bytes) = request.body() else { return Err("expected raw package bytes".into()) };
    modes::install(&modes_dir(&app)?, bytes)
}

#[tauri::command]
async fn modes_install_file(app: AppHandle, path: String) -> Result<serde_json::Value, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    modes::install(&modes_dir(&app)?, &bytes)
}

#[tauri::command]
async fn modes_uninstall(app: AppHandle, id: String) -> Result<(), String> {
    modes::uninstall(&modes_dir(&app)?, &id)
}

// pulsemode://localhost/<id>/<datei>, unter Windows http://pulsemode.localhost/<id>/<datei>
fn serve_mode_file<R: Runtime>(app: &AppHandle<R>, path: &str) -> Response<Vec<u8>> {
    let mut parts = path.trim_start_matches('/').splitn(2, '/');
    let (id, name) = (parts.next().unwrap_or_default(), parts.next().unwrap_or_default());
    let file = modes_dir(app).ok().and_then(|root| modes::read_file(&root, id, name));
    match (file, modes::content_type(name)) {
        (Some(data), Some(mime)) => Response::builder()
            .header("Content-Type", mime)
            .header("Cache-Control", "no-store")
            .body(data),
        _ => Response::builder().status(StatusCode::NOT_FOUND).body(Vec::new()),
    }
    .unwrap_or_default()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Muss zuerst kommen: ein zweiter Start (z. B. per pulse://-Link) übergibt nur den Link und beendet sich
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AudioState::default())
        .setup(|_app| {
            // Installer registrieren pulse:// selbst, Debug-Builds und AppImage nicht
            #[cfg(any(debug_assertions, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = _app.deep_link().register_all();
            }
            Ok(())
        })
        .on_window_event(display::on_window_event)
        .register_uri_scheme_protocol("pulsemode", |ctx, request| serve_mode_file(ctx.app_handle(), request.uri().path()))
        .invoke_handler(tauri::generate_handler![
            audio_devices,
            audio_start,
            audio_stop,
            now_playing,
            display::monitors,
            display::display_set,
            auth_begin,
            open_terms,
            modes_list,
            modes_install,
            modes_install_file,
            modes_uninstall
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
