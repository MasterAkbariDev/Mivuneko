use std::path::{Path, PathBuf};

// Only documented variables are read. Quoted multiline values are literal; no shell expansion.
fn entries(contents: &str) -> Vec<(String, String)> {
    let mut result = Vec::new();
    let mut lines = contents.lines();
    while let Some(line) = lines.next() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') { continue; }
        let Some((key, value)) = line.split_once('=') else { continue; };
        let key = key.trim().strip_prefix("export ").unwrap_or(key.trim());
        if !matches!(key, "GROQ_API_KEY" | "MIVUNEKO_GROQ_MODEL" | "GEMINI_API_KEY" | "GEMINI_API_KEYS" | "GEMINI_KEYS" | "MIVUNEKO_GEMINI_KEYS" | "MIVUNEKO_GEMINI_MODEL" | "MIVUNEKO_GEMINI_TTS_MODEL" | "MIVUNEKO_GEMINI_VOICE" | "MIVUNEKO_PROXY") { continue; }
        let value = value.trim();
        let parsed = if let Some(q) = value.chars().next().filter(|c| *c == '\'' || *c == '"') {
            let mut rest = &value[q.len_utf8()..];
            let mut out = String::new();
            loop {
                if let Some(end) = rest.find(q) { out.push_str(&rest[..end]); break Some(out); }
                out.push_str(rest);
                if let Some(next) = lines.next() { out.push('\n'); rest = next; } else { break None; }
            }
        } else { Some(value.to_owned()) };
        if let Some(value) = parsed.filter(|v| v.len() <= 8192 && !v.contains('\0')) { result.push((key.into(), value)); }
    }
    result
}
pub fn load() {
    let mut dirs: Vec<PathBuf> = Vec::new();
    if let Ok(cwd) = std::env::current_dir() { dirs.push(cwd); }
    if let Ok(exe) = std::env::current_exe() { dirs.extend(exe.ancestors().skip(1).map(Path::to_path_buf)); }
    for dir in dirs {
        if !dir.join("package.json").is_file() || !dir.join("Cargo.toml").is_file() { continue; }
        let Ok(contents) = std::fs::read_to_string(dir.join(".env")) else { continue; };
        if contents.len() > 65536 { return; }
        for (key, value) in entries(&contents) {
            if std::env::var_os(&key).is_none() { std::env::set_var(key, value); }
        }
        return;
    }
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn parses_multiline_without_interpreting_shell() {
        let result = entries("GEMINI_API_KEYS=\"\none\ntwo\n\"\nGROQ_API_KEY='sample'\nIGNORE=secret\n");
        assert_eq!(result, vec![("GEMINI_API_KEYS".into(), "\none\ntwo\n".into()), ("GROQ_API_KEY".into(), "sample".into())]);
    }
}
