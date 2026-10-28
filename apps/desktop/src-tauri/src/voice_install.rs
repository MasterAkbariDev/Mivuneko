use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager};
static BUSY: Mutex<()> = Mutex::new(());
static CANCEL: AtomicBool = AtomicBool::new(false);
const REVISION: &str = "5359861c739e955e79d9a303bcbc70fb988958b1";
fn check() -> Result<(), String> {
    if CANCEL.load(Ordering::Relaxed) {
        Err("Download cancelled. Your previous setup is unchanged.".into())
    } else {
        Ok(())
    }
}
fn progress(app: &tauri::AppHandle, engine: &str, stage: &str, received: u64, total: u64) {
    let _ = app.emit_to(
        "main",
        "voice-install-progress",
        serde_json::json!({"engine":engine,"stage":stage,"received":received,"total":total}),
    );
}
fn download(
    client: &reqwest::blocking::Client,
    url: &str,
    target: &Path,
    hash: Option<&str>,
    limit: u64,
    update: impl Fn(u64, u64),
) -> Result<(), String> {
    check()?;
    let mut response = client
        .get(url)
        .send()
        .map_err(|_| "Download connection failed. Check the proxy and retry.")?
        .error_for_status()
        .map_err(|_| "Download server rejected the request. Please retry later.")?;
    let total = response.content_length().unwrap_or(0);
    if total > limit {
        return Err("Download exceeds its size limit".into());
    }
    let temp = target.with_extension("part");
    let result = (|| {
        let mut output = fs::File::create(&temp).map_err(|_| "Cannot create download file")?;
        let mut digest = Sha256::new();
        let mut count = 0u64;
        let mut bytes = [0u8; 65536];
        let mut shown = Instant::now();
        loop {
            check()?;
            let size = response
                .read(&mut bytes)
                .map_err(|_| "Download interrupted. Press Download to retry.")?;
            if size == 0 {
                break;
            }
            count += size as u64;
            if count > limit {
                return Err("Download exceeds its size limit".into());
            }
            digest.update(&bytes[..size]);
            output
                .write_all(&bytes[..size])
                .map_err(|_| "Cannot save download")?;
            if shown.elapsed() > Duration::from_millis(150) {
                update(count, total);
                shown = Instant::now();
            }
        }
        output.sync_all().map_err(|_| "Cannot save download")?;
        drop(output);
        if count == 0 || (total > 0 && count != total) {
            return Err("Download is incomplete. Retry to finish setup.".into());
        }
        if let Some(expected) = hash {
            if format!("{:x}", digest.finalize()) != expected {
                return Err("Download checksum did not match. No files were installed.".into());
            }
        }
        check()?;
        fs::rename(&temp, target).map_err(|_| "Cannot finalize download")?;
        update(count, count);
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}
fn extract(archive: &Path, folder: &Path) -> Result<(), String> {
    let mut zip =
        zip::ZipArchive::new(fs::File::open(archive).map_err(|_| "Cannot open runtime archive")?)
            .map_err(|_| "Invalid runtime archive")?;
    let mut total = 0u64;
    for i in 0..zip.len() {
        check()?;
        let mut entry = zip.by_index(i).map_err(|_| "Cannot read runtime archive")?;
        let relative = entry.enclosed_name().ok_or("Invalid archive path")?;
        let target = folder.join(relative);
        total = total.saturating_add(entry.size());
        if total > 600 * 1024 * 1024 {
            return Err("Runtime archive exceeds size limit".into());
        }
        if entry.is_dir() {
            fs::create_dir_all(&target).map_err(|_| "Cannot create runtime directory")?;
        } else {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|_| "Cannot create runtime directory")?;
            }
            let mut out = fs::File::create(target).map_err(|_| "Cannot install runtime")?;
            std::io::copy(&mut entry, &mut out).map_err(|_| "Cannot extract runtime")?;
        }
    }
    Ok(())
}
fn find(folder: &Path, name: &str, depth: u8) -> Option<PathBuf> {
    if depth == 0 {
        return None;
    }
    for entry in fs::read_dir(folder).ok()?.flatten() {
        let p = entry.path();
        if p.is_file() && p.file_name()?.to_str()? == name {
            return Some(p);
        }
        if p.is_dir() {
            if let Some(found) = find(&p, name, depth - 1) {
                return Some(found);
            }
        }
    }
    None
}
fn build(command: &mut std::process::Command) -> Result<(), String> {
    use std::process::Stdio;
    for key in [
        "GROQ_API_KEY",
        "GEMINI_API_KEY",
        "GEMINI_API_KEYS",
        "GEMINI_KEYS",
        "MIVUNEKO_GEMINI_KEYS",
        "MIVUNEKO_HERMES_KEY",
    ] {
        command.env_remove(key);
    }
    let mut child=command.stdout(Stdio::null()).stderr(Stdio::null()).spawn().map_err(|_| "Install CMake and Xcode Command Line Tools, then retry. You can also use an existing whisper-cli in Advanced setup.")?;
    let start = Instant::now();
    loop {
        if check().is_err() || start.elapsed() > Duration::from_secs(900) {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Runtime build cancelled or timed out".into());
        }
        if let Some(status) = child.try_wait().map_err(|_| "Cannot check runtime build")? {
            return if status.success() {
                Ok(())
            } else {
                Err(
                    "Runtime build failed. Install CMake and Xcode Command Line Tools, then retry."
                        .into(),
                )
            };
        }
        std::thread::sleep(Duration::from_millis(200));
    }
}
pub fn install(app: &tauri::AppHandle, engine: &str) -> Result<(), String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|_| "App storage unavailable")?;
    install_into(root, engine, |stage, n, t| {
        progress(app, engine, stage, n, t)
    })
}
pub fn install_into(
    root: PathBuf,
    engine: &str,
    report: impl Fn(&str, u64, u64),
) -> Result<(), String> {
    let _guard = BUSY
        .try_lock()
        .map_err(|_| "Another model is already being installed")?;
    CANCEL.store(false, Ordering::Relaxed);
    let name = engine
        .strip_prefix("whisper:")
        .filter(|name| {
            [
                "tiny",
                "base",
                "base.en",
                "small.en-q5_1",
                "large-v3-turbo-q5_0",
            ]
            .contains(name)
        })
        .ok_or("Choose a supported Whisper model")?;
    let runtime = root.join("speech/runtime");
    let models = root.join("speech/models");
    fs::create_dir_all(&runtime)
        .and_then(|_| fs::create_dir_all(&models))
        .map_err(|_| "Cannot prepare speech storage")?;
    let mut builder = reqwest::blocking::Client::builder()
        .user_agent("Mivuneko speech setup")
        .connect_timeout(Duration::from_secs(20))
        .timeout(Duration::from_secs(600));
    if let Ok(proxy) = std::env::var("MIVUNEKO_PROXY") {
        if !proxy.is_empty() {
            builder =
                builder.proxy(reqwest::Proxy::all(proxy).map_err(|_| "Invalid download proxy")?);
        }
    }
    let client = builder.build().map_err(|_| "Cannot prepare downloads")?;
    let cli_name = if cfg!(windows) {
        "whisper-cli.exe"
    } else {
        "whisper-cli"
    };
    let mut binary = find(&runtime, cli_name, 7);
    if binary.is_none() {
        report("Downloading recognition engine", 0, 0);
        let archive = runtime.join("runtime.zip");
        if cfg!(all(windows, target_arch = "x86_64")) {
            download(&client,"https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip",&archive,Some("6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb"),30*1024*1024,|n,t|report("Downloading recognition engine",n,t))?;
            extract(&archive, &runtime)?;
        } else if cfg!(target_os = "macos") {
            // Official tagged source; build locally with Metal support using the user's toolchain.
            download(
                &client,
                "https://github.com/ggml-org/whisper.cpp/archive/refs/tags/v1.9.5.zip",
                &archive,
                None,
                60 * 1024 * 1024,
                |n, t| report("Downloading recognition engine source", n, t),
            )?;
            extract(&archive, &runtime)?;
            let source = runtime.join("whisper.cpp-1.9.5");
            let output = source.join("build");
            report(
                "Building recognition engine · first setup can take a few minutes",
                0,
                0,
            );
            build(
                std::process::Command::new("cmake")
                    .arg("-S")
                    .arg(&source)
                    .arg("-B")
                    .arg(&output)
                    .args([
                        "-DCMAKE_BUILD_TYPE=Release",
                        "-DBUILD_SHARED_LIBS=OFF",
                        "-DWHISPER_BUILD_TESTS=OFF",
                    ]),
            )?;
            build(
                std::process::Command::new("cmake")
                    .arg("--build")
                    .arg(&output)
                    .args([
                        "--config",
                        "Release",
                        "--target",
                        "whisper-cli",
                        "whisper-server",
                        "-j",
                        "4",
                    ]),
            )?;
        } else {
            return Err("Automatic engine setup supports Windows x64 and macOS. Use Advanced setup for your platform.".into());
        }
        binary = find(&runtime, cli_name, 7);
    }
    let binary = binary.ok_or("Recognition engine was not found after setup")?;
    let filename = format!("ggml-{name}.bin");
    let model = models.join(&filename);
    report("Checking official model checksum", 0, 0);
    let metadata:serde_json::Value=client.get(format!("https://huggingface.co/api/models/ggerganov/whisper.cpp/tree/{REVISION}?recursive=false")).send().and_then(|r|r.error_for_status()).map_err(|_| "Cannot read official model metadata")?.json().map_err(|_| "Invalid model metadata")?;
    let expected = metadata
        .as_array()
        .and_then(|a| a.iter().find(|v| v["path"] == filename))
        .and_then(|v| v["lfs"]["oid"].as_str())
        .filter(|s| s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit()))
        .ok_or("Official model checksum unavailable; download stopped")?;
    download(
        &client,
        &format!("https://huggingface.co/ggerganov/whisper.cpp/resolve/{REVISION}/{filename}"),
        &model,
        Some(expected),
        750 * 1024 * 1024,
        |n, t| report("Downloading speech model", n, t),
    )?;
    check()?;
    let config_path = root.join("voice.json");
    let mut config: serde_json::Value = fs::read(&config_path)
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .filter(|v: &serde_json::Value| v.is_object())
        .unwrap_or_else(|| serde_json::json!({}));
    config["binary"] = serde_json::json!(binary);
    config["model"] = serde_json::json!(model);
    config["language"] = serde_json::json!("auto");
    if let Some(server) = find(
        &runtime,
        if cfg!(windows) {
            "whisper-server.exe"
        } else {
            "whisper-server"
        },
        7,
    ) {
        config["server"] = serde_json::json!(server);
    }
    let temp = root.join("voice.json.part");
    fs::write(
        &temp,
        serde_json::to_vec_pretty(&config).map_err(|_| "Cannot prepare configuration")?,
    )
    .map_err(|_| "Cannot save voice configuration")?;
    fs::rename(temp, config_path).map_err(|_| "Cannot activate speech configuration")?;
    report("Ready to use", 1, 1);
    Ok(())
}
#[tauri::command]
pub async fn install_voice_engine(
    window: tauri::Window,
    app: tauri::AppHandle,
    engine: String,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Install speech models from app Settings".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let result = install(&app, &engine);
        if let Err(error) = &result {
            progress(&app, &engine, &format!("Setup stopped · {error}"), 0, 0);
        }
        result
    })
    .await
    .map_err(|_| "Speech installer stopped unexpectedly".to_string())?
}
#[tauri::command]
pub fn cancel_voice_install(window: tauri::Window) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Use app Settings".into());
    }
    CANCEL.store(true, Ordering::Relaxed);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn serve(body: &'static [u8]) -> (String, std::thread::JoinHandle<()>) {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/file", listener.local_addr().unwrap());
        let worker = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let mut request = [0; 4096];
            let _ = socket.read(&mut request);
            write!(
                socket,
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            )
            .unwrap();
            socket.write_all(body).unwrap();
        });
        (url, worker)
    }
    #[test]
    fn downloads_are_verified_before_activation() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("runtime.zip");
        let client = reqwest::blocking::Client::builder()
            .no_proxy()
            .build()
            .unwrap();
        let (url, worker) = serve(b"official runtime fixture");
        assert!(download(
            &client,
            &url,
            &target,
            Some(&"0".repeat(64)),
            1024,
            |_, _| {}
        )
        .is_err());
        worker.join().unwrap();
        assert!(!target.exists());
        assert!(!target.with_extension("part").exists());
        let (url, worker) = serve(b"official runtime fixture");
        let hash = format!("{:x}", Sha256::digest(b"official runtime fixture"));
        download(&client, &url, &target, Some(&hash), 1024, |_, _| {}).unwrap();
        worker.join().unwrap();
        assert_eq!(fs::read(target).unwrap(), b"official runtime fixture");
    }
    #[test]
    fn unknown_models_cannot_choose_paths() {
        let dir = tempfile::tempdir().unwrap();
        assert!(install_into(
            dir.path().join("speech"),
            "whisper:../../escape",
            |_, _, _| {}
        )
        .is_err());
        assert!(!dir.path().join("speech").exists());
    }
}
