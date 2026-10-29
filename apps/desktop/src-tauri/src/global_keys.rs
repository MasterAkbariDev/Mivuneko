use std::collections::HashMap;
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

#[tauri::command]
pub fn configure_global_shortcuts(
    window: tauri::Window,
    app: tauri::AppHandle,
    bindings: HashMap<String, String>,
) -> Result<Vec<String>, String> {
    if window.label() != "main" {
        return Err("Configure shortcuts in the app".into());
    }
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| e.to_string())?;
    let mut errors = Vec::new();
    for (action, chord) in bindings {
        if ![
            "record",
            "stop",
            "chat",
            "characters",
            "settings",
            "edit",
            "clickThrough",
            "focus",
            "screen",
            "reset",
        ]
        .contains(&action.as_str())
        {
            continue;
        }
        if !chord.contains('+') && !chord.starts_with('F') {
            errors.push(format!("{action}: choose a modifier or function key"));
            continue;
        }
        let key = chord
            .replace("Ctrl+", "Control+")
            .replace("Meta+", "Super+")
            .replace("+,", "+Comma")
            .replace("+.", "+Period")
            .replace("+/", "+Slash")
            .replace("+;", "+Semicolon");
        let name = action.clone();
        if let Err(e) = app
            .global_shortcut()
            .on_shortcut(key.as_str(), move |app, _, event| {
                if event.state == ShortcutState::Pressed {
                    if ["chat", "characters", "settings", "screen"].contains(&name.as_str()) {
                        if let Some(main) = app.get_webview_window("main") {
                            let _ = main.show();
                            let _ = main.set_focus();
                        }
                    }
                    let _ = app.emit_to("main", "global-action", name.clone());
                }
            })
        {
            errors.push(format!("{action} ({chord}): {e}"));
        }
    }
    Ok(errors)
}
#[derive(serde::Serialize)]
pub struct Cursor {
    x: f64,
    y: f64,
    down: bool,
}
#[tauri::command]
pub fn pet_cursor(window: tauri::Window, app: tauri::AppHandle) -> Result<Cursor, String> {
    if !window.label().starts_with("pet") {
        return Err("Pet only".into());
    }
    let p = app.cursor_position().map_err(|e| e.to_string())?;
    #[cfg(target_os = "windows")]
    let down = unsafe { GetAsyncKeyState(1) < 0 };
    #[cfg(not(target_os = "windows"))]
    let down = false;
    Ok(Cursor {
        x: p.x,
        y: p.y,
        down,
    })
}
#[derive(Clone, Copy, Default)]
#[repr(C)]
struct Rect {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}
#[cfg(target_os = "windows")]
#[link(name = "user32")]
unsafe extern "system" {
    fn GetAsyncKeyState(key: i32) -> i16;
    fn EnumWindows(callback: unsafe extern "system" fn(isize, isize) -> i32, param: isize) -> i32;
    fn GetWindowThreadProcessId(hwnd: isize, pid: *mut u32) -> u32;
    fn GetWindowRect(hwnd: isize, rect: *mut Rect) -> i32;
    fn IsWindowVisible(hwnd: isize) -> i32;
    fn IsIconic(hwnd: isize) -> i32;
    fn GetWindowTextLengthW(hwnd: isize) -> i32;
}
#[cfg(target_os = "windows")]
unsafe extern "system" fn candidate(hwnd: isize, param: isize) -> i32 {
    let mut pid = 0;
    unsafe {
        GetWindowThreadProcessId(hwnd, &mut pid);
    }
    let mut r = Rect::default();
    if pid != std::process::id()
        && unsafe { IsWindowVisible(hwnd) } != 0
        && unsafe { IsIconic(hwnd) } == 0
        && unsafe { GetWindowTextLengthW(hwnd) } > 0
        && unsafe { GetWindowRect(hwnd, &mut r) } != 0
        && r.right - r.left > 300
        && r.bottom - r.top > 200
    {
        unsafe {
            *(param as *mut Option<Rect>) = Some(r);
        }
        return 0;
    }
    1
}
#[tauri::command]
pub fn quiet_pet_position(window: tauri::Window) -> Result<serde_json::Value, String> {
    if !window.label().starts_with("pet") {
        return Err("Pet only".into());
    }
    let m = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("Display unavailable")?;
    let size = window.outer_size().map_err(|e| e.to_string())?;
    let a = m.work_area();
    #[cfg(target_os = "windows")]
    let mut active: Option<Rect> = None;
    #[cfg(not(target_os = "windows"))]
    let active: Option<Rect> = None;
    #[cfg(target_os = "windows")]
    unsafe {
        EnumWindows(candidate, &mut active as *mut _ as isize);
    }
    let x0 = a.position.x + 8;
    let y0 = a.position.y + 8;
    let x1 = a.position.x + (a.size.width.saturating_sub(size.width)) as i32 - 8;
    let y1 = a.position.y + (a.size.height.saturating_sub(size.height)) as i32 - 8;
    let points = [
        (x1.max(x0), y1.max(y0)),
        (x0, y1.max(y0)),
        (x1.max(x0), y0),
        (x0, y0),
    ];
    let position = window.outer_position().map_err(|e| e.to_string())?;
    let (x, y) = points
        .into_iter()
        .min_by_key(|(x, y)| {
            let overlap = active
                .map(|r| {
                    let w =
                        ((*x + size.width as i32).min(r.right) - (*x).max(r.left)).max(0) as i64;
                    let h =
                        ((*y + size.height as i32).min(r.bottom) - (*y).max(r.top)).max(0) as i64;
                    w * h
                })
                .unwrap_or(0);
            let dx = i64::from(*x - position.x);
            let dy = i64::from(*y - position.y);
            (overlap, dx * dx + dy * dy)
        })
        .unwrap();
    Ok(serde_json::json!({"x":x,"y":y}))
}

// Update the framework's visibility state as well as the HWND. Calling ShowWindow
// alone leaves winit's cached visibility false, so later window updates hide it.
pub fn reveal_pet(window: &tauri::Window) -> Result<(), String> {
    window.set_focusable(false).map_err(|e| e.to_string())?;
    let result = window.show().map_err(|e| e.to_string());
    let restore = window.set_focusable(true).map_err(|e| e.to_string());
    result.and(restore)
}
#[tauri::command]
pub fn show_pet(window: tauri::Window) -> Result<(), String> {
    if window.label() != "pet" {
        return Err("Pet only".into());
    }
    reveal_pet(&window)
}
