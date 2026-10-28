use std::{
    path::Path,
    process::{Command, Stdio},
    sync::atomic::{AtomicU64, Ordering},
    time::{Duration, Instant},
};
#[derive(Default)]
pub struct VoiceWorker {
    generation: AtomicU64,
}
impl VoiceWorker {
    pub fn cancel(&self) {
        self.generation.fetch_add(1, Ordering::SeqCst);
    }
    pub fn ticket(&self) -> u64 {
        self.generation.load(Ordering::SeqCst)
    }
    fn run(&self, mut command: Command, timeout: Duration, generation: u64) -> Result<(), String> {
        if self.ticket() != generation {
            return Err("Voice operation was cancelled".into());
        }
        let mut child = command
            .env_remove("MIVUNEKO_GEMINI_KEYS")
            .env_remove("MIVUNEKO_PROXY")
            .env_remove("MIVUNEKO_HERMES_KEY")
            .env_remove("API_SERVER_KEY")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| "Could not start the configured local voice worker")?;
        let start = Instant::now();
        loop {
            if self.generation.load(Ordering::SeqCst) != generation || start.elapsed() > timeout {
                let _ = child.kill();
                let _ = child.wait();
                return Err("Local voice operation cancelled or timed out".into());
            }
            if let Some(status) = child.try_wait().map_err(|_| "Voice worker failed")? {
                return if status.success() {
                    Ok(())
                } else {
                    Err("Local voice worker failed; check its installation and model".into())
                };
            }
            std::thread::sleep(Duration::from_millis(40));
        }
    }
    pub fn synthesize(&self, text: &str, ticket: u64) -> Result<Vec<u8>, String> {
        if !cfg!(target_os = "macos") {
            return Err("System speech output is currently supported on macOS only".into());
        }
        if text.trim().is_empty() || text.chars().count() > 2000 {
            return Err("Speech text must contain 1–2000 characters".into());
        }
        let temp = tempfile::tempdir().map_err(|_| "Cannot create private audio workspace")?;
        let input = temp.path().join("text.txt");
        let output = temp.path().join("speech.wav");
        std::fs::write(&input, text).map_err(|_| "Cannot prepare speech")?;
        let mut command = Command::new("/usr/bin/say");
        command
            .arg("-f")
            .arg(&input)
            .arg("-o")
            .arg(&output)
            .arg("--file-format=WAVE")
            .arg("--data-format=LEI16@22050");
        self.run(command, Duration::from_secs(60), ticket)?;
        read_bounded(&output, 12 * 1024 * 1024)
    }
    pub fn transcribe(
        &self,
        wav: &[u8],
        binary: &Path,
        model: &Path,
        ticket: u64,
    ) -> Result<String, String> {
        validate_wav(wav)?;
        if !binary.is_absolute() || !binary.is_file() || !model.is_absolute() || !model.is_file() {
            return Err(
                "Configure absolute MIVUNEKO_WHISPER_BIN and MIVUNEKO_WHISPER_MODEL paths".into(),
            );
        }
        let temp = tempfile::tempdir().map_err(|_| "Cannot create private audio workspace")?;
        let input = temp.path().join("input.wav");
        let output = temp.path().join("transcript");
        std::fs::write(&input, wav).map_err(|_| "Cannot prepare recording")?;
        let mut command = Command::new(binary);
        command
            .arg("-m")
            .arg(model)
            .arg("-f")
            .arg(&input)
            .args(["-l", "auto", "-nt", "-np", "-otxt", "-of"])
            .arg(&output);
        self.run(command, Duration::from_secs(90), ticket)?;
        let bytes = read_bounded(&output.with_extension("txt"), 16000)?;
        String::from_utf8(bytes)
            .map(|s| s.trim().to_string())
            .map_err(|_| "Invalid transcript text".into())
    }
}
fn read_bounded(path: &Path, max: u64) -> Result<Vec<u8>, String> {
    if std::fs::metadata(path)
        .map_err(|_| "Voice worker produced no output")?
        .len()
        > max
    {
        return Err("Voice output exceeded its size limit".into());
    }
    std::fs::read(path).map_err(|_| "Cannot read voice output".into())
}
pub fn validate_wav(wav: &[u8]) -> Result<(), String> {
    if wav.len() < 44
        || wav.len() > 1_000_000
        || &wav[0..4] != b"RIFF"
        || &wav[8..12] != b"WAVE"
        || &wav[12..16] != b"fmt "
        || u16::from_le_bytes([wav[20], wav[21]]) != 1
        || u16::from_le_bytes([wav[22], wav[23]]) != 1
        || u32::from_le_bytes(wav[24..28].try_into().unwrap()) != 16000
        || u16::from_le_bytes([wav[34], wav[35]]) != 16
        || &wav[36..40] != b"data"
        || u32::from_le_bytes(wav[40..44].try_into().unwrap()) as usize != wav.len() - 44
    {
        return Err("Expected bounded mono 16 kHz PCM16 WAV recording".into());
    }
    Ok(())
}
pub fn save_history(path: &Path, json: &str) -> Result<(), String> {
    validate_history(json)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|_| "Cannot prepare conversation storage")?
    }
    let db =
        rusqlite::Connection::open(path).map_err(|_| "Cannot open local conversation database")?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
            .map_err(|_| "Cannot protect local history permissions")?;
    }
    db.execute_batch("PRAGMA secure_delete=ON;CREATE TABLE IF NOT EXISTS history(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL);").map_err(|_|"Cannot initialize conversation database")?;
    db.execute(
        "INSERT OR REPLACE INTO history(id,payload) VALUES(1,?1)",
        [json],
    )
    .map_err(|_| "Cannot save conversation")?;
    Ok(())
}
pub fn load_history(path: &Path) -> Result<String, String> {
    if !path.exists() {
        return Ok("[]".into());
    }
    let db = rusqlite::Connection::open(path).map_err(|_| "Cannot open conversation database")?;
    let data = db
        .query_row("SELECT payload FROM history WHERE id=1", [], |row| {
            row.get::<_, String>(0)
        })
        .unwrap_or_else(|_| "[]".into());
    validate_history(&data)?;
    Ok(data)
}
pub fn clear_history(path: &Path) -> Result<(), String> {
    if path.exists() {
        std::fs::remove_file(path).map_err(|_| "Cannot delete local conversation database")?
    }
    Ok(())
}
fn validate_history(json: &str) -> Result<(), String> {
    if json.len() > 128000 {
        return Err("Conversation is too large".into());
    }
    let value: serde_json::Value =
        serde_json::from_str(json).map_err(|_| "Invalid conversation JSON")?;
    let messages = value.as_array().ok_or("Invalid conversation list")?;
    if messages.len() > 100
        || messages.iter().any(|m| {
            ![Some("user"), Some("assistant")].contains(&m["role"].as_str())
                || !m["text"].as_str().is_some_and(|s| s.len() <= 16000)
        })
    {
        return Err("Invalid conversation messages".into());
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn history_roundtrip_and_delete() {
        let t = tempfile::tempdir().unwrap();
        let p = t.path().join("history.sqlite");
        let input = r#"[{"role":"user","text":"سلام"}]"#;
        save_history(&p, input).unwrap();
        assert_eq!(load_history(&p).unwrap(), input);
        clear_history(&p).unwrap();
        assert_eq!(load_history(&p).unwrap(), "[]");
    }
    #[test]
    fn rejects_invalid_or_unbounded_history() {
        assert!(validate_history(r#"[{"role":"system","text":"x"}]"#).is_err());
        assert!(validate_history(&"x".repeat(128001)).is_err());
    }
    #[test]
    fn rejects_non_pcm_audio() {
        assert!(validate_wav(b"bad").is_err());
        let mut bytes = vec![0; 44];
        bytes[0..4].copy_from_slice(b"RIFF");
        bytes[8..12].copy_from_slice(b"WAVE");
        assert!(validate_wav(&bytes).is_err());
    }
    #[test]
    fn accepts_valid_short_audio() {
        let mut b = vec![0; 46];
        b[0..4].copy_from_slice(b"RIFF");
        b[8..12].copy_from_slice(b"WAVE");
        b[12..16].copy_from_slice(b"fmt ");
        b[20..22].copy_from_slice(&1u16.to_le_bytes());
        b[22..24].copy_from_slice(&1u16.to_le_bytes());
        b[24..28].copy_from_slice(&16000u32.to_le_bytes());
        b[34..36].copy_from_slice(&16u16.to_le_bytes());
        b[36..40].copy_from_slice(b"data");
        b[40..44].copy_from_slice(&2u32.to_le_bytes());
        assert!(validate_wav(&b).is_ok());
    }
}
