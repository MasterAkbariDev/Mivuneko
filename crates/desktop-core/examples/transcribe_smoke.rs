// Opt-in integration check against whisper.cpp's public JFK sample (not user audio).
use std::path::Path;
fn main() {
    let args: Vec<String> = std::env::args().collect();
    assert_eq!(
        args.len(),
        4,
        "Usage: transcribe_smoke WHISPER_CLI MODEL JFK_WAV"
    );
    let worker = desktop_core::VoiceWorker::default();
    let wav = std::fs::read(&args[3]).expect("read public sample");
    let config = desktop_core::WhisperConfig {
        binary: Path::new(&args[1]).into(),
        model: Path::new(&args[2]).into(),
        language: "en".into(),
        ..Default::default()
    };
    let text = worker
        .transcribe(&wav, &config, "", worker.ticket())
        .expect("local transcription");
    assert!(
        text.to_lowercase().contains("country"),
        "Expected the public JFK sample phrase"
    );
    println!("Real whisper.cpp transcription smoke test passed.");
}
