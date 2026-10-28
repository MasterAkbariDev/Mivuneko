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
    state: State<'_, Service>,
) -> Result<Vec<u8>, String> {
    state.speak(request_id, text, emotion).await
}
