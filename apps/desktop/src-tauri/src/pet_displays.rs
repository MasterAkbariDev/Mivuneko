use sha2::{Digest, Sha256};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
fn key(m: &tauri::Monitor) -> String {
    format!(
        "{}:{}:{}",
        m.name().map(|s| s.as_str()).unwrap_or("Display"),
        m.position().x,
        m.position().y
    )
}
#[tauri::command]
pub async fn sync_pet_displays(
    window: tauri::Window,
    app: tauri::AppHandle,
    selection: String,
    relocate: bool,
) -> Result<(), String> {
    if !["main", "pet"].contains(&window.label()) {
        return Err("Configure displays in the main app".into());
    }
    let primary = app
        .get_webview_window("pet")
        .ok_or("Pet window unavailable")?;
    let monitors = primary
        .available_monitors()
        .map_err(|_| "Displays unavailable")?;
    let current = primary
        .current_monitor()
        .map_err(|_| "Current display unavailable")?;
    if selection != "current" && selection != "all" && !monitors.iter().any(|m| key(m) == selection)
    {
        return Err("This display is no longer connected".into());
    }
    if relocate && selection != "current" && selection != "all" {
        if let Some(m) = monitors.iter().find(|m| key(m) == selection) {
            let size = primary.outer_size().map_err(|_| "Pet size unavailable")?;
            let a = m.work_area();
            primary
                .set_position(tauri::PhysicalPosition::new(
                    a.position.x + (a.size.width.saturating_sub(size.width) / 2) as i32,
                    a.position.y + a.size.height.saturating_sub(size.height) as i32,
                ))
                .map_err(|_| "Cannot move pet to display")?;
        }
    }
    let primary_key = current.as_ref().map(key);
    let mut keep = std::collections::HashSet::new();
    if selection == "all" {
        for (i, m) in monitors.iter().enumerate() {
            if Some(key(m)) == primary_key {
                continue;
            }
            let hash = format!("{:x}", Sha256::digest(key(m).as_bytes()));
            let label = format!("pet-monitor-{}", &hash[..12]);
            keep.insert(label.clone());
            if app.get_webview_window(&label).is_none() {
                let area = m.work_area();
                let replica = WebviewWindowBuilder::new(
                    &app,
                    &label,
                    WebviewUrl::App(format!("index.html?view=pet&replica={i}").into()),
                )
                .title("Mivuneko")
                .visible(false)
                .inner_size(360.0, 440.0)
                .transparent(true)
                .decorations(false)
                .resizable(false)
                .shadow(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .build()
                .map_err(|_| "Cannot create companion on this display")?;
                replica
                    .set_position(tauri::PhysicalPosition::new(
                        area.position.x + 40,
                        area.position.y + (area.size.height as i32 - 460).max(0),
                    ))
                    .map_err(|_| "Cannot place companion")?;
            }
        }
    }
    for (label, w) in app.webview_windows() {
        if label.starts_with("pet-monitor-") && !keep.contains(&label) {
            let _ = w.close();
        }
    }
    Ok(())
}
