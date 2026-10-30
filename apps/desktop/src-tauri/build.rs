// Every app command is declared here so Tauri generates allow-* permissions for it and
// denies it to any window whose capability (capabilities/*.json) does not list it.
// tests/unit/acl.test.mjs keeps this list, the handler list and the capabilities in sync.
const COMMANDS: &[&str] = &[
    "configure_gemini",
    "gemini_status",
    "clear_gemini",
    "test_gemini_connection",
    "cancel_gemini",
    "gemini_chat",
    "gemini_chat_stream",
    "groq_chat",
    "groq_status",
    "cancel_groq",
    "gemini_transcribe",
    "gemini_speak",
    "gemini_speak_stream",
    "capture_screen",
    "analyze_screen",
    "sync_pet_displays",
    "recover_pet",
    "configure_global_shortcuts",
    "quiet_pet_position",
    "pet_cursor",
    "show_pet",
    "hide_pet",
    "foreground_fullscreen",
    "list_apps",
    "request_launch",
    "resolve_launch",
    "revoke",
    "get_launch_policy",
    "set_launch_policy",
    "quit_app",
    "get_pet_state",
    "publish_pet_state",
    "hermes_status",
    "hermes_chat",
    "synthesize_speech",
    "character_voice",
    "synthesize_phrase",
    "transcribe_audio",
    "voice_engines",
    "voice_capabilities",
    "install_voice_engine",
    "cancel_voice_install",
    "cancel_voice",
    "save_history",
    "load_history",
    "clear_history",
];
fn main() {
    // The resident Kokoro worker, run as `<app> --luna-tts ...` (see tools/luna-tts).
    cc::Build::new()
        .file("../../../tools/luna-tts/luna-tts.c")
        .include("../../../tools/luna-tts/include")
        .define("LUNA_TTS_EMBEDDED", None)
        .warnings(false)
        .compile("luna_tts");
    println!("cargo:rerun-if-changed=../../../tools/luna-tts/luna-tts.c");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("linux") {
        println!("cargo:rustc-link-lib=dl");
    }
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run tauri-build");
}
