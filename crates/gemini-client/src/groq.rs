use crate::{sse, Message};
use serde_json::{json, Value};
use std::{collections::HashMap, sync::{Arc, Mutex}, time::{Duration, Instant}};

pub struct GroqService {
    key: Option<String>, model: String, proxy: String,
    requests: Mutex<HashMap<String, tokio::sync::watch::Sender<bool>>>,
    cancelled: Mutex<HashMap<String, Instant>>,
}
impl Default for GroqService {
    fn default() -> Self {
        Self {
            key: std::env::var("GROQ_API_KEY").ok().filter(|key| !key.trim().is_empty()),
            model: std::env::var("MIVUNEKO_GROQ_MODEL").unwrap_or_else(|_| "openai/gpt-oss-120b".into()),
            proxy: std::env::var("MIVUNEKO_PROXY").unwrap_or_default(),
            requests: Mutex::new(HashMap::new()), cancelled: Mutex::new(HashMap::new()),
        }
    }
}
impl GroqService {
    pub fn configured(&self) -> bool { self.key.is_some() }
    pub fn cancel(&self, id: &str) {
        if id.is_empty() || id.len() > 100 { return; }
        if let Ok(mut cancelled) = self.cancelled.lock() {
            cancelled.retain(|_, at| at.elapsed() < Duration::from_secs(120));
            if cancelled.len() < 128 { cancelled.insert(id.to_string(), Instant::now()); }
        }
        if let Ok(requests) = self.requests.lock() { if let Some(tx) = requests.get(id) { let _ = tx.send(true); } }
    }
    pub async fn chat(&self, id: String, messages: Vec<Message>, mode: String, progress: Arc<dyn Fn(String) + Send + Sync>) -> Result<String, String> {
        if id.is_empty() || id.len() > 100 || !["Chat", "Assist", "Creative", "Autonomous"].contains(&mode.as_str()) || messages.is_empty() || messages.len() > 32 || messages.iter().any(|m| !["user", "assistant"].contains(&m.role.as_str()) || m.content.len() > 16000) || messages.iter().map(|m| m.content.len()).sum::<usize>() > 48000 { return Err("Invalid Groq conversation".into()); }
        let key = self.key.as_ref().ok_or("Set GROQ_API_KEY in the project .env and restart the app")?;
        if key.len() > 4096 || !key.bytes().all(|b| b.is_ascii_graphic()) || self.model.is_empty() || self.model.len() > 100 || !self.model.bytes().all(|b| b.is_ascii_alphanumeric() || b"-_/ .".contains(&b) && b != b' ') { return Err("Invalid Groq key or model name".into()); }
        let (tx, mut rx) = tokio::sync::watch::channel(false);
        {
            let mut cancelled = self.cancelled.lock().map_err(|_| "Cancellation unavailable")?;
            if cancelled.remove(&id).is_some() { return Err("Cancelled".into()); }
            let mut requests = self.requests.lock().map_err(|_| "Requests unavailable")?;
            if requests.len() >= 8 || requests.contains_key(&id) { return Err("Too many requests or duplicate request ID".into()); }
            requests.insert(id.clone(), tx);
        }
        let result = tokio::select! {
            _ = rx.changed() => Err("Cancelled".into()),
            result = self.post(key, messages, &mode, progress) => result,
        };
        if let Ok(mut requests) = self.requests.lock() { requests.remove(&id); }
        result
    }
    async fn post(&self, key: &str, messages: Vec<Message>, mode: &str, progress: Arc<dyn Fn(String) + Send + Sync>) -> Result<String, String> {
        let mut builder = reqwest::Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none()).connect_timeout(Duration::from_secs(15)).timeout(Duration::from_secs(90));
        if !self.proxy.is_empty() {
            let url = reqwest::Url::parse(&self.proxy).map_err(|_| "Invalid proxy URL")?;
            if !["http", "https", "socks5", "socks5h"].contains(&url.scheme()) || url.host_str().is_none() || url.query().is_some() || url.fragment().is_some() || !["", "/"].contains(&url.path()) { return Err("Invalid proxy URL".into()); }
            builder = builder.proxy(reqwest::Proxy::all(&self.proxy).map_err(|_| "Invalid proxy")?);
        }
        let client = builder.build().map_err(|_| "Unable to configure Groq transport")?;
        let mut input = vec![json!({"role":"system","content":format!("You are Mivuneko, a friendly desktop companion in {mode} mode. Be concise. Do not claim to execute tools or access the desktop. App launches are handled separately by the application.")})];
        input.extend(messages.iter().map(|m| json!({"role":m.role,"content":m.content})));
        let mut response = client.post("https://api.groq.com/openai/v1/chat/completions").bearer_auth(key)
            .json(&json!({"model":self.model,"messages":input,"stream":true,"max_completion_tokens":1024}))
            .send().await.map_err(|_| "Groq connection failed. Check the network or configured proxy.")?;
        let code = response.status().as_u16();
        if !response.status().is_success() { return Err(format!("Groq returned HTTP {code}. Check credentials, model access and quota.")); }
        let mut decoder = sse::Decoder::default(); let mut text = String::new(); let mut finished = false; let mut done = false;
        while let Some(chunk) = response.chunk().await.map_err(|_| "Groq stream interrupted")? {
            for event in decoder.push(&chunk)? { consume(&event, &mut text, &mut finished, &mut done, &progress)?; }
        }
        for event in decoder.finish()? { consume(&event, &mut text, &mut finished, &mut done, &progress)?; }
        if !finished || !done || text.trim().is_empty() { return Err("Groq stream ended before completion".into()); }
        Ok(text)
    }
}
fn consume(event: &str, text: &mut String, finished: &mut bool, done: &mut bool, progress: &Arc<dyn Fn(String) + Send + Sync>) -> Result<(), String> {
    if event == "[DONE]" { *done = true; return Ok(()); }
    let value: Value = serde_json::from_str(event).map_err(|_| "Malformed Groq stream")?;
    if let Some(reason) = value.pointer("/choices/0/finish_reason").and_then(Value::as_str) { if reason != "stop" { return Err("Groq response stopped before completion".into()); } *finished = true; }
    if let Some(delta) = value.pointer("/choices/0/delta/content").and_then(Value::as_str) {
        if text.len() + delta.len() > 32000 { return Err("Groq text too large".into()); }
        text.push_str(delta); progress(delta.to_string());
    }
    Ok(())
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn handles_deltas_finish_and_done() {
        let mut text = String::new(); let mut finished = false; let mut done = false;
        let progress: Arc<dyn Fn(String)+Send+Sync> = Arc::new(|_| {});
        consume(r#"{"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}"#, &mut text, &mut finished, &mut done, &progress).unwrap();
        consume(r#"{"choices":[{"delta":{},"finish_reason":"stop"}]}"#, &mut text, &mut finished, &mut done, &progress).unwrap();
        consume("[DONE]", &mut text, &mut finished, &mut done, &progress).unwrap();
        assert_eq!(text, "Hello"); assert!(finished && done);
    }
}
