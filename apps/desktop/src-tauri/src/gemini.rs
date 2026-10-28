use gemini_client::{Config, Message, Service, Status};
use tauri::State;
#[tauri::command]
pub async fn test_gemini_connection(
    window: tauri::Window,
    config: Config,
    proxy_only: bool,
) -> Result<Vec<gemini_client::ConnectionTest>, String> {
    if window.label() != "main" {
        return Err("Test connections in Settings".into());
    }
    gemini_client::test_connection(config, proxy_only).await
}
#[tauri::command]
pub fn configure_gemini(
    window: tauri::Window,
    config: Config,
    state: State<'_, Service>,
) -> Result<Status, String> {
    if window.label() != "main" {
        return Err("Configure credentials in Settings".into());
    }
    state.configure(config)
}
#[tauri::command]
pub fn gemini_status(state: State<'_, Service>) -> Result<Status, String> {
    state.status()
}
#[tauri::command]
pub fn clear_gemini(window: tauri::Window, state: State<'_, Service>) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Clear credentials in Settings".into());
    }
    state.clear();
    Ok(())
}
#[tauri::command]
pub fn cancel_gemini(request_id: String, state: State<'_, Service>) {
    state.cancel(&request_id);
}
#[tauri::command]
pub async fn gemini_chat(
    request_id: String,
    messages: Vec<Message>,
    mode: String,
    state: State<'_, Service>,
    broker: State<'_, std::sync::Arc<std::sync::Mutex<os_broker::Broker>>>,
) -> Result<String, String> {
    let broker = broker.inner().clone();
    let apps = tauri::async_runtime::spawn_blocking(move || {
        broker
            .lock()
            .map(|b| {
                b.list_apps()
                    .into_iter()
                    .map(|a| a.name)
                    .collect::<Vec<String>>()
            })
            .map_err(|_| "Broker unavailable".to_string())
    })
    .await
    .map_err(|_| "App discovery failed")??;
    state.chat(request_id, messages, mode, apps).await
}
#[tauri::command]
pub async fn gemini_transcribe(
    request_id: String,
    wav: Vec<u8>,
    state: State<'_, Service>,
) -> Result<String, String> {
    state.transcribe(request_id, wav).await
}
#[tauri::command]
pub async fn gemini_speak(
    request_id: String,
    text: String,
    emotion: String,
    character: Option<String>,
    state: State<'_, Service>,
) -> Result<Vec<u8>, String> {
    state
        .speak_character(
            request_id,
            text,
            emotion,
            character.unwrap_or_else(|| "luna".into()),
        )
        .await
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct VoiceAudio {
    request_id: String,
    pcm: Vec<u8>,
    sample_rate: u32,
}
#[tauri::command]
pub async fn gemini_speak_stream(
    window: tauri::Window,
    request_id: String,
    text: String,
    emotion: String,
    character: Option<String>,
    state: State<'_, Service>,
) -> Result<(), String> {
    use tauri::Emitter;
    let id = request_id.clone();
    state
        .speak_stream(
            request_id,
            text,
            emotion,
            character.unwrap_or_else(|| "luna".into()),
            std::sync::Arc::new(move |pcm, sample_rate| {
                let _ = window.emit(
                    "voice-audio",
                    VoiceAudio {
                        request_id: id.clone(),
                        pcm,
                        sample_rate,
                    },
                );
            }),
        )
        .await
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamChunk {
    request_id: String,
    delta: String,
}
fn progress(window: tauri::Window, id: String) -> std::sync::Arc<dyn Fn(String) + Send + Sync> {
    use tauri::Emitter;
    std::sync::Arc::new(move |delta| {
        let _ = window.emit(
            "provider-stream",
            StreamChunk {
                request_id: id.clone(),
                delta,
            },
        );
    })
}
#[tauri::command]
pub async fn gemini_chat_stream(
    window: tauri::Window,
    request_id: String,
    messages: Vec<Message>,
    mode: String,
    state: State<'_, Service>,
    broker: State<'_, std::sync::Arc<std::sync::Mutex<os_broker::Broker>>>,
) -> Result<String, String> {
    let broker = broker.inner().clone();
    let apps = tauri::async_runtime::spawn_blocking(move || {
        broker
            .lock()
            .map(|b| b.list_apps().into_iter().map(|a| a.name).collect())
            .map_err(|_| "Broker unavailable".to_string())
    })
    .await
    .map_err(|_| "App discovery failed")??;
    state
        .chat_stream(
            request_id.clone(),
            messages,
            mode,
            apps,
            progress(window, request_id),
        )
        .await
}
#[tauri::command]
pub fn groq_status(state: State<'_, gemini_client::groq::GroqService>) -> bool {
    state.configured()
}
#[tauri::command]
pub fn cancel_groq(request_id: String, state: State<'_, gemini_client::groq::GroqService>) {
    state.cancel(&request_id);
}
#[tauri::command]
pub async fn groq_chat(
    window: tauri::Window,
    request_id: String,
    messages: Vec<Message>,
    mode: String,
    state: State<'_, gemini_client::groq::GroqService>,
) -> Result<String, String> {
    state
        .chat(
            request_id.clone(),
            messages,
            mode,
            progress(window, request_id),
        )
        .await
}
