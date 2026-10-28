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
    if let (Some(expected), Ok(mut existing)) = (hash, fs::File::open(target)) {
        let size = existing.metadata().map(|m| m.len()).unwrap_or(0);
        if size > 0 && size <= limit {
            let mut digest = Sha256::new();
            let mut block = [0u8; 65536];
            loop {
                check()?;
                let n = existing
                    .read(&mut block)
                    .map_err(|_| "Cannot verify cached download")?;
                if n == 0 {
                    break;
                }
                digest.update(&block[..n]);
            }
            if format!("{:x}", digest.finalize()) == expected {
                update(size, size);
                return Ok(());
            }
        }
    }
    let temp = target.with_extension("part");
    let started = Instant::now();
    let mut failures = 0;
    loop {
        check()?;
        if started.elapsed() > Duration::from_secs(1800) {
            return Err("Download paused. Retry to continue from the saved progress.".into());
        }
        let mut offset = fs::metadata(&temp).map(|m| m.len()).unwrap_or(0);
        if offset > limit {
            let _ = fs::remove_file(&temp);
            return Err("Download exceeds its size limit".into());
        }
        let mut request = client.get(url).timeout(Duration::from_secs(600));
        if offset > 0 {
            request = request.header(reqwest::header::RANGE, format!("bytes={offset}-"));
        }
        let mut response = match request.send() {
            Ok(r) => r,
            Err(_) => {
                failures += 1;
                if failures >= 3 {
                    return Err("Connection interrupted. Retry to resume your download.".into());
                }
                continue;
            }
        };
        if response.status().as_u16() == 416 {
            let _ = fs::remove_file(&temp);
            continue;
        }
        if !response.status().is_success() {
            return Err("Download server is unavailable. Retry to continue setup.".into());
        }
        if offset > 0 && response.status().as_u16() != 206 {
            offset = 0;
        }
        if offset > 0
            && !response
                .headers()
                .get(reqwest::header::CONTENT_RANGE)
                .and_then(|h| h.to_str().ok())
                .is_some_and(|h| h.starts_with(&format!("bytes {offset}-")))
        {
            return Err("Server could not resume this download safely.".into());
        }
        let total = response.content_length().map(|n| n + offset).unwrap_or(0);
        if total > limit {
            return Err("Download exceeds its size limit".into());
        }
        let mut output = fs::OpenOptions::new()
            .write(true)
            .create(true)
            .append(offset > 0)
            .truncate(offset == 0)
            .open(&temp)
            .map_err(|_| "Cannot save download")?;
        let mut count = offset;
        let mut buffer = [0u8; 65536];
        let mut shown = Instant::now();
        let mut interrupted = false;
        update(count, total);
        loop {
            check()?;
            let n = match response.read(&mut buffer) {
                Ok(n) => n,
                Err(_) => {
                    interrupted = true;
                    break;
                }
            };
            if n == 0 {
                break;
            }
            count += n as u64;
            if count > limit {
                drop(output);
                let _ = fs::remove_file(&temp);
                return Err("Download exceeds its size limit".into());
            }
            output
                .write_all(&buffer[..n])
                .map_err(|_| "Cannot save download")?;
            if shown.elapsed() > Duration::from_millis(150) {
                update(count, total);
                shown = Instant::now();
            }
        }
        output.sync_all().map_err(|_| "Cannot save download")?;
        drop(output);
        if interrupted || (total > 0 && count != total) {
            failures = if count > offset { 0 } else { failures + 1 };
            if failures >= 3 {
                return Err("Download paused. Retry to resume from the saved progress.".into());
            }
            continue;
        }
        if count == 0 {
            return Err("Download returned no data".into());
        }
        if let Some(expected) = hash {
            let mut file = fs::File::open(&temp).map_err(|_| "Cannot verify download")?;
            let mut digest = Sha256::new();
            loop {
                check()?;
                let n = file
                    .read(&mut buffer)
                    .map_err(|_| "Cannot verify download")?;
                if n == 0 {
                    break;
                }
                digest.update(&buffer[..n]);
            }
            if format!("{:x}", digest.finalize()) != expected {
                let _ = fs::remove_file(&temp);
                return Err("Download checksum did not match. No files were installed.".into());
            }
        }
        check()?;
        fs::rename(&temp, target).map_err(|_| "Cannot finalize download")?;
        update(count, count);
        return Ok(());
    }
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
fn extract_bz2(path: &Path, folder: &Path) -> Result<(), String> {
    fs::create_dir_all(folder).map_err(|_| "Cannot prepare engine storage")?;
    let input = bzip2::read::BzDecoder::new(
        fs::File::open(path).map_err(|_| "Cannot read downloaded package")?,
    );
    let mut archive = tar::Archive::new(input);
    let mut total = 0u64;
    for entry in archive.entries().map_err(|_| "Cannot read package")? {
        check()?;
        let mut entry = entry.map_err(|_| "Package is incomplete")?;
        total = total.saturating_add(entry.size());
        if total > 2_000_000_000 {
            return Err("Package exceeds its size limit".into());
        }
        entry
            .unpack_in(folder)
            .map_err(|_| "Cannot safely unpack engine package")?;
    }
    Ok(())
}
fn install_parakeet(
    root: &Path,
    client: &reqwest::blocking::Client,
    report: impl Fn(&str, u64, u64),
) -> Result<(), String> {
    let platform = if cfg!(all(windows, target_arch = "x86_64")) {
        (
            "win-x64-shared-MT-Release",
            "a644dfe2f7944afec9a356d2557c0452380f20ffcf2f8c704653cfce37558596",
        )
    } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        (
            "osx-arm64-shared",
            "4fcc6c77c8d8d2e2f04cfdc17c6fd224c01469b78529370eb9d8e0e5ec97ac79",
        )
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        (
            "osx-x64-shared",
            "029b5ea0a4bd2f0c034a337c0043019323fd06491728d7fc712592e3b558be52",
        )
    } else {
        return Err("Automatic Parakeet setup is not available for this device yet.".into());
    };
    let folder = root.join("speech/parakeet");
    fs::create_dir_all(&folder).map_err(|_| "Cannot prepare speech storage")?;
    let server_name = if cfg!(windows) {
        "sherpa-onnx-offline-websocket-server.exe"
    } else {
        "sherpa-onnx-offline-websocket-server"
    };
    let runtime = folder.join("runtime/x");
    let models = folder.join("models/x");
    if !runtime.join(".ready").is_file() || find(&runtime, server_name, 6).is_none() {
        let archive = folder.join("runtime.tar.bz2");
        let name = format!("sherpa-onnx-v2.0.1-{}-no-tts.tar.bz2", platform.0);
        download(
            client,
            &format!("https://github.com/k2-fsa/sherpa-onnx/releases/download/v2.0.1/{name}"),
            &archive,
            Some(platform.1),
            100 * 1024 * 1024,
            |n, t| report("Downloading Parakeet engine", n, t),
        )?;
        report("Installing Parakeet engine", 0, 0);
        extract_bz2(&archive, &runtime)?;
        check()?;
        fs::write(runtime.join(".ready"), platform.0).map_err(|_| "Cannot finish engine setup")?;
    }
    let archive = folder.join("model.tar.bz2");
    let model_complete = find(&models, "encoder.int8.onnx", 6).is_some_and(|encoder| {
        ["decoder.int8.onnx", "joiner.int8.onnx", "tokens.txt"]
            .iter()
            .all(|file| encoder.parent().unwrap().join(file).is_file())
    });
    if !models.join(".ready").is_file() || !model_complete {
        download(client,"https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2",&archive,Some("157c157bc51155e03e37d2466522a3a737dd9c72bb25f36eb18912964161e1ad"),550*1024*1024,|n,t|report("Downloading Parakeet speech model",n,t))?;
        report("Installing Parakeet speech model", 0, 0);
        extract_bz2(&archive, &models)?;
        check()?;
        fs::write(models.join(".ready"), "parakeet-tdt-0.6b-v2-int8")
            .map_err(|_| "Cannot finish model setup")?;
    }
    let encoder =
        find(&models, "encoder.int8.onnx", 6).ok_or("Parakeet model installation is incomplete")?;
    for file in ["decoder.int8.onnx", "joiner.int8.onnx", "tokens.txt"] {
        if !encoder.parent().unwrap().join(file).is_file() {
            return Err("Parakeet package is incomplete. Please retry installation.".into());
        }
    }
    check()?;
    let path = root.join("voice.json");
    let mut config: serde_json::Value = fs::read(&path)
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .filter(|v: &serde_json::Value| v.is_object())
        .unwrap_or_else(|| serde_json::json!({}));
    config["sherpa"] = serde_json::json!(folder);
    let temp = root.join("voice.json.part");
    fs::write(
        &temp,
        serde_json::to_vec_pretty(&config).map_err(|_| "Cannot prepare speech settings")?,
    )
    .map_err(|_| "Cannot save speech settings")?;
    fs::rename(temp, path).map_err(|_| "Cannot activate Parakeet")?;
    report("Ready to use", 1, 1);
    Ok(())
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
    let name = if engine == "parakeet:tdt-0.6b-v2" {
        "parakeet"
    } else {
        engine
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
            .ok_or("Choose a supported speech model")?
    };
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
    if name == "parakeet" {
        return install_parakeet(&root, &client, report);
    }
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
    fn resumes_and_verifies_a_partial_download() {
        use std::net::TcpListener;
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("model.bin");
        let body = b"verified speech model";
        fs::write(target.with_extension("part"), &body[..8]).unwrap();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let worker = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let mut request = Vec::new();
            let mut byte = [0u8; 1];
            while !request.ends_with(b"\r\n\r\n") {
                socket.read_exact(&mut byte).unwrap();
                request.push(byte[0]);
            }
            assert!(String::from_utf8(request)
                .unwrap()
                .to_lowercase()
                .contains("range: bytes=8-"));
            write!(socket, "HTTP/1.1 206 Partial Content\r\nContent-Length: {}\r\nContent-Range: bytes 8-{}/{}\r\nConnection: close\r\n\r\n", body.len()-8, body.len()-1, body.len()).unwrap();
            socket.write_all(&body[8..]).unwrap();
        });
        let client = reqwest::blocking::Client::builder()
            .no_proxy()
            .build()
            .unwrap();
        let hash = format!("{:x}", Sha256::digest(body));
        download(&client, &url, &target, Some(&hash), 1024, |_, _| {}).unwrap();
        worker.join().unwrap();
        assert_eq!(fs::read(&target).unwrap(), body);
        assert!(!target.with_extension("part").exists());
        // A valid cached archive must not contact the network again.
        download(
            &client,
            "http://127.0.0.1:1",
            &target,
            Some(&hash),
            1024,
            |_, _| {},
        )
        .unwrap();
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
