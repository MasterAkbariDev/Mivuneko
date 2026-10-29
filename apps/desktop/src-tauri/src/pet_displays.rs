use tauri::{Emitter, Manager};
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
        return Err("Configure the pet in the app".into());
    }
    // Legacy monitor replicas are retired. There is exactly one desktop companion.
    for (label, w) in app.webview_windows() {
        if label.starts_with("pet-monitor-") {
            let _ = w.close();
        }
    }
    let pet = app
        .get_webview_window("pet")
        .ok_or("Pet window unavailable")?;
    if relocate && selection != "current" && selection != "all" {
        let monitors = pet.available_monitors().map_err(|e| e.to_string())?;
        let m = monitors
            .iter()
            .find(|m| key(m) == selection)
            .ok_or("That monitor is no longer connected")?;
        let a = m.work_area();
        let size = pet.outer_size().map_err(|e| e.to_string())?;
        pet.set_position(tauri::PhysicalPosition::new(
            a.position.x + (a.size.width.saturating_sub(size.width) / 2) as i32,
            a.position.y + (a.size.height.saturating_sub(size.height) / 2) as i32,
        ))
        .map_err(|e| e.to_string())?;
        app.emit_to("pet", "pet-recover", serde_json::json!({"resetSize":false}))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
pub fn recover(app: &tauri::AppHandle, center: bool) -> Result<serde_json::Value, String> {
    let pet = app
        .get_webview_window("pet")
        .ok_or("Pet window unavailable")?;
    let all = pet.available_monitors().map_err(|e| e.to_string())?;
    let m = if center {
        let cursor = app.cursor_position().ok();
        let under_cursor = cursor.and_then(|p| {
            all.iter()
                .find(|m| {
                    let a = m.work_area();
                    p.x >= f64::from(a.position.x)
                        && p.y >= f64::from(a.position.y)
                        && p.x < f64::from(a.position.x) + f64::from(a.size.width)
                        && p.y < f64::from(a.position.y) + f64::from(a.size.height)
                })
                .cloned()
        });
        under_cursor
            .or_else(|| {
                app.get_webview_window("main")
                    .and_then(|w| w.current_monitor().ok().flatten())
            })
            .or_else(|| all.first().cloned())
    } else {
        pet.current_monitor()
            .map_err(|e| e.to_string())?
            .or_else(|| all.first().cloned())
    }
    .ok_or("No connected monitor")?;
    let a = m.work_area();
    let size = pet.outer_size().map_err(|e| e.to_string())?;
    let p = pet.outer_position().map_err(|e| e.to_string())?;
    let aw = a.size.width as i32;
    let ah = a.size.height as i32;
    let sw = size.width as i32;
    let sh = size.height as i32;
    let x = if center {
        a.position.x + (aw - sw) / 2
    } else if sw <= aw {
        p.x.clamp(a.position.x, a.position.x + aw - sw)
    } else {
        p.x.clamp(
            a.position.x + 220.min(aw) - sw,
            a.position.x + aw - 220.min(aw),
        )
    };
    let y = if center {
        if sh <= ah {
            a.position.y + (ah - sh) / 2
        } else {
            a.position.y + 16 - 128 - ((sh - 216) as f64 * 0.08) as i32
        }
    } else if sh <= ah {
        p.y.clamp(a.position.y, a.position.y + ah - sh)
    } else {
        p.y.clamp(
            a.position.y + 160.min(ah) - sh,
            a.position.y + ah - 160.min(ah),
        )
    };
    pet.set_position(tauri::PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    crate::global_keys::reveal_pet(&pet.as_ref().window())?;
    app.emit_to("pet", "pet-recover", serde_json::json!({"resetSize":false}))
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({"monitor":m.name(),"x":x,"y":y}))
}
#[tauri::command]
pub fn recover_pet(
    window: tauri::Window,
    app: tauri::AppHandle,
    center: bool,
) -> Result<serde_json::Value, String> {
    if !["main", "pet"].contains(&window.label()) {
        return Err("Pet controls only".into());
    }
    recover(&app, center)
}
