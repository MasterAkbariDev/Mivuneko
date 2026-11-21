use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, ChildStdin, ChildStdout, Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU32, Ordering},
        Mutex,
    },
};
use tauri::Manager;
static STORAGE_BUSY: Mutex<()> = Mutex::new(());
#[derive(Clone, Deserialize, Serialize)]
pub struct Config {
    pub python: PathBuf,
    pub model_dir: PathBuf,
}
struct Voice {
    child: Child,
    input: ChildStdin,
    output: BufReader<ChildStdout>,
}
#[derive(Default)]
pub struct Runtime {
    voice: Mutex<Option<Voice>>,
    pid: AtomicU32,
    speaking: AtomicBool,
    generation: AtomicU32,
}
pub fn terminate_owned(pid: u32) {
    if pid == 0 {
        return;
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let executable =
            PathBuf::from(std::env::var_os("SystemRoot").unwrap_or_else(|| "C:\\Windows".into()))
                .join("System32")
                .join("taskkill.exe");
        if Command::new(executable)
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(0x08000000)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok_and(|result| result.success())
        {
            return;
        }
    }
    #[cfg(windows)]
    unsafe {
        #[link(name = "kernel32")]
        extern "system" {
            fn OpenProcess(access: u32, inherit: i32, pid: u32) -> isize;
            fn TerminateProcess(handle: isize, code: u32) -> i32;
            fn CloseHandle(handle: isize) -> i32;
        }
        let h = OpenProcess(1, 0, pid);
        if h != 0 {
            TerminateProcess(h, 1);
            CloseHandle(h);
        }
    }
}
fn voice_line_with_deadline(
    reader: &mut impl BufRead,
    pid: u32,
    timeout: std::time::Duration,
) -> Result<String, String> {
    let (done, waiting) = std::sync::mpsc::channel();
    let expired = std::sync::Arc::new(AtomicBool::new(false));
    let timed_out = expired.clone();
    std::thread::spawn(move || {
        if matches!(
            waiting.recv_timeout(timeout),
            Err(std::sync::mpsc::RecvTimeoutError::Timeout)
        ) {
            timed_out.store(true, Ordering::SeqCst);
            terminate_owned(pid);
        }
    });
    let mut line = String::new();
    let read = reader.read_line(&mut line);
    let _ = done.send(());
    if expired.load(Ordering::SeqCst) {
        return Err("Local expressive voice took too long. Choose fast local voice or Gemini for quicker replies.".into());
    }
    read.map_err(|e| e.to_string())?;
    Ok(line)
}
pub fn config(app: &tauri::AppHandle) -> Result<Config, String> {
    let mut paths = vec![app
        .path()
        .app_data_dir()
        .map_err(|_| "App data unavailable")?
        .join("local-runtime.json")];
    if let Ok(cwd) = std::env::current_dir() {
        paths.push(cwd.join(".local/local-runtime.json"));
    }
    if let Ok(exe) = std::env::current_exe() {
        for p in exe.ancestors().skip(1) {
            paths.push(p.join(".local/local-runtime.json"));
        }
    }
    for path in paths {
        if let Ok(bytes) = std::fs::read(path) {
            if let Ok(c) = serde_json::from_slice::<Config>(&bytes) {
                if c.python.is_file() {
                    if let Some(primary) = paths_for_migration(app) {
                        if !primary.exists() {
                            if let Some(parent) = primary.parent() {
                                let _ = std::fs::create_dir_all(parent);
                            }
                            if let Ok(bytes) = serde_json::to_vec(&c) {
                                let _ = std::fs::write(primary, bytes);
                            }
                        }
                    }
                    return Ok(c);
                }
            }
        }
    }
    Err("Install the local runtime in Settings → Connections → Local models.".into())
}
fn paths_for_migration(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|p| p.join("local-runtime.json"))
}
pub fn helper(app: &tauri::AppHandle, name: &str, source: &str) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|_| "Runtime cache unavailable")?
        .join("local-runtime");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(name);
    if std::fs::read_to_string(&path).ok().as_deref() != Some(source) {
        std::fs::write(&path, source).map_err(|e| e.to_string())?;
    }
    Ok(path)
}
pub fn command(c: &Config) -> Command {
    let mut cmd = Command::new(&c.python);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    for k in [
        "GEMINI_API_KEY",
        "GEMINI_API_KEYS",
        "GEMINI_KEYS",
        "MIVUNEKO_GEMINI_KEYS",
        "GROQ_API_KEY",
        "MIVUNEKO_HERMES_KEY",
    ] {
        cmd.env_remove(k);
    }
    cmd
}
impl Runtime {
    pub fn fast(
        &self,
        app: &tauri::AppHandle,
        config: &desktop_core::TtsConfig,
        text: &str,
        speaker: u32,
        speed: f32,
    ) -> Result<Vec<u8>, String> {
        use base64::Engine;
        let voices = config
            .voices
            .clone()
            .unwrap_or_else(|| config.model_dir.join("voices.bin"));
        let result=self.call(app,json!({"action":"speak_fast","fastModelDir":config.model_dir,"voices":voices,"text":text,"speaker":speaker,"speed":speed}),self.generation.load(Ordering::SeqCst))?;
        base64::engine::general_purpose::STANDARD
            .decode(result["audio"].as_str().ok_or("No CPU speech returned")?)
            .map_err(|_| "Invalid CPU audio".into())
    }
    fn call(
        &self,
        app: &tauri::AppHandle,
        request: Value,
        generation: u32,
    ) -> Result<Value, String> {
        let c = config(app)?;
        let mut voice = self
            .voice
            .lock()
            .map_err(|_| "Voice runtime lock unavailable")?;
        if self.generation.load(Ordering::SeqCst) != generation {
            return Err("Voice request cancelled".into());
        }
        if voice
            .as_mut()
            .is_some_and(|v| v.child.try_wait().ok().flatten().is_some())
        {
            *voice = None;
        }
        if voice.is_none() {
            let path = helper(
                app,
                "voice_worker.py",
                include_str!("../../../../services/local-runtime/worker.py"),
            )?;
            let mut child = command(&c)
                .arg("-u")
                .arg(path)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .spawn()
                .map_err(|e| format!("Cannot start local voice: {e}"))?;
            self.pid.store(child.id(), Ordering::SeqCst);
            let input = child.stdin.take().ok_or("Voice input unavailable")?;
            let output = BufReader::new(child.stdout.take().ok_or("Voice output unavailable")?);
            *voice = Some(Voice {
                child,
                input,
                output,
            });
        }
        self.speaking.store(true, Ordering::SeqCst);
        let result = (|| {
            if self.generation.load(Ordering::SeqCst) != generation {
                terminate_owned(self.pid.swap(0, Ordering::SeqCst));
                return Err("Voice request cancelled".into());
            }
            let worker = voice.as_mut().unwrap();
            writeln!(worker.input, "{}", request).map_err(|e| e.to_string())?;
            worker.input.flush().map_err(|e| e.to_string())?;
            let line = voice_line_with_deadline(
                &mut worker.output,
                worker.child.id(),
                std::time::Duration::from_secs(240),
            )?;
            if line.len() > 24_000_000 {
                return Err("Voice audio exceeded its limit".into());
            }
            let body: Value = serde_json::from_str(&line)
                .map_err(|_| "Local voice worker stopped; please retry")?;
            if body["ok"] != true {
                return Err(body["error"]
                    .as_str()
                    .unwrap_or("Local voice failed")
                    .to_owned());
            }
            Ok(body["result"].clone())
        })();
        self.speaking.store(false, Ordering::SeqCst);
        if result.is_err() {
            if let Some(mut worker) = voice.take() {
                let _ = worker.child.kill();
                let _ = worker.child.wait();
            }
            self.pid.store(0, Ordering::SeqCst);
        }
        result
    }
    pub fn unload_voice(&self) -> Result<(), String> {
        let mut voice = self.voice.lock().map_err(|_| "Voice runtime busy")?;
        let result = (|| -> Result<(), String> {
            if let Some(worker) = voice.as_mut() {
                if worker
                    .child
                    .try_wait()
                    .map_err(|e| e.to_string())?
                    .is_some()
                {
                    return Err("Worker stopped".into());
                }
                writeln!(worker.input, "{{\"action\":\"unload\"}}").map_err(|e| e.to_string())?;
                worker.input.flush().map_err(|e| e.to_string())?;
                let mut line = String::new();
                worker
                    .output
                    .read_line(&mut line)
                    .map_err(|e| e.to_string())?;
                if line.is_empty() {
                    return Err("Worker stopped".into());
                }
            }
            Ok(())
        })();
        if result.is_err() {
            if let Some(mut worker) = voice.take() {
                let _ = worker.child.kill();
                let _ = worker.child.wait();
            }
            self.pid.store(0, Ordering::SeqCst);
        }
        Ok(())
    }
    pub fn cancel(&self) {
        self.generation.fetch_add(1, Ordering::SeqCst);
        if self.speaking.load(Ordering::SeqCst) {
            terminate_owned(self.pid.swap(0, Ordering::SeqCst));
        }
    }
}
impl Drop for Runtime {
    fn drop(&mut self) {
        terminate_owned(self.pid.swap(0, Ordering::SeqCst));
    }
}
#[tauri::command]
pub fn local_runtime_status(window: tauri::Window, app: tauri::AppHandle) -> Result<Value, String> {
    if window.label() != "main" {
        return Err("Main window only".into());
    }
    match config(&app) {
        Ok(c) => Ok(
            json!({"installed":true,"voiceReady":c.model_dir.join("config.json").is_file(),"python":c.python,"modelDir":c.model_dir}),
        ),
        Err(_) => Ok(json!({"installed":false,"voiceReady":false})),
    }
}
#[tauri::command]
pub fn cancel_local_voice(runtime: tauri::State<'_, std::sync::Arc<Runtime>>) {
    runtime.cancel();
}
#[tauri::command]
pub async fn install_local_runtime(
    window: tauri::Window,
    app: tauri::AppHandle,
    storage_root: Option<String>,
) -> Result<(), String> {
    use tauri::Emitter;
    if window.label() != "main" {
        return Err("Install from the app settings".into());
    }
    #[cfg(not(windows))]
    {
        return Err("The automatic local runtime installer currently supports Windows".into());
    }
    #[cfg(windows)]
    {
        tauri::async_runtime::spawn_blocking(move||{
        let _guard = STORAGE_BUSY.try_lock().map_err(|_| "Voice storage is busy")?;
        use std::os::windows::process::CommandExt;
        let path=helper(&app,"setup-local-runtime.ps1",include_str!("../../../../scripts/setup-local-runtime.ps1"))?;
        let data = app.path().app_data_dir().map_err(|_| "App data unavailable")?;
        let root = if let Some(value) = storage_root.filter(|v| !v.trim().is_empty()) {
            let path = PathBuf::from(value.trim());
            if !path.is_absolute() || path.parent().is_none() { return Err("Choose an absolute component folder, not a drive root".into()); }
            path
        } else if let Ok(c) = config(&app) {
            let env = c.python.parent().and_then(|p| p.parent()).ok_or("Invalid Python location")?;
            if env.parent().and_then(|p| p.parent()).is_some_and(|p| p.file_name().is_some_and(|n| n == "versions")) {
                env.parent().and_then(|p| p.parent()).and_then(|p| p.parent()).unwrap().to_path_buf()
            } else { env.parent().ok_or("Invalid runtime location")?.to_path_buf() }
        } else { data.join("local-runtime") };
        let manager=helper(&app,"voice-storage.py",include_str!("../../../../scripts/voice-storage.py"))?;
        let worker=helper(&app,"voice_worker.py",include_str!("../../../../services/local-runtime/worker.py"))?;
        let mut child=Command::new("powershell.exe").creation_flags(0x08000000).args(["-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File"]).arg(path).arg("-Root").arg(&root).arg("-ConfigPath").arg(data.join("local-runtime.json")).arg("-StorageManager").arg(manager).arg("-Worker").arg(worker).stdout(Stdio::piped()).stderr(Stdio::null()).spawn().map_err(|_|"Could not start the local runtime installer. Install Python 3.12 first.".to_string())?;
        for line in BufReader::new(child.stdout.take().ok_or("Installer output unavailable")?).lines().map_while(Result::ok){let _=app.emit("local-runtime-progress",json!({"stage":line.chars().take(200).collect::<String>()}));}
        if !child.wait().map_err(|e|e.to_string())?.success(){return Err("Local runtime installation failed. Check Internet access, disk space and Python 3.12.".into());}
        Ok(())
    }).await.map_err(|_|"Runtime installation failed")?
    }
}

#[tauri::command]
pub async fn local_voice_storage(
    window: tauri::Window,
    app: tauri::AppHandle,
    runtime: tauri::State<'_, std::sync::Arc<Runtime>>,
    action: String,
) -> Result<Value, String> {
    if window.label() != "main"
        || !["inventory", "cleanup", "remove-expressive"].contains(&action.as_str())
    {
        return Err("Manage optional voice storage from Settings".into());
    }
    let runtime = runtime.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = STORAGE_BUSY
            .try_lock()
            .map_err(|_| "Voice storage is busy")?;
        let c = config(&app)?;
        if action != "inventory" {
            runtime.generation.fetch_add(1, Ordering::SeqCst);
            let mut voice = runtime.voice.lock().map_err(|_| "Voice runtime busy")?;
            if let Some(mut worker) = voice.take() {
                terminate_owned(worker.child.id());
                let _ = worker.child.wait();
            }
            runtime.pid.store(0, Ordering::SeqCst);
        }
        storage_operation(&app, &c, &action)
    })
    .await
    .map_err(|_| "Voice storage operation stopped")?
}
fn storage_operation(app: &tauri::AppHandle, c: &Config, action: &str) -> Result<Value, String> {
    let manager = helper(
        app,
        "voice-storage.py",
        include_str!("../../../../scripts/voice-storage.py"),
    )?;
    let worker = helper(
        app,
        "voice_worker.py",
        include_str!("../../../../services/local-runtime/worker.py"),
    )?;
    let data = app
        .path()
        .app_data_dir()
        .map_err(|_| "App data unavailable")?;
    let mut child = command(c)
        .arg(manager)
        .arg(action)
        .arg("--app")
        .arg(&data)
        .arg("--config")
        .arg(data.join("local-runtime.json"))
        .arg("--worker")
        .arg(worker)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    let mut reader = BufReader::new(child.stdout.take().ok_or("Storage output unavailable")?);
    let line =
        voice_line_with_deadline(&mut reader, child.id(), std::time::Duration::from_secs(900))?;
    let status = child.wait().map_err(|e| e.to_string())?;
    let result: Value = serde_json::from_str(&line)
        .map_err(|_| "Storage verification stopped; no unverified files were removed")?;
    if !status.success() {
        return Err(result["error"]
            .as_str()
            .unwrap_or("Storage operation failed")
            .to_owned());
    }
    Ok(result)
}

pub(crate) fn cleanup_after_speech_install(app: &tauri::AppHandle) -> Result<(), String> {
    let _guard = STORAGE_BUSY
        .try_lock()
        .map_err(|_| "Runtime update is busy; clean old speech versions from Settings later")?;
    if let Ok(c) = config(app) {
        storage_operation(app, &c, "cleanup")?;
    }
    Ok(())
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn qwen_synthesize(
    window: tauri::Window,
    app: tauri::AppHandle,
    runtime: tauri::State<'_, std::sync::Arc<Runtime>>,
    text: String,
    mood: String,
    speaker: String,
    language: String,
    instruction: String,
    ollama_model: String,
) -> Result<Vec<u8>, String> {
    use base64::Engine;
    if !["main", "pet"].contains(&window.label()) || text.len() > 5000 || instruction.len() > 1600 {
        return Err("Invalid voice request".into());
    }
    let runtime = runtime.inner().clone();
    let generation = runtime.generation.load(Ordering::SeqCst);
    tauri::async_runtime::spawn_blocking(move||{
        let c=config(&app)?;
        // The 12 GB device cannot keep both large model families resident reliably.
        let _=reqwest::blocking::Client::builder().no_proxy().timeout(std::time::Duration::from_secs(20)).build().and_then(|http|http.post("http://127.0.0.1:11434/api/generate").json(&json!({"model":ollama_model,"keep_alive":0})).send());
        let result=runtime.call(&app,json!({"action":"speak","text":text,"mood":mood,"speaker":speaker,"language":language,"instruction":instruction,"modelDir":c.model_dir}),generation)?;
        base64::engine::general_purpose::STANDARD.decode(result["audio"].as_str().ok_or("No local speech returned")?).map_err(|_|"Invalid local audio".into())
    }).await.map_err(|_|"Local voice worker failed")?
}

#[cfg(test)]
mod response_deadline_tests {
    use super::*;
    #[test]
    fn complete_response_does_not_wait_for_the_deadline() {
        let mut input = std::io::Cursor::new(b"{\"ok\":true}\n".to_vec());
        assert_eq!(
            voice_line_with_deadline(&mut input, 0, std::time::Duration::from_secs(1)).unwrap(),
            "{\"ok\":true}\n"
        );
    }
    #[cfg(windows)]
    #[test]
    fn cancellation_terminates_owned_descendants_and_invalidates_pending_requests() {
        use std::os::windows::process::CommandExt;
        let mut child = Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-Command", "& powershell.exe -NoProfile -NonInteractive -Command 'Write-Output ready; Start-Sleep -Seconds 30'"])
            .creation_flags(0x08000000).stdout(Stdio::piped()).stderr(Stdio::null()).spawn().unwrap();
        let mut output = BufReader::new(child.stdout.take().unwrap());
        let mut ready = String::new();
        output.read_line(&mut ready).unwrap();
        assert_eq!(ready.trim(), "ready");
        let runtime = Runtime::default();
        runtime.pid.store(child.id(), Ordering::SeqCst);
        runtime.speaking.store(true, Ordering::SeqCst);
        let start = std::time::Instant::now();
        runtime.cancel();
        assert_eq!(runtime.generation.load(Ordering::SeqCst), 1);
        let mut line = String::new();
        assert_eq!(output.read_line(&mut line).unwrap(), 0);
        child.wait().unwrap();
        assert!(start.elapsed() < std::time::Duration::from_secs(5));
    }
    #[cfg(windows)]
    #[test]
    fn stalled_owned_response_is_terminated() {
        use std::os::windows::process::CommandExt;
        let mut child = Command::new("powershell.exe")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "Start-Sleep -Seconds 30",
            ])
            .creation_flags(0x08000000)
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        let mut input = BufReader::new(child.stdout.take().unwrap());
        let start = std::time::Instant::now();
        assert!(voice_line_with_deadline(
            &mut input,
            child.id(),
            std::time::Duration::from_millis(100)
        )
        .unwrap_err()
        .contains("took too long"));
        child.wait().unwrap();
        assert!(start.elapsed() < std::time::Duration::from_secs(5));
    }
}
