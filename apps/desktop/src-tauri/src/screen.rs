use tauri::Manager;
#[tauri::command]
pub async fn capture_screen(
    window: tauri::Window,
    app: tauri::AppHandle,
) -> Result<Vec<u8>, String> {
    if window.label() != "main" {
        return Err("Request screen help from Conversations".into());
    }
    let monitor = window
        .current_monitor()
        .map_err(|_| "Display unavailable")?
        .ok_or("Display unavailable")?;
    let (x, y, w, h) = (
        monitor.position().x,
        monitor.position().y,
        monitor.size().width,
        monitor.size().height,
    );
    window.hide().map_err(|_| "Cannot prepare screenshot")?;
    let result=tauri::async_runtime::spawn_blocking(move||{
  std::thread::sleep(std::time::Duration::from_millis(250));
  let cache=app.path().app_cache_dir().map_err(|_|"Screenshot workspace unavailable")?;
  std::fs::create_dir_all(&cache).map_err(|_|"Cannot prepare screenshot workspace")?;
  let stamp=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|_|"Clock unavailable")?.as_nanos();
  let file=cache.join(format!("screen-{stamp}.jpg"));
  let mut command;
  #[cfg(windows)]{
   use std::os::windows::process::CommandExt;
   command=std::process::Command::new("powershell.exe");command.creation_flags(0x08000000);
   let path=file.to_string_lossy().replace('\'',"''");
   let script=format!("Add-Type -AssemblyName System.Drawing; $b=[Drawing.Bitmap]::new({w},{h});$g=[Drawing.Graphics]::FromImage($b);$g.CopyFromScreen({x},{y},0,0,$b.Size);$ratio=[Math]::Min(1,1600.0/[Math]::Max({w},{h}));$s=[Drawing.Bitmap]::new([int]({w}*$ratio),[int]({h}*$ratio));$o=[Drawing.Graphics]::FromImage($s);$o.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic;$o.DrawImage($b,0,0,$s.Width,$s.Height);$s.Save('{path}',[Drawing.Imaging.ImageFormat]::Jpeg);$o.Dispose();$s.Dispose();$g.Dispose();$b.Dispose()");
   command.args(["-NoProfile","-NonInteractive","-Command",&script]);
  }
  #[cfg(target_os="macos")]{command=std::process::Command::new("/usr/sbin/screencapture");command.args(["-x","-t","jpg","-R",&format!("{x},{y},{w},{h}")]).arg(&file);}
  #[cfg(not(any(windows,target_os="macos")))]{return Err("Screen capture is unavailable on this device".to_string());}
  for key in ["GEMINI_API_KEY","GEMINI_API_KEYS","GEMINI_KEYS","MIVUNEKO_GEMINI_KEYS","GROQ_API_KEY","MIVUNEKO_HERMES_KEY"]{command.env_remove(key);}
  let status=command.stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).status().map_err(|_|"Screen capture could not start")?;
  let image=std::fs::read(&file);let _=std::fs::remove_file(&file);
  if !status.success(){return Err("Screen capture was unavailable or permission was denied".into());}
  let bytes=image.map_err(|_|"No screenshot was captured")?;
  if bytes.len()>4_000_000{return Err("Screenshot is too large to share".into());}Ok(bytes)
 }).await.map_err(|_|"Screen capture failed");
    let _ = window.show();
    let _ = window.set_focus();
    result?
}
#[tauri::command]
pub async fn analyze_screen(
    window: tauri::Window,
    request_id: String,
    image: Vec<u8>,
    prompt: String,
    state: tauri::State<'_, gemini_client::Service>,
) -> Result<String, String> {
    if window.label() != "main" {
        return Err("Share screenshots from Conversations".into());
    }
    state.analyze_screen(request_id, image, prompt).await
}
