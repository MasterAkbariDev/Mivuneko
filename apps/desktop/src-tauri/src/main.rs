#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod gemini;
use os_broker::{AppInfo, Broker, LaunchRequest, LaunchResult};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::sync::Mutex;
use tauri::{Emitter, Manager};
mod project_env;
type State<'a> = tauri::State<'a, Arc<Mutex<Broker>>>;
#[derive(Clone, Serialize, Deserialize)]
struct PetEvent {
    mood: String,
    text: String,
    at: u64,
    #[serde(default)]
    mouth: f32,
    #[serde(default)]
    emotion: Option<String>,
}
impl Default for PetEvent {
    fn default() -> Self {
        Self {
            mood: "idle".into(),
            text: "A little company, right here.".into(),
            at: 0,
            mouth: 0.0,
            emotion: None,
        }
    }
}
#[tauri::command]
fn get_pet_state(state: tauri::State<'_, Mutex<PetEvent>>) -> Result<PetEvent, String> {
    Ok(state.lock().map_err(|_| "Session unavailable")?.clone())
}
#[tauri::command]
fn publish_pet_state(
    window: tauri::Window,
    app: tauri::AppHandle,
    event: PetEvent,
    state: tauri::State<'_, Mutex<PetEvent>>,
) -> Result<(), String> {
    if !["main", "pet"].contains(&window.label()) {
        return Err("Unknown window".into());
    }
    if ![
        "idle",
        "listening",
        "thinking",
        "speaking",
        "happy",
        "curious",
        "confused",
        "concerned",
        "celebrating",
        "angry",
        "sad",
        "surprised",
        "sleeping",
        "error",
    ]
    .contains(&event.mood.as_str())
        || event.emotion.as_ref().is_some_and(|emotion| {
            ![
                "idle",
                "listening",
                "thinking",
                "speaking",
                "happy",
                "curious",
                "confused",
                "concerned",
                "celebrating",
                "angry",
                "sad",
                "surprised",
                "sleeping",
                "error",
            ]
            .contains(&emotion.as_str())
        })
        || event.text.chars().count() > 500
        || !event.mouth.is_finite()
        || !(0.0..=1.0).contains(&event.mouth)
    {
        return Err("Invalid pet event".into());
    }
    *state.lock().map_err(|_| "Session unavailable")? = event.clone();
    app.emit("pet-state", event).map_err(|e| e.to_string())
}
#[tauri::command]
async fn list_apps(state: State<'_>) -> Result<Vec<AppInfo>, String> {
    let broker = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<_, String> {
        Ok(broker.lock().map_err(|_| "Broker unavailable")?.list_apps())
    })
    .await
    .map_err(|_| "App discovery worker failed")?
}
#[tauri::command]
async fn request_launch(app_id: String, state: State<'_>) -> Result<LaunchRequest, String> {
    let broker = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = broker.lock().map_err(|_| "Broker unavailable")?;
        guard.request(&app_id)
    })
    .await
    .map_err(|_| "Approval worker failed")?
}
#[tauri::command]
async fn resolve_launch(
    request_id: String,
    allow: bool,
    state: State<'_>,
) -> Result<LaunchResult, String> {
    let broker = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = broker.lock().map_err(|_| "Broker unavailable")?;
        guard.resolve(&request_id, allow)
    })
    .await
    .map_err(|_| "Launch worker failed")?
}
#[tauri::command]
async fn revoke(state: State<'_>) -> Result<(), String> {
    let broker = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        broker.lock().map_err(|_| "Broker unavailable")?.revoke();
        Ok(())
    })
    .await
    .map_err(|_| "Revocation worker failed")?
}
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0)
}

fn agent_config() -> agent_client::Config {
    let mut key = std::env::var("MIVUNEKO_HERMES_KEY").unwrap_or_default();
    #[cfg(target_os = "macos")]
    if key.is_empty() {
        if let Ok(output) = std::process::Command::new("/usr/bin/security")
            .args(["find-generic-password", "-s", "dev.mivuneko.hermes", "-w"])
            .output()
        {
            if output.status.success() {
                key = String::from_utf8_lossy(&output.stdout).trim().into();
            }
        }
    }
    // Keep credentials entirely outside the webview and persisted preferences.
    agent_client::Config {
        base_url: std::env::var("MIVUNEKO_HERMES_URL")
            .unwrap_or_else(|_| "http://127.0.0.1:8642".into()),
        key,
    }
}
#[tauri::command]
async fn hermes_status() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        agent_config()
            .check()
            .map(|_| "Connected to a tool-free local Hermes profile".into())
    })
    .await
    .map_err(|_| "Hermes worker failed")?
}
#[tauri::command]
async fn hermes_chat(
    window: tauri::Window,
    messages: Vec<agent_client::Message>,
    mode: String,
) -> Result<String, String> {
    if !["main", "pet"].contains(&window.label()) {
        return Err("Unknown window".into());
    }
    tauri::async_runtime::spawn_blocking(move || agent_config().chat(messages, &mode))
        .await
        .map_err(|_| "Hermes worker failed")?
}
#[tauri::command]
async fn synthesize_speech(
    text: String,
    style: Option<String>,
    language: Option<String>,
    character: Option<String>,
    state: tauri::State<'_, Arc<desktop_core::VoiceWorker>>,
) -> Result<Vec<u8>, String> {
    let worker = state.inner().clone();
    worker.cancel();
    let ticket = worker.ticket();
    tauri::async_runtime::spawn_blocking(move || {
        worker.synthesize_for_character(
            &text,
            style.as_deref().unwrap_or("natural"),
            language.as_deref().unwrap_or("en"),
            character.as_deref().unwrap_or("luna"),
            ticket,
        )
    })
        .await
        .map_err(|_| "Speech worker failed")?
}
#[tauri::command]
async fn transcribe_audio(
    app: tauri::AppHandle,
    wav: Vec<u8>,
    state: tauri::State<'_, Arc<desktop_core::VoiceWorker>>,
) -> Result<String, String> {
    let worker = state.inner().clone();
    worker.cancel();
    let ticket = worker.ticket();
    tauri::async_runtime::spawn_blocking(move || {
        let voice_config = app
            .path()
            .app_data_dir()
            .ok()
            .and_then(|p| std::fs::read(p.join("voice.json")).ok())
            .and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok())
            .unwrap_or_default();
        let binary = std::env::var_os("MIVUNEKO_WHISPER_BIN")
            .or_else(|| {
                voice_config["binary"]
                    .as_str()
                    .map(std::ffi::OsString::from)
            })
            .ok_or("Set MIVUNEKO_WHISPER_BIN to your whisper-cli executable")?;
        let model = std::env::var_os("MIVUNEKO_WHISPER_MODEL")
            .or_else(|| voice_config["model"].as_str().map(std::ffi::OsString::from))
            .ok_or("Set MIVUNEKO_WHISPER_MODEL to your local whisper model")?;
        worker.transcribe(
            &wav,
            std::path::Path::new(&binary),
            std::path::Path::new(&model),
            ticket,
        )
    })
    .await
    .map_err(|_| "Transcription worker failed")?
}
#[tauri::command]
fn cancel_voice(state: tauri::State<'_, Arc<desktop_core::VoiceWorker>>) {
    state.cancel()
}
fn history_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.join("conversation.sqlite"))
        .map_err(|_| "Local history location unavailable".into())
}
#[tauri::command]
fn save_history(
    window: tauri::Window,
    app: tauri::AppHandle,
    json: String,
    consent: bool,
) -> Result<(), String> {
    if window.label() != "main" || !consent {
        return Err("Conversation storage requires opt-in from the chat window".into());
    }
    desktop_core::save_history(&history_path(&app)?, &json)
}
#[tauri::command]
fn load_history(app: tauri::AppHandle) -> Result<String, String> {
    desktop_core::load_history(&history_path(&app)?)
}
#[tauri::command]
fn clear_history(app: tauri::AppHandle) -> Result<(), String> {
    desktop_core::clear_history(&history_path(&app)?)
}
#[cfg(any(target_os = "windows", target_os = "macos"))]
fn install_tray(app: &tauri::App) -> tauri::Result<()> {
    use tauri::{
        menu::{Menu, MenuItem},
        tray::TrayIconBuilder,
        Manager,
    };
    let pet = MenuItem::with_id(app, "show-pet", "Show pet", true, None::<&str>)?;
    let chat = MenuItem::with_id(app, "show-chat", "Conversations", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide-pet", "Hide pet", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Mivuneko", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&pet, &chat, &hide, &quit])?;
    let mut tray = TrayIconBuilder::new()
        .tooltip("Mivuneko")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show-pet" => {
                if let Some(w) = app.get_webview_window("pet") {
                    let _ = w.set_ignore_cursor_events(false);
                    let _ = app.emit_to("pet", "pet-interactive", ());
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "show-chat" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "hide-pet" => {
                if let Some(w) = app.get_webview_window("pet") {
                    let _ = w.hide();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}
fn main() {
    project_env::load();
    let gemini = gemini_client::Service::default();
    if let Some(config) = gemini_client::Config::from_env() {
        let _ = gemini.configure(config);
    }
    tauri::Builder::default()
        .manage(gemini)
        .manage(gemini_client::groq::GroqService::default())
        .setup(|_app| {
            #[cfg(any(target_os = "windows", target_os = "macos"))]
            install_tray(_app)?;
            #[cfg(target_os = "macos")]
            let _ = _app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            Ok(())
        })
        .manage(Arc::new(desktop_core::VoiceWorker::default()))
        .manage(Arc::new(Mutex::new(Broker::default())))
        .manage(Mutex::new(PetEvent::default()))
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            gemini::configure_gemini,
            gemini::gemini_status,
            gemini::clear_gemini,
            gemini::test_gemini_connection,
            gemini::cancel_gemini,
            gemini::gemini_chat,
            gemini::gemini_chat_stream,
            gemini::groq_chat,
            gemini::groq_status,
            gemini::cancel_groq,
            gemini::gemini_transcribe,
            gemini::gemini_speak,
            list_apps,
            request_launch,
            resolve_launch,
            revoke,
            quit_app,
            get_pet_state,
            publish_pet_state,
            hermes_status,
            hermes_chat,
            synthesize_speech,
            transcribe_audio,
            cancel_voice,
            save_history,
            load_history,
            clear_history
        ])
        .run(tauri::generate_context!())
        .expect("Unable to run Mivuneko");
}
