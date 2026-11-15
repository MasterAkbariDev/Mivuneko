use serde_json::{json, Value};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
#[repr(C)]
#[derive(Default, Clone, Copy)]
struct Rect {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}
#[cfg(windows)]
#[link(name = "user32")]
unsafe extern "system" {
    fn EnumWindows(cb: unsafe extern "system" fn(isize, isize) -> i32, p: isize) -> i32;
    fn IsWindowVisible(w: isize) -> i32;
    fn IsIconic(w: isize) -> i32;
    fn GetWindowRect(w: isize, r: *mut Rect) -> i32;
    fn GetWindowThreadProcessId(w: isize, p: *mut u32) -> u32;
    fn GetWindowTextLengthW(w: isize) -> i32;
    fn GetClassNameW(w: isize, name: *mut u16, count: i32) -> i32;
}
#[cfg(windows)]
unsafe extern "system" fn collect(w: isize, p: isize) -> i32 {
    let mut pid = 0;
    unsafe {
        GetWindowThreadProcessId(w, &mut pid);
    }
    let mut r = Rect::default();
    let mut class = [0u16; 256];
    let count = unsafe { GetClassNameW(w, class.as_mut_ptr(), class.len() as i32) };
    let class = String::from_utf16_lossy(&class[..count.max(0) as usize]);
    if pid != std::process::id()
        && !matches!(
            class.as_str(),
            "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd"
        )
        && unsafe { IsWindowVisible(w) } != 0
        && unsafe { IsIconic(w) } == 0
        && unsafe { GetWindowTextLengthW(w) } > 0
        && unsafe { GetWindowRect(w, &mut r) } != 0
        && r.right - r.left > 150
        && r.bottom - r.top > 100
    {
        unsafe {
            (*(p as *mut Vec<(isize, Rect)>)).push((w, r));
        }
    }
    1
}
static ICONS: OnceLock<Mutex<(Instant, Vec<Value>)>> = OnceLock::new();
#[tauri::command]
pub async fn pet_rest_surfaces(
    window: tauri::Window,
    app: tauri::AppHandle,
) -> Result<Vec<Value>, String> {
    if window.label() != "pet" {
        return Err("Pet geometry only".into());
    }
    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("Display unavailable")?;
    let area = monitor.work_area();
    let (x, y, width, height) = (
        area.position.x,
        area.position.y,
        area.size.width as i32,
        area.size.height as i32,
    );
    tauri::async_runtime::spawn_blocking(move||{
  let mut windows:Vec<(isize,Rect)>=Vec::new();#[cfg(windows)]unsafe{EnumWindows(collect,&mut windows as *mut _ as isize);}
  let mut result=vec![json!({"id":format!("taskbar:{x}:{y}"),"left":x+8,"right":x+width-8,"y":y+height-3,"kind":"taskbar"})];
  for (index,(id,r)) in windows.iter().enumerate() {
    if r.top<=y+80 || r.top>=y+height-30 || r.right<=x || r.left>=x+width {continue;}
    // EnumWindows follows Z order. Split the ledge around foreground windows,
    // so a hidden portion of a window is never offered as a seat.
    let mut spans=vec![(r.left.max(x)+12,r.right.min(x+width)-12)];
    for (_,front) in &windows[..index] {
      if front.top<=r.top+2 && front.bottom>=r.top-2 {
        spans=spans.into_iter().flat_map(|(l,h)| {
          if front.right<=l || front.left>=h {vec![(l,h)]}
          else {vec![(l,front.left-8),(front.right+8,h)]}
        }).filter(|(l,h)|h-l>=24).collect();
      }
    }
    for (segment,(left,right)) in spans.into_iter().enumerate() {
      result.push(json!({"id":format!("window:{id}:{segment}"),"left":left,"right":right,"y":r.top+2,"kind":"window"}));
    }
  }
  let cache=ICONS.get_or_init(||Mutex::new((Instant::now()-Duration::from_secs(30),vec![])));
  if let Ok(mut cached)=cache.lock(){if cached.0.elapsed()>Duration::from_secs(15){cached.0=Instant::now();if let Ok(config)=super::local_runtime::config(&app){if let Ok(path)=super::local_runtime::helper(&app,"rest_surface_worker.py",include_str!("../../../../services/local-runtime/computer.py")){use std::io::Write;use std::process::Stdio;if let Ok(mut child)=super::local_runtime::command(&config).arg(path).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null()).spawn(){if let Some(mut input)=child.stdin.take(){let _=input.write_all(b"{\"op\":\"surfaces\"}");}
if let Ok(output)=child.wait_with_output(){if let Ok(v)=serde_json::from_slice::<Value>(&output.stdout){if let Some(items)=v["result"].as_array(){cached.1=items.clone();}}}}}}}
   result.extend(cached.1.iter().filter(|v|{let ix=v["left"].as_i64().unwrap_or(0) as i32;let iy=v["y"].as_i64().unwrap_or(0) as i32;ix>=x&&ix<x+width&&iy>y+80&&iy<y+height-30&&!windows.iter().any(|(_,r)|ix>=r.left&&ix<=r.right&&iy>=r.top&&iy<=r.bottom)}).cloned());}
  Ok(result)
 }).await.map_err(|_|"Resting surface lookup failed")?
}
