// Dev check: speak phrases through the resident Kokoro worker and time each.
// Usage: tts_smoke WORKER KOKORO_DIR
use std::path::PathBuf;
use std::time::Instant;
fn main() {
    let args: Vec<String> = std::env::args().collect();
    assert!(args.len() == 3, "Usage: tts_smoke WORKER KOKORO_DIR");
    let config = desktop_core::TtsConfig {
        worker: PathBuf::from(&args[1]),
        model_dir: PathBuf::from(&args[2]),
        voices: None,
        library: None,
    };
    let worker = desktop_core::VoiceWorker::default();
    for text in [
        "Hi, I'm Luna!",
        "It's so nice to meet you.",
        "Hmm... let me think about that.",
    ] {
        let t = Instant::now();
        let wav = worker
            .synthesize_phrase(&config, text, 3, 0.86)
            .expect("speech");
        println!(
            "{:>6.0} ms  {} bytes  {:?}",
            t.elapsed().as_secs_f64() * 1000.0,
            wav.len(),
            text
        );
        assert_eq!(&wav[0..4], b"RIFF");
    }
    worker.shutdown();
}
