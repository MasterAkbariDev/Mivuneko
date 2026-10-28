// Dev check: transcribe WAVs through the Parakeet resident server and time each call.
// Usage: engine_smoke SHERPA_ROOT WHISPER_CLI WHISPER_MODEL WAV...
use std::path::{Path, PathBuf};
use std::time::Instant;
fn first_dir(dir: PathBuf) -> PathBuf {
    std::fs::read_dir(dir).unwrap().flatten().map(|e| e.path()).find(|p| p.is_dir()).unwrap()
}
fn main() {
    let args: Vec<String> = std::env::args().collect();
    assert!(args.len() >= 5, "Usage: engine_smoke SHERPA_ROOT WHISPER_CLI WHISPER_MODEL WAV...");
    let root = Path::new(&args[1]);
    let runtime = first_dir(root.join("runtime/x"));
    let config = desktop_core::WhisperConfig {
        binary: Path::new(&args[2]).into(),
        model: Path::new(&args[3]).into(),
        language: "en".into(),
        sherpa: Some(desktop_core::SherpaConfig {
            server: runtime.join("bin/sherpa-onnx-offline-websocket-server"),
            lib_dir: runtime.join("lib"),
            model_dir: first_dir(root.join("models/x")),
        }),
        ..Default::default()
    };
    let worker = desktop_core::VoiceWorker::default();
    for pass in 0..2 {
        for wav in &args[4..] {
            let bytes = std::fs::read(wav).unwrap();
            let t = Instant::now();
            let text = worker.transcribe(&bytes, &config, "", worker.ticket());
            println!("pass {pass} {:>6.0} ms  {:?}", t.elapsed().as_secs_f64() * 1000.0, text);
        }
    }
    worker.shutdown();
}
