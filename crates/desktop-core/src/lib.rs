use std::{
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, ChildStdout, Command, Stdio},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::{Duration, Instant},
};
/// Where whisper lives, from voice.json / environment.
#[derive(Clone, Default)]
pub struct WhisperConfig {
    pub binary: PathBuf,
    pub model: PathBuf,
    pub server: Option<PathBuf>,
    pub vad_model: Option<PathBuf>,
    pub language: String,
    /// Set when the selected engine is Parakeet (sherpa-onnx); whisper stays the fallback.
    pub sherpa: Option<SherpaConfig>,
}
/// A sherpa-onnx offline websocket server plus the NeMo transducer model it serves.
#[derive(Clone)]
pub struct SherpaConfig {
    pub server: PathBuf,
    pub lib_dir: PathBuf,
    pub model_dir: PathBuf,
}
struct Resident {
    child: Child,
    port: u16,
    model: PathBuf,
}
/// The resident Kokoro worker (tools/luna-tts) and the model folder it serves.
#[derive(Clone)]
pub struct TtsConfig {
    pub worker: PathBuf,
    pub model_dir: PathBuf,
    /// Character voice table (blended moods); the stock voices.bin when None.
    pub voices: Option<PathBuf>,
}
struct TtsResident {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    model: PathBuf,
    voices: Option<PathBuf>,
}
#[derive(Default)]
pub struct VoiceWorker {
    generation: AtomicU64,
    resident: Mutex<Option<Resident>>,
    tts: Mutex<Option<TtsResident>>,
}
impl Drop for VoiceWorker {
    fn drop(&mut self) {
        self.shutdown();
    }
}
impl VoiceWorker {
    pub fn cancel(&self) {
        self.generation.fetch_add(1, Ordering::SeqCst);
    }
    pub fn ticket(&self) -> u64 {
        self.generation.load(Ordering::SeqCst)
    }
    /// Stops the resident whisper-server (app exit).
    pub fn shutdown(&self) {
        if let Ok(mut slot) = self.resident.lock() {
            if let Some(mut r) = slot.take() {
                let _ = r.child.kill();
                let _ = r.child.wait();
            }
        }
        self.shutdown_tts();
    }
    /// Stops only the Kokoro worker.
    pub fn shutdown_tts(&self) {
        if let Ok(mut slot) = self.tts.lock() {
            if let Some(mut t) = slot.take() {
                let _ = t.child.kill();
                let _ = t.child.wait();
            }
        }
    }
    /// One phrase of character speech as a 16-bit mono WAV, from the resident Kokoro
    /// worker (started on first use; the model stays loaded between phrases).
    pub fn synthesize_phrase(
        &self,
        config: &TtsConfig,
        text: &str,
        speaker: u32,
        speed: f32,
    ) -> Result<Vec<u8>, String> {
        let text = text.trim();
        if text.is_empty() || text.len() > 1500 {
            return Err("Speech phrase must contain 1–1500 bytes".into());
        }
        if !config.worker.is_file() || !config.model_dir.is_dir() {
            return Err("Character voice engine is not installed".into());
        }
        let mut slot = self.tts.lock().map_err(|_| "Voice engine state poisoned")?;
        if let Some(t) = slot.as_mut() {
            if t.model != config.model_dir
                || t.voices != config.voices
                || !matches!(t.child.try_wait(), Ok(None))
            {
                let _ = t.child.kill();
                let _ = t.child.wait();
                *slot = None;
            }
        }
        if slot.is_none() {
            let threads = std::thread::available_parallelism()
                .map(|n| (n.get() / 2).clamp(2, 6))
                .unwrap_or(4);
            let mut command = Command::new(&config.worker);
            command.arg(&config.model_dir).arg(threads.to_string());
            if let Some(voices) = &config.voices {
                command.arg(voices);
            }
            let mut child = command
                .env_remove("MIVUNEKO_GEMINI_KEYS")
                .env_remove("GEMINI_API_KEY")
                .env_remove("GEMINI_API_KEYS")
                .env_remove("GEMINI_KEYS")
                .env_remove("GROQ_API_KEY")
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .spawn()
                .map_err(|_| "Could not start the character voice engine")?;
            let stdin = child.stdin.take().ok_or("Voice engine has no input")?;
            let mut stdout =
                BufReader::new(child.stdout.take().ok_or("Voice engine has no output")?);
            let mut line = String::new();
            // The model takes several seconds to load; READY arrives when it is usable.
            if stdout.read_line(&mut line).is_err() || !line.starts_with("READY") {
                let _ = child.kill();
                let _ = child.wait();
                return Err("Character voice engine failed to load".into());
            }
            *slot = Some(TtsResident {
                child,
                stdin,
                stdout,
                model: config.model_dir.clone(),
                voices: config.voices.clone(),
            });
        }
        let t = slot.as_mut().ok_or("Voice engine unavailable")?;
        let request = format!("GEN {speaker} {speed:.3} {}\n", text.len());
        let io = (|| -> Result<Vec<u8>, String> {
            t.stdin
                .write_all(request.as_bytes())
                .map_err(|_| "Voice engine closed")?;
            t.stdin
                .write_all(text.as_bytes())
                .map_err(|_| "Voice engine closed")?;
            t.stdin.flush().map_err(|_| "Voice engine closed")?;
            let mut line = String::new();
            t.stdout
                .read_line(&mut line)
                .map_err(|_| "Voice engine closed")?;
            let size: usize = line
                .strip_prefix("OK ")
                .and_then(|n| n.trim().parse().ok())
                .ok_or("Voice engine could not speak that")?;
            if !(44..=24 * 1024 * 1024).contains(&size) {
                return Err("Voice engine returned an invalid size".into());
            }
            let mut wav = vec![0u8; size];
            t.stdout
                .read_exact(&mut wav)
                .map_err(|_| "Voice engine closed")?;
            Ok(wav)
        })();
        if io.is_err() {
            // Out of sync or dead: drop it so the next phrase starts a clean worker.
            if let Some(mut dead) = slot.take() {
                let _ = dead.child.kill();
                let _ = dead.child.wait();
            }
        }
        io
    }
    /// "server" when a resident whisper-server will be used, otherwise "cli".
    pub fn mode(config: &WhisperConfig) -> &'static str {
        if config.server.as_ref().is_some_and(|s| s.is_file()) {
            "server"
        } else {
            "cli"
        }
    }
    fn free_port() -> Result<u16, String> {
        std::net::TcpListener::bind(("127.0.0.1", 0))
            .and_then(|l| l.local_addr())
            .map(|a| a.port())
            .map_err(|_| "No free local port for the speech server".into())
    }
    // Returns the port of a live server for this model, starting one if needed.
    fn ensure_server(&self, config: &WhisperConfig, ticket: u64) -> Result<u16, String> {
        let server = config
            .server
            .as_ref()
            .filter(|s| s.is_absolute() && s.is_file())
            .ok_or("No whisper-server configured")?;
        let mut slot = self
            .resident
            .lock()
            .map_err(|_| "Speech server state poisoned")?;
        if let Some(r) = slot.as_mut() {
            if r.model == config.model && matches!(r.child.try_wait(), Ok(None)) {
                return Ok(r.port);
            }
            let _ = r.child.kill();
            let _ = r.child.wait();
            *slot = None;
        }
        let port = Self::free_port()?;
        let threads = std::thread::available_parallelism()
            .map(|n| (n.get() / 2).clamp(2, 8))
            .unwrap_or(4);
        let mut command = Command::new(server);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
        command.arg("-ng");
        command
            .args(["--host", "127.0.0.1", "--port"])
            .arg(port.to_string())
            .arg("-m")
            .arg(&config.model)
            .args(["-l", &config.language, "-bs", "5", "-t"])
            .arg(threads.to_string());
        if let Some(vad) = config.vad_model.as_ref().filter(|v| v.is_file()) {
            command.arg("--vad").arg("-vm").arg(vad);
        }
        let mut child = command
            .env_remove("MIVUNEKO_GEMINI_KEYS")
            .env_remove("GEMINI_API_KEY")
            .env_remove("GEMINI_API_KEYS")
            .env_remove("GEMINI_KEYS")
            .env_remove("GROQ_API_KEY")
            .env_remove("MIVUNEKO_PROXY")
            .env_remove("MIVUNEKO_HERMES_KEY")
            .env_remove("API_SERVER_KEY")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| "Could not start whisper-server")?;
        // Wait for the model to load and the port to accept connections.
        let start = Instant::now();
        loop {
            if self.ticket() != ticket {
                let _ = child.kill();
                let _ = child.wait();
                return Err("Voice operation was cancelled".into());
            }
            if !matches!(child.try_wait(), Ok(None)) {
                return Err("whisper-server exited during startup".into());
            }
            if std::net::TcpStream::connect_timeout(
                &([127, 0, 0, 1], port).into(),
                Duration::from_millis(200),
            )
            .is_ok()
            {
                break;
            }
            if start.elapsed() > Duration::from_secs(60) {
                let _ = child.kill();
                let _ = child.wait();
                return Err("whisper-server did not become ready".into());
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        *slot = Some(Resident {
            child,
            port,
            model: config.model.clone(),
        });
        Ok(port)
    }
    fn ensure_sherpa(&self, sherpa: &SherpaConfig, ticket: u64) -> Result<u16, String> {
        if !sherpa.server.is_file() || !sherpa.model_dir.is_dir() {
            return Err("Parakeet is not installed".into());
        }
        let mut slot = self
            .resident
            .lock()
            .map_err(|_| "Speech server state poisoned")?;
        if let Some(r) = slot.as_mut() {
            if r.model == sherpa.model_dir && matches!(r.child.try_wait(), Ok(None)) {
                return Ok(r.port);
            }
            let _ = r.child.kill();
            let _ = r.child.wait();
            *slot = None;
        }
        let port = Self::free_port()?;
        let m = &sherpa.model_dir;
        let mut command = Command::new(&sherpa.server);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let mut child = command
            .env("DYLD_LIBRARY_PATH", &sherpa.lib_dir)
            .env_remove("MIVUNEKO_GEMINI_KEYS")
            .env_remove("GEMINI_API_KEY")
            .env_remove("GEMINI_API_KEYS")
            .env_remove("GEMINI_KEYS")
            .env_remove("GROQ_API_KEY")
            .arg(format!("--port={port}"))
            .arg("--num-work-threads=2")
            .arg("--max-batch-size=1")
            .arg(format!("--tokens={}", m.join("tokens.txt").display()))
            .arg(format!(
                "--encoder={}",
                m.join("encoder.int8.onnx").display()
            ))
            .arg(format!(
                "--decoder={}",
                m.join("decoder.int8.onnx").display()
            ))
            .arg(format!("--joiner={}", m.join("joiner.int8.onnx").display()))
            .arg("--model-type=nemo_transducer")
            .arg(if cfg!(windows) {
                "--log-file=NUL"
            } else {
                "--log-file=/dev/null"
            })
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| "Could not start the Parakeet server")?;
        let start = Instant::now();
        loop {
            if self.ticket() != ticket {
                let _ = child.kill();
                let _ = child.wait();
                return Err("Voice operation was cancelled".into());
            }
            if !matches!(child.try_wait(), Ok(None)) {
                return Err("Parakeet server exited during startup".into());
            }
            if std::net::TcpStream::connect_timeout(
                &([127, 0, 0, 1], port).into(),
                Duration::from_millis(200),
            )
            .is_ok()
            {
                break;
            }
            if start.elapsed() > Duration::from_secs(90) {
                let _ = child.kill();
                let _ = child.wait();
                return Err("Parakeet server did not become ready".into());
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        *slot = Some(Resident {
            child,
            port,
            model: sherpa.model_dir.clone(),
        });
        Ok(port)
    }
    // sherpa-onnx offline websocket protocol: int32 LE sample rate, int32 LE byte
    // length, then float32 samples; the reply is a JSON text message.
    fn transcribe_sherpa(
        &self,
        wav: &[u8],
        sherpa: &SherpaConfig,
        ticket: u64,
    ) -> Result<String, String> {
        let port = self.ensure_sherpa(sherpa, ticket)?;
        let samples: Vec<u8> = wav[44..]
            .as_chunks::<2>()
            .0
            .iter()
            .flat_map(|b| (i16::from_le_bytes([b[0], b[1]]) as f32 / 32768.0).to_le_bytes())
            .collect();
        let mut message = Vec::with_capacity(8 + samples.len());
        message.extend_from_slice(&16000i32.to_le_bytes());
        message.extend_from_slice(&(samples.len() as i32).to_le_bytes());
        message.extend_from_slice(&samples);
        let stream = std::net::TcpStream::connect(("127.0.0.1", port))
            .map_err(|_| "Cannot reach the Parakeet server")?;
        let _ = stream.set_read_timeout(Some(Duration::from_secs(60)));
        let _ = stream.set_write_timeout(Some(Duration::from_secs(15)));
        let (mut socket, _) = tungstenite::client(format!("ws://127.0.0.1:{port}"), stream)
            .map_err(|_| "Parakeet websocket handshake failed")?;
        socket
            .send(tungstenite::Message::Binary(message))
            .map_err(|_| "Could not send audio to Parakeet")?;
        let reply = loop {
            match socket.read().map_err(|_| "Parakeet did not answer")? {
                tungstenite::Message::Text(t) => break t,
                tungstenite::Message::Close(_) => {
                    return Err("Parakeet closed the connection".into())
                }
                _ => {}
            }
        };
        let _ = socket.send(tungstenite::Message::Text("Done".into()));
        let _ = socket.close(None);
        if self.ticket() != ticket {
            return Err("Voice operation was cancelled".into());
        }
        Ok(serde_json::from_str::<serde_json::Value>(&reply)
            .ok()
            .and_then(|v| v["text"].as_str().map(|t| t.trim().to_string()))
            .unwrap_or_else(|| reply.trim().to_string()))
    }
    fn transcribe_server(
        &self,
        wav: &[u8],
        config: &WhisperConfig,
        prompt: &str,
        ticket: u64,
    ) -> Result<String, String> {
        let port = self.ensure_server(config, ticket)?;
        let form = reqwest::blocking::multipart::Form::new()
            .part(
                "file",
                reqwest::blocking::multipart::Part::bytes(wav.to_vec())
                    .file_name("audio.wav")
                    .mime_str("audio/wav")
                    .map_err(|_| "Bad audio part")?,
            )
            .text("response_format", "json")
            .text("temperature", "0.0")
            .text("language", config.language.clone())
            .text("prompt", prompt.to_string());
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(90))
            .no_proxy()
            .build()
            .map_err(|_| "Cannot create speech client")?;
        let body: serde_json::Value = client
            .post(format!("http://127.0.0.1:{port}/inference"))
            .multipart(form)
            .send()
            .and_then(|r| r.error_for_status())
            .and_then(|r| r.json())
            .map_err(|_| "whisper-server request failed")?;
        if self.ticket() != ticket {
            return Err("Voice operation was cancelled".into());
        }
        Ok(body["text"].as_str().unwrap_or("").trim().to_string())
    }
    fn run(&self, mut command: Command, timeout: Duration, generation: u64) -> Result<(), String> {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        if self.ticket() != generation {
            return Err("Voice operation was cancelled".into());
        }
        let mut child = command
            .env_remove("MIVUNEKO_GEMINI_KEYS")
            .env_remove("GEMINI_API_KEY")
            .env_remove("GEMINI_API_KEYS")
            .env_remove("GEMINI_KEYS")
            .env_remove("GROQ_API_KEY")
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
        self.synthesize_with_voice(text, "natural", "en", ticket)
    }
    pub fn synthesize_with_voice(
        &self,
        text: &str,
        style: &str,
        language: &str,
        ticket: u64,
    ) -> Result<Vec<u8>, String> {
        self.synthesize_for_character(text, style, language, "luna", ticket)
    }
    pub fn synthesize_for_character(
        &self,
        text: &str,
        style: &str,
        language: &str,
        character: &str,
        ticket: u64,
    ) -> Result<Vec<u8>, String> {
        if !cfg!(target_os = "macos") {
            return Err("System speech output is currently supported on macOS only".into());
        }
        if text.trim().is_empty() || text.chars().count() > 2000 {
            return Err("Speech text must contain 1–2000 characters".into());
        }
        let character_voice = match character {
            "luna" => "Samantha",
            "miku" => "Sandy (English (US))",
            "kitsune" => "Flo (English (US))",
            "stella" => "Shelley (English (US))",
            "teto" => "Karen",
            "neru" => "Moira",
            "snow" => "Tessa",
            "silver" => "Flo (English (UK))",
            "azure" => "Sandy (English (UK))",
            "goth" => "Shelley (English (UK))",
            _ => "Samantha",
        };
        let (natural_rate, bright_rate) = match character {
            "miku" => ("178", "203"),
            "kitsune" => ("184", "209"),
            "stella" => ("190", "215"),
            "teto" => ("196", "221"),
            "neru" => ("172", "197"),
            "snow" => ("158", "183"),
            "silver" => ("162", "187"),
            "azure" => ("180", "205"),
            "goth" => ("154", "179"),
            _ => ("170", "195"),
        };
        let (voice, rate) = match (style, language) {
            ("natural", _) => (character_voice, natural_rate),
            ("bright", _) => (character_voice, bright_rate),
            ("multilingual", "en") => ("Samantha", "170"),
            ("multilingual", "ja") => ("Kyoko", "170"),
            ("multilingual", "fr") => ("Amélie", "170"),
            ("multilingual", "es") => ("Mónica", "170"),
            ("multilingual", "de") => ("Anna", "170"),
            _ => return Err("Invalid local voice style or language".into()),
        };
        let temp = tempfile::tempdir().map_err(|_| "Cannot create private audio workspace")?;
        let input = temp.path().join("text.txt");
        let output = temp.path().join("speech.wav");
        std::fs::write(&input, text).map_err(|_| "Cannot prepare speech")?;
        let mut command = Command::new("/usr/bin/say");
        command
            .arg("-v")
            .arg(voice)
            .arg("-r")
            .arg(rate)
            .arg("-f")
            .arg(&input)
            .arg("-o")
            .arg(&output)
            .arg("--file-format=WAVE")
            .arg("--data-format=LEI16@22050");
        self.run(command, Duration::from_secs(60), ticket)?;
        read_bounded(&output, 12 * 1024 * 1024)
    }
    /// Transcribes 16 kHz mono WAV. Uses the resident whisper-server when configured and
    /// falls back to a one-shot whisper-cli run. `context` (last assistant message) biases
    /// whisper towards names and topics in the conversation.
    pub fn transcribe(
        &self,
        wav: &[u8],
        config: &WhisperConfig,
        context: &str,
        ticket: u64,
    ) -> Result<String, String> {
        validate_wav(wav)?;
        // Debug aid: MIVUNEKO_DEBUG_AUDIO=<dir> keeps what whisper was given.
        if let Some(dir) = std::env::var_os("MIVUNEKO_DEBUG_AUDIO") {
            let stamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0);
            let _ = std::fs::create_dir_all(&dir);
            let _ = std::fs::write(Path::new(&dir).join(format!("utterance-{stamp}.wav")), wav);
        }
        let (binary, model) = (&config.binary, &config.model);
        let tail: String = context
            .chars()
            .rev()
            .take(200)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect();
        let prompt = format!("Mivuneko, Luna. {}", tail.replace('\n', " ").trim());
        if let Some(sherpa) = &config.sherpa {
            match self.transcribe_sherpa(wav, sherpa, ticket) {
                Ok(text) => return Ok(text),
                Err(e) if self.ticket() != ticket => return Err(e),
                // Parakeet unavailable: free it and fall back to the configured whisper model.
                Err(error) => {
                    self.shutdown();
                    if !binary.is_file() || !model.is_file() {
                        return Err(format!("Parakeet could not transcribe: {error}. Retry or reinstall it in Settings → Voice & input."));
                    }
                }
            }
        }
        if !binary.is_absolute() || !binary.is_file() || !model.is_absolute() || !model.is_file() {
            return Err(
                "Speech recognition is unavailable. Download a model in Settings → Voice & input."
                    .into(),
            );
        }
        if Self::mode(config) == "server" {
            match self.transcribe_server(wav, config, &prompt, ticket) {
                Ok(text) => return Ok(text),
                Err(e) if self.ticket() != ticket => return Err(e),
                // Server unavailable: drop it so the next call retries, and use the CLI.
                Err(_) => self.shutdown(),
            }
        }
        let temp = tempfile::tempdir().map_err(|_| "Cannot create private audio workspace")?;
        let input = temp.path().join("input.wav");
        let output = temp.path().join("transcript");
        std::fs::write(&input, wav).map_err(|_| "Cannot prepare recording")?;
        let mut command = Command::new(binary);
        // Intel macOS Metal can return corrupted transcripts or fail to initialize.
        // The CPU backend is reliable and avoids a long GPU startup on these Macs.
        #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
        command.arg("-ng");
        command
            .arg("-m")
            .arg(model)
            .arg("-f")
            .arg(&input)
            .args(["-l", &config.language, "-bs", "5", "--prompt", &prompt])
            .args(["-nt", "-np", "-otxt", "-of"])
            .arg(&output);
        if let Some(vad) = config.vad_model.as_ref().filter(|v| v.is_file()) {
            command.arg("--vad").arg("-vm").arg(vad);
        }
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
        || wav.len() > 3_840_044
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

/// Kokoro v1.0 voice table helpers: character packs blend the stock voices into spare
/// slots (the foreign-language ones) so each mood can have its own timbre.
pub mod kokoro {
    pub const SPEAKERS: [&str; 54] = [
        "af_alloy",
        "af_aoede",
        "af_bella",
        "af_heart",
        "af_jessica",
        "af_kore",
        "af_nicole",
        "af_nova",
        "af_river",
        "af_sarah",
        "af_sky",
        "am_adam",
        "am_echo",
        "am_eric",
        "am_fenrir",
        "am_liam",
        "am_michael",
        "am_onyx",
        "am_puck",
        "am_santa",
        "bf_alice",
        "bf_emma",
        "bf_isabella",
        "bf_lily",
        "bm_daniel",
        "bm_fable",
        "bm_george",
        "bm_lewis",
        "ef_dora",
        "em_alex",
        "ff_siwis",
        "hf_alpha",
        "hf_beta",
        "hm_omega",
        "hm_psi",
        "if_sara",
        "im_nicola",
        "jf_alpha",
        "jf_gongitsune",
        "jf_nezumi",
        "jf_tebukuro",
        "jm_kumo",
        "pf_dora",
        "pm_alex",
        "pm_santa",
        "zf_xiaobei",
        "zf_xiaoni",
        "zf_xiaoxiao",
        "zf_xiaoyi",
        "zm_yunjian",
        "zm_yunxi",
        "zm_yunxia",
        "zm_yunyang",
        "em_santa",
    ];
    /// Slot 40 holds the character's neutral voice; moods follow in this fixed order.
    pub const NEUTRAL_SLOT: usize = 40;
    pub const MOODS: [&str; 8] = [
        "happy",
        "celebrating",
        "surprised",
        "curious",
        "confused",
        "concerned",
        "sad",
        "angry",
    ];
    pub const FLOATS_PER_SPEAKER: usize = 510 * 256;
    pub fn speaker_id(name: &str) -> Option<usize> {
        SPEAKERS.iter().position(|s| *s == name)
    }
    pub fn mood_slot(mood: &str) -> Option<usize> {
        MOODS
            .iter()
            .position(|m| *m == mood)
            .map(|i| NEUTRAL_SLOT + 1 + i)
    }
    /// `table` is the stock voices.bin (54 x 510 x 256 float32, little endian). Each
    /// recipe is (slot, [(speaker id, weight)]); weights are normalised. Returns the new table.
    pub fn blend_table(
        table: &[u8],
        recipes: &[(usize, Vec<(usize, f32)>)],
    ) -> Result<Vec<u8>, String> {
        let stride = FLOATS_PER_SPEAKER * 4;
        if table.len() != SPEAKERS.len() * stride {
            return Err("Unexpected Kokoro voices.bin size".into());
        }
        let mut out = table.to_vec();
        for (slot, parts) in recipes {
            if *slot < NEUTRAL_SLOT || *slot >= SPEAKERS.len() {
                return Err("Voice slot out of range".into());
            }
            let total: f32 = parts.iter().map(|(_, w)| w.max(0.0)).sum();
            if parts.is_empty() || total <= 0.0 || parts.iter().any(|(id, _)| *id >= SPEAKERS.len())
            {
                return Err("Invalid voice blend".into());
            }
            let mut mix = vec![0f32; FLOATS_PER_SPEAKER];
            for (id, weight) in parts {
                let w = weight.max(0.0) / total;
                let src = &table[id * stride..(id + 1) * stride];
                for (i, v) in mix.iter_mut().enumerate() {
                    *v += w * f32::from_le_bytes(src[i * 4..i * 4 + 4].try_into().unwrap());
                }
            }
            let dst = &mut out[slot * stride..(slot + 1) * stride];
            for (i, v) in mix.iter().enumerate() {
                dst[i * 4..i * 4 + 4].copy_from_slice(&v.to_le_bytes());
            }
        }
        Ok(out)
    }
    #[cfg(test)]
    mod tests {
        use super::*;
        fn table() -> Vec<u8> {
            let mut t = Vec::new();
            for s in 0..SPEAKERS.len() {
                for _ in 0..FLOATS_PER_SPEAKER {
                    t.extend_from_slice(&(s as f32).to_le_bytes());
                }
            }
            t
        }
        fn first(t: &[u8], slot: usize) -> f32 {
            let o = slot * FLOATS_PER_SPEAKER * 4;
            f32::from_le_bytes(t[o..o + 4].try_into().unwrap())
        }
        #[test]
        fn names_match_the_model_ids() {
            assert_eq!(speaker_id("af_heart"), Some(3));
            assert_eq!(speaker_id("af_sky"), Some(10));
            assert_eq!(speaker_id("nobody"), None);
            assert_eq!(mood_slot("happy"), Some(41));
            assert_eq!(mood_slot("angry"), Some(48));
            assert_eq!(mood_slot("sleepy"), None);
        }
        #[test]
        fn blends_are_weighted_normalised_and_leave_other_voices_alone() {
            let out = blend_table(
                &table(),
                &[(40, vec![(2, 1.0), (10, 3.0)]), (41, vec![(3, 5.0)])],
            )
            .unwrap();
            assert!((first(&out, 40) - (2.0 * 0.25 + 10.0 * 0.75)).abs() < 1e-5);
            assert!((first(&out, 41) - 3.0).abs() < 1e-5);
            assert_eq!(first(&out, 3), 3.0);
            assert_eq!(first(&out, 53), 53.0);
        }
        #[test]
        fn bad_recipes_are_rejected() {
            let t = table();
            assert!(
                blend_table(&t, &[(5, vec![(1, 1.0)])]).is_err(),
                "real voices are never overwritten"
            );
            assert!(blend_table(&t, &[(40, vec![])]).is_err());
            assert!(blend_table(&t, &[(40, vec![(99, 1.0)])]).is_err());
            assert!(blend_table(&t[..100], &[]).is_err());
        }
    }
}
