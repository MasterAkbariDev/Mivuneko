// Live diagnostic that deliberately has no Whisper fallback.
use std::path::{Path, PathBuf};
fn first(path: PathBuf) -> PathBuf {
    std::fs::read_dir(path)
        .unwrap()
        .flatten()
        .map(|e| e.path())
        .find(|p| p.is_dir())
        .unwrap()
}
fn main() {
    let args: Vec<String> = std::env::args().collect();
    assert_eq!(args.len(), 3, "Usage: parakeet_smoke PARAKEET_ROOT WAV");
    let root = Path::new(&args[1]);
    let runtime = first(root.join("runtime/x"));
    let model = first(root.join("models/x"));
    let config = desktop_core::WhisperConfig {
        sherpa: Some(desktop_core::SherpaConfig {
            server: runtime.join(if cfg!(windows) {
                "bin/sherpa-onnx-offline-websocket-server.exe"
            } else {
                "bin/sherpa-onnx-offline-websocket-server"
            }),
            lib_dir: runtime.join("lib"),
            model_dir: model,
        }),
        ..Default::default()
    };
    let worker = desktop_core::VoiceWorker::default();
    let wav = std::fs::read(&args[2]).unwrap();
    for _ in 0..2 {
        let start = std::time::Instant::now();
        let text = worker
            .transcribe(&wav, &config, "", worker.ticket())
            .expect("Parakeet transcription without fallback");
        assert!(
            text.to_lowercase().contains("country"),
            "Expected official public sample text"
        );
        println!(
            "Parakeet transcription succeeded in {} ms",
            start.elapsed().as_millis()
        );
    }
    worker.shutdown();
}
