use super::{AppInfo, Entry};
use sha2::{Digest, Sha256};
use std::{
    path::PathBuf,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};
type CachedCatalog = Option<(Instant, Vec<Entry>)>;
static CACHE: OnceLock<Mutex<CachedCatalog>> = OnceLock::new();
pub fn catalog() -> Vec<Entry> {
    let mut cache = match CACHE.get_or_init(|| Mutex::new(None)).lock() {
        Ok(c) => c,
        Err(_) => return vec![],
    };
    if let Some((at, entries)) = &*cache {
        if at.elapsed() < Duration::from_secs(60) {
            return entries.clone();
        }
    }
    let mut command = std::process::Command::new("powershell.exe");
    use std::os::windows::process::CommandExt;
    command.creation_flags(0x08000000).args(["-NoProfile","-NonInteractive","-Command","[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new(); @(Get-StartApps | Sort-Object Name | Select-Object -First 512) | ConvertTo-Json -Compress"]);
    for name in [
        "GEMINI_API_KEY",
        "GEMINI_API_KEYS",
        "GEMINI_KEYS",
        "MIVUNEKO_GEMINI_KEYS",
        "GROQ_API_KEY",
        "MIVUNEKO_HERMES_KEY",
    ] {
        command.env_remove(name);
    }
    let entries = command
        .output()
        .ok()
        .filter(|o| o.status.success() && o.stdout.len() < 1024 * 1024)
        .map(|o| parse(&o.stdout))
        .unwrap_or_default();
    *cache = Some((Instant::now(), entries.clone()));
    entries
}
fn parse(bytes: &[u8]) -> Vec<Entry> {
    let Ok(value) = serde_json::from_slice::<serde_json::Value>(bytes) else {
        return vec![];
    };
    let values = if let Some(v) = value.as_array() {
        v.clone()
    } else {
        vec![value]
    };
    let mut result = vec![];
    for item in values.into_iter().take(512) {
        let (Some(name), Some(id)) = (item["Name"].as_str(), item["AppID"].as_str()) else {
            continue;
        };
        if name.is_empty()
            || name.len() > 300
            || id.is_empty()
            || id.len() > 1024
            || id.chars().any(char::is_control)
        {
            continue;
        }
        if result
            .iter()
            .any(|e: &Entry| e.info.name.eq_ignore_ascii_case(name))
        {
            continue;
        }
        result.push(Entry {
            info: AppInfo {
                id: format!("win:{:x}", Sha256::digest(id.as_bytes())),
                name: name.into(),
                location: None,
            },
            path: PathBuf::from(format!("shell:AppsFolder\\{id}")),
        });
    }
    result
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn registered_apps_have_stable_ids_and_deduplicate() {
        let list=parse(br#"[{"Name":"Test App","AppID":"Vendor.Test!App"},{"Name":"test app","AppID":"duplicate"}]"#);
        assert_eq!(list.len(), 1);
        assert!(list[0]
            .path
            .to_str()
            .unwrap()
            .starts_with("shell:AppsFolder\\"));
        assert!(list[0].info.id.starts_with("win:"));
    }
}
