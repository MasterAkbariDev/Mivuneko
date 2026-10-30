#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod fullscreen;
mod gemini;
mod global_keys;
mod pet_displays;
mod screen;
use os_broker::{AppInfo, Broker, LaunchPolicy, LaunchRequest, LaunchResult};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::sync::Mutex;
use tauri::{Emitter, Manager};
mod project_env;
mod voice_install;
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
            text: String::new(),
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
        "crying",
        "shy",
        "love",
        "excited",
        "teasing",
        "joking",
        "wink",
        "proud",
        "determined",
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
                "crying",
                "shy",
                "love",
                "excited",
                "teasing",
                "joking",
                "wink",
                "proud",
                "determined",
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
/// Commands that change or reveal app launching, history or policy are main-window only.
fn require_main(window: &tauri::Window) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("This action is only available in the Mivuneko window".into())
    }
}
#[tauri::command]
async fn list_apps(window: tauri::Window, state: State<'_>) -> Result<Vec<AppInfo>, String> {
    require_main(&window)?;
    let broker = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<_, String> {
        Ok(broker.lock().map_err(|_| "Broker unavailable")?.list_apps())
    })
    .await
    .map_err(|_| "App discovery worker failed")?
}
#[tauri::command]
async fn request_launch(
    window: tauri::Window,
    app_id: String,
    state: State<'_>,
) -> Result<LaunchRequest, String> {
    require_main(&window)?;
    let context = window.label().to_string();
    let broker = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = broker.lock().map_err(|_| "Broker unavailable")?;
        guard.request(&app_id, &context)
    })
    .await
    .map_err(|_| "Approval worker failed")?
}
#[tauri::command]
async fn resolve_launch(
    window: tauri::Window,
    request_id: String,
    allow: bool,
    state: State<'_>,
) -> Result<LaunchResult, String> {
    require_main(&window)?;
    let context = window.label().to_string();
    let broker = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = broker.lock().map_err(|_| "Broker unavailable")?;
        guard.resolve(&request_id, allow, &context)
    })
    .await
    .map_err(|_| "Launch worker failed")?
}
#[tauri::command]
async fn revoke(window: tauri::Window, state: State<'_>) -> Result<(), String> {
    require_main(&window)?;
    let broker = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        broker.lock().map_err(|_| "Broker unavailable")?.revoke();
        Ok(())
    })
    .await
    .map_err(|_| "Revocation worker failed")?
}
fn policy_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|p| p.join("launch-policy.json"))
        .map_err(|_| "Policy location unavailable".into())
}
/// The persisted launch policy, or None before the user's preference was migrated.
fn stored_policy(app: &tauri::AppHandle) -> Option<LaunchPolicy> {
    serde_json::from_slice(&std::fs::read(policy_path(app).ok()?).ok()?).ok()
}
#[derive(Serialize)]
struct PolicyState {
    #[serde(flatten)]
    policy: LaunchPolicy,
    stored: bool,
}
#[tauri::command]
fn get_launch_policy(
    window: tauri::Window,
    app: tauri::AppHandle,
    state: State<'_>,
) -> Result<PolicyState, String> {
    require_main(&window)?;
    let policy = state.lock().map_err(|_| "Broker unavailable")?.policy();
    Ok(PolicyState {
        policy,
        stored: stored_policy(&app).is_some(),
    })
}
#[tauri::command]
fn set_launch_policy(
    window: tauri::Window,
    app: tauri::AppHandle,
    policy: LaunchPolicy,
    state: State<'_>,
) -> Result<(), String> {
    require_main(&window)?;
    let path = policy_path(&app)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|_| "Cannot save permissions")?;
    }
    let temp = path.with_extension("json.part");
    std::fs::write(
        &temp,
        serde_json::to_vec(&policy).map_err(|e| e.to_string())?,
    )
    .map_err(|_| "Cannot save permissions")?;
    std::fs::rename(temp, &path).map_err(|_| "Cannot save permissions")?;
    state
        .lock()
        .map_err(|_| "Broker unavailable")?
        .set_policy(policy);
    Ok(())
}
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0)
}

fn agent_config() -> agent_client::Config {
    #[cfg_attr(not(target_os = "macos"), allow(unused_mut))]
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
// Character voice packs: assets/characters/<id>/voice/voice.json, embedded at build time.
// A file at <tts root>/packs/<id>.json overrides it without rebuilding the app.
// Characters without a pack keep the system voice. See docs/VOICE.md.
fn embedded_pack(character: &str) -> Option<&'static str> {
    match character {
        "luna" => Some(include_str!(
            "../../../../assets/characters/luna/voice/voice.json"
        )),
        "mochi" => Some(include_str!(
            "../../../../assets/characters/mochi/voice/voice.json"
        )),
        "haru" => Some(include_str!(
            "../../../../assets/characters/haru/voice/voice.json"
        )),
        "miku" => Some(include_str!(
            "../../../../assets/characters/miku/voice/voice.json"
        )),
        "kitsune" => Some(include_str!(
            "../../../../assets/characters/kitsune/voice/voice.json"
        )),
        "stella" => Some(include_str!(
            "../../../../assets/characters/stella/voice/voice.json"
        )),
        "teto" => Some(include_str!(
            "../../../../assets/characters/teto/voice/voice.json"
        )),
        "neru" => Some(include_str!(
            "../../../../assets/characters/neru/voice/voice.json"
        )),
        "snow" => Some(include_str!(
            "../../../../assets/characters/snow/voice/voice.json"
        )),
        "silver" => Some(include_str!(
            "../../../../assets/characters/silver/voice/voice.json"
        )),
        "azure" => Some(include_str!(
            "../../../../assets/characters/azure/voice/voice.json"
        )),
        "goth" => Some(include_str!(
            "../../../../assets/characters/goth/voice/voice.json"
        )),
        _ => None,
    }
}
fn tts_root(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    let voice = voice_json(app);
    voice["tts"]
        .as_str()
        .map(std::path::PathBuf::from)
        .or_else(|| {
            let model = voice["model"].as_str()?;
            std::path::Path::new(model)
                .parent()?
                .parent()
                .map(|p| p.join("tts"))
        })
}
fn voice_pack(app: &tauri::AppHandle, character: &str) -> Option<serde_json::Value> {
    let embedded = embedded_pack(character)?;
    let override_file = tts_root(app)
        .filter(|_| character.chars().all(|c| c.is_ascii_alphanumeric()))
        .map(|r| r.join("packs").join(format!("{character}.json")));
    override_file
        .and_then(|f| std::fs::read_to_string(f).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .or_else(|| serde_json::from_str(embedded).ok())
}
type Recipe = (usize, Vec<(usize, f32)>);
// Pack blends -> (slot, [(speaker id, weight)]): neutral in slot 40, moods in fixed slots.
fn pack_recipes(pack: &serde_json::Value) -> Vec<Recipe> {
    let parse = |v: &serde_json::Value| -> Vec<(usize, f32)> {
        v.as_array()
            .map(|a| {
                a.iter()
                    .filter_map(|e| {
                        Some((
                            desktop_core::kokoro::speaker_id(e["speaker"].as_str()?)?,
                            e["weight"].as_f64()? as f32,
                        ))
                    })
                    .collect()
            })
            .unwrap_or_default()
    };
    let mut recipes = vec![];
    let neutral = parse(&pack["neutral"]);
    if !neutral.is_empty() {
        recipes.push((desktop_core::kokoro::NEUTRAL_SLOT, neutral));
    }
    for mood in desktop_core::kokoro::MOODS {
        let blend = parse(&pack["moods"][mood]["blend"]);
        if let (false, Some(slot)) = (blend.is_empty(), desktop_core::kokoro::mood_slot(mood)) {
            recipes.push((slot, blend));
        }
    }
    recipes
}
// Blended voice table for a pack, cached by recipe hash under <tts root>/voices.
fn character_voices(
    root: &std::path::Path,
    model_dir: &std::path::Path,
    character: &str,
    recipes: &[Recipe],
) -> Result<Option<std::path::PathBuf>, String> {
    if recipes.is_empty() {
        return Ok(None);
    }
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in format!("{recipes:?}").bytes() {
        hash = (hash ^ byte as u64).wrapping_mul(0x100000001b3);
    }
    let target = root
        .join("voices")
        .join(format!("{character}-{hash:016x}.bin"));
    if !target.is_file() {
        let stock =
            std::fs::read(model_dir.join("voices.bin")).map_err(|_| "Cannot read Kokoro voices")?;
        let table = desktop_core::kokoro::blend_table(&stock, recipes)?;
        std::fs::create_dir_all(root.join("voices")).map_err(|_| "Cannot create voice cache")?;
        let temp = target.with_extension("part");
        std::fs::write(&temp, table).map_err(|_| "Cannot write the character voice")?;
        std::fs::rename(&temp, &target).map_err(|_| "Cannot save the character voice")?;
        remove_stale_voices(&root.join("voices"), character, &target);
    }
    Ok(Some(target))
}
/// Each blend is a full 28 MB voices.bin copy; keep only the current one per character.
fn remove_stale_voices(dir: &std::path::Path, character: &str, keep: &std::path::Path) {
    if character.is_empty() || !character.chars().all(|c| c.is_ascii_alphanumeric()) {
        return;
    }
    let prefix = format!("{character}-");
    for entry in std::fs::read_dir(dir).into_iter().flatten().flatten() {
        let path = entry.path();
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if path != keep && name.starts_with(&prefix) && name.ends_with(".bin") {
            // A worker may still hold the old table open (Windows); the next write retries.
            let _ = std::fs::remove_file(&path);
        }
    }
}
// The resident Kokoro worker and model sit next to the voice models (.local/tts).
fn tts_config(app: &tauri::AppHandle) -> Option<desktop_core::TtsConfig> {
    let root = tts_root(app)?;
    let model_dir = std::fs::read_dir(root.join("x-kokoro-multi-lang-v1_0"))
        .ok()?
        .flatten()
        .map(|e| e.path())
        .find(|p| p.is_dir() && p.join("model.onnx").is_file())?;
    fn search(dir: &std::path::Path, name: &str, depth: u8) -> Option<std::path::PathBuf> {
        if depth == 0 {
            return None;
        }
        for entry in std::fs::read_dir(dir).ok()?.flatten() {
            let path = entry.path();
            if path.file_name()?.to_str()? == name && path.is_file() {
                return Some(path);
            }
            if path.is_dir() {
                if let Some(found) = search(&path, name, depth - 1) {
                    return Some(found);
                }
            }
        }
        None
    }
    // Prefer a resident worker: a developer-built luna-tts, else this executable loading the
    // installed sherpa-onnx library. The per-phrase CLI reloads the model every phrase.
    let library_name = if cfg!(windows) {
        "sherpa-onnx-c-api.dll"
    } else if cfg!(target_os = "macos") {
        "libsherpa-onnx-c-api.dylib"
    } else {
        "libsherpa-onnx-c-api.so"
    };
    let (worker, library) = if root.join("luna-tts").is_file() {
        (root.join("luna-tts"), None)
    } else if let (Some(library), Ok(exe)) = (
        search(&root.join("runtime"), library_name, 6),
        std::env::current_exe(),
    ) {
        (exe, Some(library))
    } else {
        let cli = search(
            &root.join("runtime"),
            if cfg!(windows) {
                "sherpa-onnx-offline-tts.exe"
            } else {
                "sherpa-onnx-offline-tts"
            },
            6,
        )?;
        (cli, None)
    };
    worker.is_file().then_some(desktop_core::TtsConfig {
        worker,
        model_dir,
        voices: None,
        library,
    })
}
extern "C" {
    fn luna_tts_main(
        argc: std::os::raw::c_int,
        argv: *mut *mut std::os::raw::c_char,
    ) -> std::os::raw::c_int;
}
/// Serves the resident Kokoro worker protocol on stdin/stdout (tools/luna-tts/luna-tts.c).
fn run_tts_worker(args: Vec<std::ffi::OsString>) -> i32 {
    let owned: Vec<std::ffi::CString> = args
        .iter()
        .map(|a| {
            #[cfg(unix)]
            let bytes = std::os::unix::ffi::OsStrExt::as_bytes(a.as_os_str()).to_vec();
            // The worker converts UTF-8 paths to wide strings on Windows.
            #[cfg(not(unix))]
            let bytes = a.to_string_lossy().into_owned().into_bytes();
            std::ffi::CString::new(bytes).unwrap_or_default()
        })
        .collect();
    let mut argv: Vec<*mut std::os::raw::c_char> =
        owned.iter().map(|c| c.as_ptr() as *mut _).collect();
    // SAFETY: argv points at NUL-terminated strings that outlive the call.
    unsafe { luna_tts_main(argv.len() as _, argv.as_mut_ptr()) }
}
/// The voice pack for a character, or null when it uses the system voice (or the
/// Kokoro engine is not installed).
#[tauri::command]
fn character_voice(app: tauri::AppHandle, character: String) -> Option<serde_json::Value> {
    tts_config(&app)?;
    voice_pack(&app, &character)
}
/// Speaks one phrase with the character's own voice, using the voice for `mood` when
/// the pack defines one. Does not cancel other phrases; stop playback with cancel_voice.
#[tauri::command]
async fn synthesize_phrase(
    app: tauri::AppHandle,
    text: String,
    character: String,
    mood: Option<String>,
    speed: f32,
    state: tauri::State<'_, Arc<desktop_core::VoiceWorker>>,
) -> Result<Vec<u8>, String> {
    let worker = state.inner().clone();
    let ticket = worker.ticket();
    tauri::async_runtime::spawn_blocking(move || {
        let pack = voice_pack(&app, &character).ok_or("No voice pack for this character")?;
        let mut config = tts_config(&app).ok_or("Character voice engine is not installed")?;
        let root = tts_root(&app).ok_or("Voice folder unavailable")?;
        let recipes = pack_recipes(&pack);
        config.voices = character_voices(&root, &config.model_dir, &character, &recipes)?;
        let mood = mood.unwrap_or_default();
        let has = |slot: usize| recipes.iter().any(|(s, _)| *s == slot);
        // Mood voice if the pack defines one, else its neutral blend, else a stock voice.
        let speaker = desktop_core::kokoro::mood_slot(&mood)
            .filter(|s| has(*s))
            .or(has(desktop_core::kokoro::NEUTRAL_SLOT)
                .then_some(desktop_core::kokoro::NEUTRAL_SLOT))
            .or(pack["speaker"]
                .as_str()
                .and_then(desktop_core::kokoro::speaker_id))
            .unwrap_or(3) as u32;
        let wav = worker.synthesize_phrase(&config, &text, speaker, speed.clamp(0.5, 1.6))?;
        if worker.ticket() != ticket {
            return Err("Voice operation was cancelled".into());
        }
        Ok(wav)
    })
    .await
    .map_err(|_| "Speech worker failed")?
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
// Selectable speech recognition engines. Only measured numbers appear in `detail`.
struct EngineSpec {
    id: &'static str,
    label: &'static str,
    family: &'static str,
    file: &'static str,
    size_mb: u32,
    speed: &'static str,
    accuracy: &'static str,
    detail: &'static str,
    install: &'static str,
}
const ENGINES: &[EngineSpec] = &[
    EngineSpec {
        id: "parakeet:tdt-0.6b-v2",
        label: "Parakeet TDT 0.6B v2",
        family: "Parakeet · sherpa-onnx",
        file: "",
        size_mb: 503,
        speed: "Fastest",
        accuracy: "Best",
        detail: "English recognition with a resident local server. Requires the separate sherpa-onnx runtime. Download a Whisper model below for the simplest setup.",
        install: "Needs .local/sherpa (runtime + model, ~503 MB).",
    },
    EngineSpec {
        id: "whisper:large-v3-turbo-q5_0",
        label: "Whisper large-v3-turbo (q5_0)",
        family: "Whisper · whisper.cpp",
        file: "ggml-large-v3-turbo-q5_0.bin",
        size_mb: 574,
        speed: "Higher CPU use",
        accuracy: "High, multilingual",
        detail: "Multilingual recognition with stronger accuracy for accents and longer conversations. Uses more memory than Base.",
        install: "npm run setup:voice -- large-v3-turbo-q5_0",
    },
    EngineSpec {
        id: "whisper:small.en-q5_1",
        label: "Whisper small.en (q5_1)",
        family: "Whisper · whisper.cpp",
        file: "ggml-small.en-q5_1.bin",
        size_mb: 190,
        speed: "Medium",
        accuracy: "Good, English",
        detail: "A balance of English recognition quality and model size. Suitable for regular conversations on desktop CPUs.",
        install: "npm run setup:voice -- small.en-q5_1",
    },
    EngineSpec {
        id: "whisper:base.en",
        label: "Whisper base.en",
        family: "Whisper · whisper.cpp",
        file: "ggml-base.en.bin",
        size_mb: 148,
        speed: "Fast",
        accuracy: "Fair, English",
        detail: "Smaller English Whisper. Quicker than small.en but mishears short or quiet phrases more often.",
        install: "npm run setup:voice -- base.en",
    },
    EngineSpec {
        id: "whisper:base",
        label: "Whisper base (multilingual)",
        family: "Whisper · whisper.cpp",
        file: "ggml-base.bin",
        size_mb: 148,
        speed: "Fast",
        accuracy: "Fair, multilingual",
        detail: "Compact multilingual recognition. A practical starting point when you speak more than one language.",
        install: "npm run setup:voice -- base",
    },
    EngineSpec {
        id: "whisper:tiny",
        label: "Whisper tiny (multilingual)",
        family: "Whisper · whisper.cpp",
        file: "ggml-tiny.bin",
        size_mb: 78,
        speed: "Fastest Whisper",
        accuracy: "Low",
        detail: "Smallest and least accurate. Only useful for checking the pipeline on weak hardware.",
        install: "npm run setup:voice -- tiny",
    },
];
fn voice_json(app: &tauri::AppHandle) -> serde_json::Value {
    app.path()
        .app_data_dir()
        .ok()
        .and_then(|p| std::fs::read(p.join("voice.json")).ok())
        .and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok())
        .unwrap_or_default()
}
// <voice dir>/sherpa/{runtime,models}: the Parakeet install, next to the whisper models.
fn sherpa_install(
    voice: &serde_json::Value,
    models_dir: &std::path::Path,
) -> Option<desktop_core::SherpaConfig> {
    let root = voice["sherpa"]
        .as_str()
        .map(std::path::PathBuf::from)
        .or_else(|| models_dir.parent().map(|d| d.join("sherpa")))?;
    let first = |dir: std::path::PathBuf| {
        std::fs::read_dir(dir)
            .ok()?
            .flatten()
            .map(|e| e.path())
            .find(|p| p.is_dir())
    };
    let runtime = first(root.join("runtime/x"))?;
    let model_dir = first(root.join("models/x"))?;
    let server = runtime.join(if cfg!(windows) {
        "bin/sherpa-onnx-offline-websocket-server.exe"
    } else {
        "bin/sherpa-onnx-offline-websocket-server"
    });
    (server.is_file() && model_dir.join("encoder.int8.onnx").is_file()).then_some(
        desktop_core::SherpaConfig {
            server,
            lib_dir: runtime.join("lib"),
            model_dir,
        },
    )
}
// voice.json (written by setup-voice) plus MIVUNEKO_WHISPER_* overrides. `engine` is a
// registry id from Settings; "auto" or unknown ids use the configured whisper model.
fn whisper_config(
    app: &tauri::AppHandle,
    engine: Option<&str>,
) -> Result<desktop_core::WhisperConfig, String> {
    let voice_config = voice_json(app);
    let path = |env: &str, key: &str| {
        std::env::var_os(env)
            .map(std::path::PathBuf::from)
            .or_else(|| voice_config[key].as_str().map(std::path::PathBuf::from))
    };
    let binary = path("MIVUNEKO_WHISPER_BIN", "binary").unwrap_or_default();
    let mut model = path("MIVUNEKO_WHISPER_MODEL", "model").unwrap_or_default();
    let models_dir = model
        .parent()
        .map(std::path::Path::to_path_buf)
        .unwrap_or_default();
    let mut sherpa = None;
    // "auto" (or nothing chosen) prefers Parakeet when it is installed.
    if matches!(engine, None | Some("auto") | Some("")) {
        sherpa = sherpa_install(&voice_config, &models_dir);
    }
    if let Some(spec) = engine.and_then(|id| ENGINES.iter().find(|e| e.id == id)) {
        if spec.family.starts_with("Parakeet") {
            sherpa = sherpa_install(&voice_config, &models_dir);
        } else if models_dir.join(spec.file).is_file() {
            model = models_dir.join(spec.file);
        }
    }
    // Without an explicit server, use a whisper-server built next to whisper-cli.
    if sherpa.is_none() && (!binary.is_file() || !model.is_file()) {
        return Err("Speech recognition is not ready. Open Settings → Voice & input and download a speech model.".into());
    }
    let server = path("MIVUNEKO_WHISPER_SERVER", "server").or_else(|| {
        binary.parent().map(|d| {
            d.join(if cfg!(windows) {
                "whisper-server.exe"
            } else {
                "whisper-server"
            })
        })
    });
    let language = voice_config["language"]
        .as_str()
        .filter(|l| l.len() <= 8 && l.chars().all(|c| c.is_ascii_alphabetic() || c == '-'))
        .unwrap_or("en")
        .to_string();
    Ok(desktop_core::WhisperConfig {
        binary,
        model,
        server,
        vad_model: path("MIVUNEKO_WHISPER_VAD", "vadModel"),
        language,
        sherpa,
    })
}
#[tauri::command]
async fn transcribe_audio(
    app: tauri::AppHandle,
    wav: Vec<u8>,
    context: Option<String>,
    engine: Option<String>,
    state: tauri::State<'_, Arc<desktop_core::VoiceWorker>>,
) -> Result<String, String> {
    let worker = state.inner().clone();
    worker.cancel();
    let ticket = worker.ticket();
    tauri::async_runtime::spawn_blocking(move || {
        let config = whisper_config(&app, engine.as_deref())?;
        worker.transcribe(&wav, &config, context.as_deref().unwrap_or(""), ticket)
    })
    .await
    .map_err(|_| "Transcription worker failed")?
}
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct EngineInfo {
    id: &'static str,
    label: &'static str,
    family: &'static str,
    size_mb: u32,
    speed: &'static str,
    accuracy: &'static str,
    detail: &'static str,
    install: &'static str,
    installed: bool,
}
#[tauri::command]
fn voice_engines(app: tauri::AppHandle) -> Vec<EngineInfo> {
    let voice = voice_json(&app);
    let models_dir = voice["model"]
        .as_str()
        .and_then(|m| {
            std::path::Path::new(m)
                .parent()
                .map(std::path::Path::to_path_buf)
        })
        .unwrap_or_default();
    ENGINES
        .iter()
        .map(|e| EngineInfo {
            id: e.id,
            label: e.label,
            family: e.family,
            size_mb: e.size_mb,
            speed: e.speed,
            accuracy: e.accuracy,
            detail: e.detail,
            install: e.install,
            installed: if e.family.starts_with("Parakeet") {
                sherpa_install(&voice, &models_dir).is_some()
            } else {
                models_dir.join(e.file).is_file()
                    && voice["binary"]
                        .as_str()
                        .is_some_and(|b| std::path::Path::new(b).is_file())
            },
        })
        .collect()
}
#[tauri::command]
fn cancel_voice(state: tauri::State<'_, Arc<desktop_core::VoiceWorker>>) {
    state.cancel()
}
#[tauri::command]
fn voice_capabilities() -> serde_json::Value {
    serde_json::json!({"systemSpeech":cfg!(target_os="macos")})
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
fn load_history(window: tauri::Window, app: tauri::AppHandle) -> Result<String, String> {
    require_main(&window)?;
    desktop_core::load_history(&history_path(&app)?)
}
#[tauri::command]
fn clear_history(window: tauri::Window, app: tauri::AppHandle) -> Result<(), String> {
    require_main(&window)?;
    desktop_core::clear_history(&history_path(&app)?)
}
/// Stores UI latency spans locally (timings and provider/engine names only).
#[tauri::command]
fn record_spans(
    window: tauri::Window,
    app: tauri::AppHandle,
    spans: Vec<desktop_core::Span>,
) -> Result<(), String> {
    if !["main", "pet"].contains(&window.label()) {
        return Err("Unknown window".into());
    }
    let path = app
        .path()
        .app_data_dir()
        .map_err(|_| "Metrics location unavailable")?
        .join("metrics.sqlite");
    desktop_core::record_spans(&path, &spans)
}
#[cfg(any(target_os = "windows", target_os = "macos"))]
fn install_tray(app: &tauri::App) -> tauri::Result<()> {
    use tauri::{
        menu::{Menu, MenuItem},
        tray::TrayIconBuilder,
        Manager,
    };
    let pet = MenuItem::with_id(app, "show-pet", "Show pet", true, None::<&str>)?;
    let chat = MenuItem::with_id(app, "show-chat", "Show app", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide-pet", "Hide pet", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Mivuneko", true, None::<&str>)?;
    let reset = MenuItem::with_id(
        app,
        "reset-pet",
        "Reset size & find pet",
        true,
        None::<&str>,
    )?;
    let menu = Menu::with_items(app, &[&pet, &chat, &reset, &hide, &quit])?;
    let mut tray = TrayIconBuilder::new()
        .tooltip("Mivuneko")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show-pet" => {
                let _ = pet_displays::recover(app, true);
            }
            "reset-pet" => {
                let _ = app.emit_to("main", "global-action", "reset");
                let _ = pet_displays::recover(app, true);
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
    let args: Vec<std::ffi::OsString> = std::env::args_os().collect();
    if args.get(1).is_some_and(|a| a == "--luna-tts") {
        // Worker mode: never start Tauri or touch windows.
        std::process::exit(run_tts_worker(args[1..].to_vec()));
    }
    project_env::load();
    let gemini = gemini_client::Service::default();
    if let Some(config) = gemini_client::Config::from_env() {
        let _ = gemini.configure(config);
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(gemini)
        .manage(gemini_client::groq::GroqService::default())
        .setup(|_app| {
            if let Some(policy) = stored_policy(_app.handle()) {
                if let Ok(mut broker) = _app.state::<Arc<Mutex<Broker>>>().lock() {
                    broker.set_policy(policy);
                }
            }
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
            gemini::gemini_speak_stream,
            screen::capture_screen,
            screen::analyze_screen,
            pet_displays::sync_pet_displays,
            pet_displays::recover_pet,
            global_keys::configure_global_shortcuts,
            global_keys::quiet_pet_position,
            global_keys::pet_cursor,
            global_keys::show_pet,
            global_keys::hide_pet,
            fullscreen::foreground_fullscreen,
            list_apps,
            request_launch,
            resolve_launch,
            revoke,
            get_launch_policy,
            set_launch_policy,
            quit_app,
            get_pet_state,
            publish_pet_state,
            hermes_status,
            hermes_chat,
            synthesize_speech,
            character_voice,
            synthesize_phrase,
            transcribe_audio,
            voice_engines,
            voice_capabilities,
            voice_install::install_voice_engine,
            voice_install::cancel_voice_install,
            cancel_voice,
            save_history,
            load_history,
            clear_history,
            record_spans
        ])
        .build(tauri::generate_context!())
        .expect("Unable to build Mivuneko")
        .run(|app, event| {
            // Stop the resident whisper-server with the app.
            if let tauri::RunEvent::Exit = event {
                app.state::<Arc<desktop_core::VoiceWorker>>().shutdown();
            }
        });
}
#[cfg(test)]
mod voice_pack_tests {
    use super::*;
    fn luna() -> serde_json::Value {
        serde_json::from_str(embedded_pack("luna").unwrap()).unwrap()
    }
    #[test]
    fn luna_pack_has_a_neutral_voice_and_every_mood_in_its_own_slot() {
        let recipes = pack_recipes(&luna());
        let slots: Vec<usize> = recipes.iter().map(|(s, _)| *s).collect();
        assert_eq!(slots, vec![40, 41, 42, 43, 44, 45, 46, 47, 48]);
        for (_, parts) in &recipes {
            assert!(!parts.is_empty() && parts.iter().all(|(id, w)| *id < 54 && *w > 0.0));
        }
    }
    #[test]
    fn unknown_speakers_are_ignored_and_packs_without_blends_use_the_stock_table() {
        let pack = serde_json::json!({"neutral":[{"speaker":"nobody","weight":1.0}],"moods":{"sad":{"blend":[]}}});
        assert!(pack_recipes(&pack).is_empty());
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(
            character_voices(dir.path(), dir.path(), "x", &[]).unwrap(),
            None
        );
    }
    #[test]
    fn blended_tables_are_written_once_and_cached_by_recipe() {
        let dir = tempfile::tempdir().unwrap();
        let model = dir.path().join("model");
        std::fs::create_dir_all(&model).unwrap();
        let mut stock = Vec::new();
        for s in 0..54u32 {
            let one = (s as f32).to_le_bytes();
            for _ in 0..desktop_core::kokoro::FLOATS_PER_SPEAKER {
                stock.extend_from_slice(&one);
            }
        }
        std::fs::write(model.join("voices.bin"), &stock).unwrap();
        let recipes = pack_recipes(&luna());
        let first = character_voices(dir.path(), &model, "luna", &recipes)
            .unwrap()
            .unwrap();
        assert!(first.is_file());
        assert_eq!(
            std::fs::metadata(&first).unwrap().len() as usize,
            stock.len()
        );
        let again = character_voices(dir.path(), &model, "luna", &recipes)
            .unwrap()
            .unwrap();
        assert_eq!(first, again);
        let mut edited = recipes.clone();
        edited[0].1[0].1 = 0.9;
        let other = character_voices(dir.path(), &model, "luna", &edited)
            .unwrap()
            .unwrap();
        assert_ne!(first, other, "a changed blend gets its own file");
        assert!(!first.exists(), "the superseded blend is removed");
        assert!(other.is_file());
        std::fs::write(dir.path().join("voices/mochi-0000000000000000.bin"), b"x").unwrap();
        let back = character_voices(dir.path(), &model, "luna", &recipes)
            .unwrap()
            .unwrap();
        assert!(back.is_file() && !other.exists());
        assert!(
            dir.path()
                .join("voices/mochi-0000000000000000.bin")
                .is_file(),
            "other characters' blends are untouched"
        );
    }
    #[test]
    fn only_known_characters_have_embedded_packs() {
        assert!(embedded_pack("luna").is_some());
        assert!(embedded_pack("../../etc/passwd").is_none());
        assert!(embedded_pack("miku").is_some());
        assert!(embedded_pack("haru").is_some());
    }
}
