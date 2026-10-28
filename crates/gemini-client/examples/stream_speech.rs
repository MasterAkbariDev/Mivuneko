// Opt-in live speech check. Credentials are loaded privately; only timings are printed.
#[path = "../../../apps/desktop/src-tauri/src/project_env.rs"]
mod project_env;
use std::{
    sync::{Arc, Mutex},
    time::Instant,
};
#[tokio::main]
async fn main() {
    project_env::load();
    let args: Vec<String> = std::env::args().collect();
    if let Some(model) = args.get(1) {
        std::env::set_var("MIVUNEKO_GEMINI_TTS_MODEL", model);
    }
    let config = gemini_client::Config::from_env().expect("Configure Gemini credentials first");
    let service = gemini_client::Service::default();
    service.configure(config).expect("Speech configuration");
    let start = Instant::now();
    let data = Arc::new(Mutex::new(Vec::new()));
    let copy = data.clone();
    let first = Arc::new(Mutex::new(false));
    let seen = first.clone();
    service
        .speak_stream(
            "speech-check".into(),
            "Hi, I'm Luna. Take your time. I'm right here, and we can figure it out together."
                .into(),
            "happy".into(),
            "luna".into(),
            Arc::new(move |pcm, rate| {
                let mut first = seen.lock().unwrap();
                if !*first {
                    println!(
                        "First playable audio: {} ms; sample rate: {rate}",
                        start.elapsed().as_millis()
                    );
                    *first = true;
                }
                copy.lock().unwrap().extend(pcm);
            }),
        )
        .await
        .expect("Streaming speech generation");
    println!(
        "Speech completed: {} ms; {} PCM bytes",
        start.elapsed().as_millis(),
        data.lock().unwrap().len()
    );
}
