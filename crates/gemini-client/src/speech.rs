use super::*;
type AudioCallback = Arc<dyn Fn(Vec<u8>, u32) + Send + Sync>;
impl Service {
    /// Deliver bounded PCM chunks as they arrive instead of waiting for a complete audio file.
    pub async fn speak_stream(
        &self,
        id: String,
        text: String,
        emotion: String,
        character: String,
        audio: AudioCallback,
    ) -> Result<(), String> {
        let transport = self.transport()?;
        if transport.config.speech_model.starts_with("gemini-2.") {
            let wav = self.speak_character(id, text, emotion, character).await?;
            let (pcm, rate) = wav_data(&wav)?;
            audio(pcm, rate);
            return Ok(());
        }
        let body = character_speech_body(&transport.config, &text, &emotion, &character)?;
        if id.is_empty() || id.len() > 100 {
            return Err("Invalid speech request".into());
        }
        let (tx, mut rx) = tokio::sync::watch::channel(false);
        {
            let mut cancelled = self
                .cancelled
                .lock()
                .map_err(|_| "Speech cancellation unavailable")?;
            if cancelled.remove(&id).is_some() {
                return Err("Cancelled".into());
            }
            let mut requests = self
                .requests
                .lock()
                .map_err(|_| "Speech requests unavailable")?;
            if requests.len() >= 8 || requests.contains_key(&id) {
                return Err("Speech is busy; try again shortly".into());
            }
            requests.insert(id.clone(), tx);
        }
        let result = tokio::select! {_=rx.changed()=>Err("Cancelled".into()),result=audio_stream(transport,body,audio)=>result};
        if let Ok(mut requests) = self.requests.lock() {
            requests.remove(&id);
        }
        result
    }
}
async fn audio_stream(
    transport: Arc<Transport>,
    body: Value,
    audio: AudioCallback,
) -> Result<(), String> {
    let lease = transport.acquire()?;
    let key = transport
        .pool
        .lock()
        .map_err(|_| "Speech credentials unavailable")?
        .slots[lease.index]
        .credential
        .key
        .clone();
    let model = &transport.config.speech_model;
    let mut response = transport
        .client
        .post(format!(
            "{}/v1beta/models/{model}:streamGenerateContent?alt=sse",
            transport.endpoint
        ))
        .header("x-goog-api-key", key)
        .json(&body)
        .send()
        .await
        .map_err(|_| "Could not connect to speech service. Check your connection or proxy.")?;
    let status = response.status().as_u16();
    if status == 429 {
        let wait = response
            .headers()
            .get("retry-after")
            .and_then(|s| s.to_str().ok())
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(60)
            .clamp(1, 86400);
        let mut pool = transport
            .pool
            .lock()
            .map_err(|_| "Speech credentials unavailable")?;
        let project = pool.slots[lease.index].credential.project.clone();
        pool.cooldowns
            .insert(project, Instant::now() + Duration::from_secs(wait));
        return Err(format!(
            "Speech quota is temporarily unavailable. Try again in {wait} seconds."
        ));
    }
    if status == 401 || status == 403 {
        transport
            .pool
            .lock()
            .map_err(|_| "Speech credentials unavailable")?
            .slots[lease.index]
            .disabled = true;
    }
    if !response.status().is_success() {
        return Err(format!(
            "Speech service returned HTTP {status}. Check speech model access and connection."
        ));
    }
    let mut decoder = sse::Decoder::default();
    let mut count = 0usize;
    let mut finished = false;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Speech connection was interrupted")?
    {
        for event in decoder.push(&chunk)? {
            audio_event(&event, &audio, &mut count, &mut finished)?;
        }
    }
    for event in decoder.finish()? {
        audio_event(&event, &audio, &mut count, &mut finished)?;
    }
    if !finished || count == 0 {
        return Err("Speech ended before completion".into());
    }
    Ok(())
}
fn audio_event(
    event: &str,
    audio: &AudioCallback,
    count: &mut usize,
    finished: &mut bool,
) -> Result<(), String> {
    if event == "[DONE]" {
        return Ok(());
    }
    let value: Value = serde_json::from_str(event).map_err(|_| "Invalid speech stream")?;
    if let Some(reason) = value
        .pointer("/candidates/0/finishReason")
        .and_then(Value::as_str)
    {
        if reason != "STOP" {
            return Err("Speech was blocked or interrupted".into());
        }
        *finished = true;
    }
    if let Some(parts) = value
        .pointer("/candidates/0/content/parts")
        .and_then(Value::as_array)
    {
        for part in parts {
            let Some(data) = part.pointer("/inlineData/data").and_then(Value::as_str) else {
                continue;
            };
            let mime = part
                .pointer("/inlineData/mimeType")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_ascii_lowercase();
            if !mime.starts_with("audio/l16") && !mime.starts_with("audio/pcm") {
                return Err("Speech service returned an unsupported streaming format".into());
            }
            let rate = mime
                .split(';')
                .find_map(|p| {
                    p.trim()
                        .strip_prefix("rate=")
                        .and_then(|s| s.parse::<u32>().ok())
                })
                .unwrap_or(24000);
            if !(8000..=48000).contains(&rate) {
                return Err("Unsupported speech sample rate".into());
            }
            let pcm = STANDARD.decode(data).map_err(|_| "Invalid speech audio")?;
            if pcm.len() % 2 != 0 {
                return Err("Incomplete speech audio frame".into());
            }
            *count = count.saturating_add(pcm.len());
            if *count > 8_000_000 {
                return Err("Speech response is too long".into());
            }
            if !pcm.is_empty() {
                audio(pcm, rate);
            }
        }
    }
    Ok(())
}
fn wav_data(wav: &[u8]) -> Result<(Vec<u8>, u32), String> {
    if wav.len() < 44 || &wav[..4] != b"RIFF" {
        return Err("Invalid speech audio file".into());
    }
    let mut at = 12;
    let mut rate = 24000;
    while at + 8 <= wav.len() {
        let size = u32::from_le_bytes(wav[at + 4..at + 8].try_into().unwrap()) as usize;
        let end = at + 8 + size;
        if end > wav.len() {
            return Err("Incomplete speech audio file".into());
        }
        if &wav[at..at + 4] == b"fmt " && size >= 16 {
            rate = u32::from_le_bytes(wav[at + 12..at + 16].try_into().unwrap());
        }
        if &wav[at..at + 4] == b"data" {
            return Ok((wav[at + 8..end].to_vec(), rate));
        }
        at = end + (size % 2);
    }
    Err("Speech file contains no audio".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pcm_chunks_arrive_before_completion() {
        let got = Arc::new(Mutex::new(Vec::new()));
        let copy = got.clone();
        let callback: AudioCallback =
            Arc::new(move |bytes, rate| copy.lock().unwrap().push((bytes, rate)));
        let mut count = 0;
        let mut finished = false;
        let data = STANDARD.encode([1, 0, 2, 0]);
        audio_event(&json!({"candidates":[{"content":{"parts":[{"inlineData":{"mimeType":"audio/L16;rate=24000","data":data}}]}}]}).to_string(),&callback,&mut count,&mut finished).unwrap();
        assert_eq!(got.lock().unwrap().len(), 1);
        assert!(!finished);
        audio_event(
            "{\"candidates\":[{\"finishReason\":\"STOP\"}]}",
            &callback,
            &mut count,
            &mut finished,
        )
        .unwrap();
        assert!(finished);
    }
    #[test]
    fn invalid_audio_is_rejected() {
        let callback: AudioCallback = Arc::new(|_, _| {});
        assert!(audio_event("{\"candidates\":[{\"content\":{\"parts\":[{\"inlineData\":{\"mimeType\":\"audio/mp3\",\"data\":\"AA==\"}}]}}]}",&callback,&mut 0,&mut false).is_err());
    }
}
