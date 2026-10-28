// Runs the same verified installer used by the app, for diagnostics and CI smoke checks.
#[path = "../src/project_env.rs"]
mod project_env;
#[path = "../src/voice_install.rs"]
mod voice_install;
fn main() {
    project_env::load();
    let args: Vec<String> = std::env::args().collect();
    assert!(
        args.len() == 3,
        "Usage: install_speech APP_DATA_DIR whisper:base.en"
    );
    let mut stage = String::new();
    let last = std::sync::Mutex::new(String::new());
    let result = voice_install::install_into(
        std::path::PathBuf::from(&args[1]),
        &args[2],
        |message, received, total| {
            let mut prior = last.lock().unwrap();
            let next = if total > 0 {
                format!("{message}: {}%", received * 100 / total)
            } else {
                message.to_string()
            };
            if *prior != next {
                println!("{next}");
                *prior = next;
            }
        },
    );
    if let Err(error) = result {
        stage.push_str(&error);
        eprintln!("{stage}");
        std::process::exit(1);
    }
}
