use tauri::{AppHandle, Emitter, Manager, Monitor, PhysicalPosition, WebviewUrl, WebviewWindowBuilder, WindowEvent};

pub const LABEL: &str = "display";

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    // Name des Monitors, sonst „#<Index>“
    id: String,
    width: u32,
    height: u32,
    primary: bool,
    // Das Hauptfenster liegt auf diesem Monitor
    current: bool,
}

fn monitor_id(monitor: &Monitor, index: usize) -> String {
    monitor.name().cloned().unwrap_or_else(|| format!("#{index}"))
}

fn same(a: &Monitor, b: &Monitor) -> bool {
    a.position() == b.position() && a.size() == b.size()
}

#[tauri::command]
pub fn monitors(app: AppHandle) -> Result<Vec<MonitorInfo>, String> {
    let all = app.available_monitors().map_err(|e| e.to_string())?;
    let primary = app.primary_monitor().ok().flatten();
    let current = app.get_webview_window("main").and_then(|w| w.current_monitor().ok().flatten());
    Ok(all
        .iter()
        .enumerate()
        .map(|(i, m)| MonitorInfo {
            id: monitor_id(m, i),
            width: m.size().width,
            height: m.size().height,
            primary: primary.as_ref().is_some_and(|p| same(p, m)),
            current: current.as_ref().is_some_and(|c| same(c, m)),
        })
        .collect())
}

// Öffnet das Ausgabefenster im Vollbild auf dem Monitor oder schließt es (None).
// Async, weil das Erzeugen von Fenstern in synchronen Commands unter Windows hängt
#[tauri::command]
pub async fn display_set(app: AppHandle, monitor: Option<String>) -> Result<(), String> {
    let existing = app.get_webview_window(LABEL);
    let Some(id) = monitor else {
        if let Some(window) = existing {
            window.close().map_err(|e| e.to_string())?;
        }
        return Ok(());
    };

    let all = app.available_monitors().map_err(|e| e.to_string())?;
    let target = all
        .iter()
        .enumerate()
        .find(|(i, m)| monitor_id(m, *i) == id)
        .map(|(_, m)| m.clone())
        .ok_or_else(|| format!("Monitor {id} not found"))?;

    let window = match existing {
        Some(window) => {
            // Vollbild lösen, sonst bleibt es auf dem alten Monitor
            window.set_fullscreen(false).map_err(|e| e.to_string())?;
            window
        }
        None => WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::App("index.html#display".into()))
            .title("Pulse")
            .decorations(false)
            .visible(false)
            .background_color(tauri::window::Color(0, 0, 0, 255))
            .build()
            .map_err(|e| e.to_string())?,
    };
    let pos = target.position();
    window
        .set_position(PhysicalPosition::new(pos.x, pos.y))
        .map_err(|e| e.to_string())?;
    window.set_size(*target.size()).map_err(|e| e.to_string())?;
    // macOS wechselt versteckte Fenster nicht in den Vollbildmodus
    window.show().map_err(|e| e.to_string())?;
    window.set_fullscreen(true).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn on_window_event(window: &tauri::Window, event: &WindowEvent) {
    let app = window.app_handle();
    match (window.label(), event) {
        // Z. B. per Esc im Ausgabefenster: Hauptfenster rendert wieder selbst
        (LABEL, WindowEvent::Destroyed) => {
            let _ = app.emit_to("main", "display-closed", ());
        }
        // Ohne Hauptfenster würde die App sonst weiterlaufen
        ("main", WindowEvent::CloseRequested { .. }) => {
            if let Some(display) = app.get_webview_window(LABEL) {
                let _ = display.close();
            }
        }
        _ => {}
    }
}
