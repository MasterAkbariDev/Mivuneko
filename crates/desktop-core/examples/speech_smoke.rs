// Opt-in macOS integration check using synthetic text, not microphone audio.
use desktop_core::VoiceWorker;

fn audible_wav(bytes: &[u8]) -> bool {
    if bytes.len() < 44 || &bytes[..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return false;
    }
    let mut pos = 12;
    while pos + 8 <= bytes.len() {
        let size = u32::from_le_bytes(bytes[pos + 4..pos + 8].try_into().unwrap()) as usize;
        let start = pos + 8;
        let Some(end) = start.checked_add(size).filter(|end| *end <= bytes.len()) else {
            return false;
        };
        if &bytes[pos..pos + 4] == b"data" {
            return bytes[start..end].chunks_exact(2).any(|sample| {
                i16::from_le_bytes([sample[0], sample[1]]).unsigned_abs() > 100
            });
        }
        pos = end + size % 2;
    }
    false
}

fn main() {
    let worker = VoiceWorker::default();
    let text = "Hello! It is lovely to meet you.";
    let natural = worker
        .synthesize_with_voice(text, "natural", "en", worker.ticket())
        .unwrap();
    let bright = worker
        .synthesize_with_voice(text, "bright", "en", worker.ticket())
        .unwrap();
    let japanese = worker
        .synthesize_with_voice("こんにちは。", "multilingual", "ja", worker.ticket())
        .unwrap();
    assert!(audible_wav(&natural) && audible_wav(&bright) && audible_wav(&japanese));
    assert_ne!(
        natural, bright,
        "voice styles should produce different audio"
    );
    let mut voices = Vec::new();
    for character in ["luna", "miku", "kitsune", "stella", "teto", "neru", "snow", "silver", "azure", "goth"] {
        let wav = worker.synthesize_for_character(text, "natural", "en", character, worker.ticket()).expect(character);
        assert!(audible_wav(&wav), "{character} produced silent audio");
        voices.push(wav);
    }
    for (i, pair) in voices.windows(2).enumerate() { if pair[0] == pair[1] { println!("Adjacent voices {} and {} use the same system fallback", i, i + 1); } }
    println!("All ten local character settings produced non-silent WAV audio. macOS may substitute voices.");
}
