use serde::Serialize;
use std::{
    collections::HashMap,
    path::PathBuf,
    time::{Duration, Instant},
};
#[derive(Clone, Serialize)]
pub struct AppInfo {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<String>,
}
#[derive(Clone, Serialize)]
pub struct LaunchRequest {
    pub id: String,
    pub app: AppInfo,
}
#[derive(Serialize)]
pub struct LaunchResult {
    pub ok: bool,
    pub message: String,
}
struct Entry {
    info: AppInfo,
    path: PathBuf,
}
struct Pending {
    app: String,
    created: Instant,
}
#[derive(Default)]
pub struct Broker {
    pending: HashMap<String, Pending>,
}
fn scan_mac_roots(roots: &[PathBuf]) -> Vec<Entry> {
    use sha2::{Digest, Sha256};
    let mut found = Vec::new();
    let mut seen = std::collections::HashSet::new();
    fn scan(
        root: &std::path::Path,
        depth: u8,
        found: &mut Vec<Entry>,
        seen: &mut std::collections::HashSet<PathBuf>,
    ) {
        if depth > 2 || found.len() >= 512 {
            return;
        }
        let Ok(entries) = std::fs::read_dir(root) else {
            return;
        };
        for item in entries.flatten().take(2048) {
            let path = item.path();
            let Ok(kind) = item.file_type() else { continue };
            if kind.is_symlink() || !kind.is_dir() {
                continue;
            }
            if path.extension().is_some_and(|s| s == "app") {
                if !path.join("Contents/Info.plist").is_file() {
                    continue;
                }
                let Ok(canonical) = path.canonicalize() else {
                    continue;
                };
                if !seen.insert(canonical.clone()) {
                    continue;
                }
                let name = path
                    .file_stem()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                if name.is_empty() || name.chars().count() > 128 {
                    continue;
                }
                let hash = Sha256::digest(canonical.to_string_lossy().as_bytes());
                let id = format!("mac:{hash:x}");
                found.push(Entry {
                    info: AppInfo {
                        id,
                        name,
                        location: Some(canonical.display().to_string()),
                    },
                    path: canonical,
                });
            } else {
                scan(&path, depth + 1, found, seen)
            }
            if found.len() >= 512 {
                break;
            }
        }
    }
    for root in roots {
        scan(root, 0, &mut found, &mut seen)
    }
    found.sort_by_key(|a| a.info.name.to_lowercase());
    found
}
fn catalog() -> Vec<Entry> {
    let mut entries = Vec::new();
    if cfg!(target_os = "windows") {
        if let Some(root) = std::env::var_os("SystemRoot") {
            for (id, name, file) in [
                ("notepad", "Notepad", "notepad.exe"),
                ("calculator", "Calculator", "calc.exe"),
            ] {
                entries.push(Entry {
                    info: AppInfo {
                        id: id.into(),
                        name: name.into(),
                        location: None,
                    },
                    path: PathBuf::from(&root).join("System32").join(file),
                });
            }
        }
        if let Some(root) = std::env::var_os("APPDATA") {
            entries.push(Entry {
                info: AppInfo {
                    id: "telegram".into(),
                    name: "Telegram".into(),
                    location: None,
                },
                path: PathBuf::from(root).join("Telegram Desktop/Telegram.exe"),
            });
        }
        return entries.into_iter().filter(|e| e.path.is_file()).collect();
    }
    if cfg!(target_os = "macos") {
        let mut roots = vec![
            PathBuf::from("/Applications"),
            PathBuf::from("/System/Applications"),
            PathBuf::from("/System/Volumes/Preboot/Cryptexes/App/System/Applications"),
        ];
        if let Some(home) = std::env::var_os("HOME") {
            roots.push(PathBuf::from(home).join("Applications"));
        }
        return scan_mac_roots(&roots);
    }
    entries
}
fn launch(entry: &Entry) -> Result<LaunchResult, String> {
    if cfg!(target_os = "macos") {
        let status = std::process::Command::new("/usr/bin/open")
            .env_remove("MIVUNEKO_GEMINI_KEYS")
            .env_remove("GEMINI_API_KEY")
            .env_remove("GEMINI_API_KEYS")
            .env_remove("GEMINI_KEYS")
            .env_remove("GROQ_API_KEY")
            .env_remove("MIVUNEKO_PROXY")
            .env_remove("MIVUNEKO_HERMES_KEY")
            .env_remove("API_SERVER_KEY")
            .arg("-a")
            .arg(&entry.path)
            .status()
            .map_err(|e| format!("Launch failed: {e}"))?;
        if !status.success() {
            return Err("macOS refused the application launch".into());
        }
        return Ok(LaunchResult {
            ok: true,
            message: format!("Launch requested for {}.", entry.info.name),
        });
    }
    let child = std::process::Command::new(&entry.path)
        .env_remove("MIVUNEKO_GEMINI_KEYS")
        .env_remove("GEMINI_API_KEY")
        .env_remove("GEMINI_API_KEYS")
        .env_remove("GEMINI_KEYS")
        .env_remove("GROQ_API_KEY")
        .env_remove("MIVUNEKO_PROXY")
        .env_remove("MIVUNEKO_HERMES_KEY")
        .env_remove("API_SERVER_KEY")
        .spawn()
        .map_err(|e| format!("Launch failed: {e}"))?;
    Ok(LaunchResult {
        ok: true,
        message: format!("{} started (PID {}).", entry.info.name, child.id()),
    })
}
impl Broker {
    pub fn list_apps(&self) -> Vec<AppInfo> {
        catalog().into_iter().map(|e| e.info).collect()
    }
    pub fn request(&mut self, app_id: &str) -> Result<LaunchRequest, String> {
        let app = catalog()
            .into_iter()
            .find(|e| e.info.id == app_id)
            .ok_or("Unknown or unavailable app")?;
        self.pending
            .retain(|_, p| p.created.elapsed() < Duration::from_secs(60));
        if self.pending.len() >= 8 {
            return Err("Too many pending requests".into());
        }
        let id = uuid::Uuid::new_v4().to_string();
        self.pending.insert(
            id.clone(),
            Pending {
                app: app_id.into(),
                created: Instant::now(),
            },
        );
        Ok(LaunchRequest { id, app: app.info })
    }
    pub fn resolve(&mut self, id: &str, allow: bool) -> Result<LaunchResult, String> {
        let pending = self
            .pending
            .remove(id)
            .ok_or("Request expired or consumed")?;
        if pending.created.elapsed() > Duration::from_secs(60) {
            return Err("Request expired".into());
        }
        if !allow {
            return Ok(LaunchResult {
                ok: false,
                message: "Launch denied.".into(),
            });
        }
        let app = catalog()
            .into_iter()
            .find(|e| e.info.id == pending.app)
            .ok_or("App is no longer available")?;
        // Only rediscovered catalog targets, never shell text or arbitrary user paths.
        launch(&app)
    }
    pub fn revoke(&mut self) {
        self.pending.clear()
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn unknown_ids_cannot_launch() {
        let mut b = Broker::default();
        assert!(b.request("../../cmd.exe").is_err());
        assert!(b.resolve("fake", true).is_err());
    }
    #[test]
    fn denial_consumes_request() {
        let mut b = Broker::default();
        b.pending.insert(
            "test".into(),
            Pending {
                app: "fake".into(),
                created: Instant::now(),
            },
        );
        assert!(!b.resolve("test", false).unwrap().ok);
        assert!(b.resolve("test", true).is_err());
    }
    #[test]
    fn revoke_invalidates_all() {
        let mut b = Broker::default();
        b.pending.insert(
            "test".into(),
            Pending {
                app: "fake".into(),
                created: Instant::now(),
            },
        );
        b.revoke();
        assert!(b.resolve("test", true).is_err());
    }
    #[test]
    fn expired_approval_rejected() {
        let mut b = Broker::default();
        b.pending.insert(
            "test".into(),
            Pending {
                app: "fake".into(),
                created: Instant::now() - Duration::from_secs(61),
            },
        );
        assert!(b.resolve("test", true).is_err());
    }
}

#[cfg(test)]
mod mac_catalog_tests {
    use super::*;
    fn bundle(root: &std::path::Path, name: &str) {
        let p = root.join(name).join("Contents");
        std::fs::create_dir_all(&p).unwrap();
        std::fs::write(p.join("Info.plist"), "<plist/>").unwrap();
    }
    #[test]
    fn scans_only_bundles_with_metadata_and_stable_opaque_ids() {
        let t = tempfile::tempdir().unwrap();
        bundle(t.path(), "Telegram.app");
        bundle(t.path(), "Utilities/Calculator.app");
        std::fs::create_dir(t.path().join("Fake.app")).unwrap();
        std::fs::write(t.path().join("bad.exe"), "x").unwrap();
        let roots = vec![t.path().to_path_buf()];
        let apps = scan_mac_roots(&roots);
        assert_eq!(apps.len(), 2);
        assert_eq!(apps[0].info.name, "Calculator");
        assert!(apps[0].info.id.starts_with("mac:"));
        assert_eq!(apps[0].info.id, scan_mac_roots(&roots)[0].info.id);
    }
    #[test]
    fn deduplicates_repeated_roots() {
        let t = tempfile::tempdir().unwrap();
        bundle(t.path(), "Notes.app");
        let apps = scan_mac_roots(&[t.path().into(), t.path().into()]);
        assert_eq!(apps.len(), 1);
    }
    #[cfg(unix)]
    #[test]
    fn ignores_symlinked_bundles() {
        let t = tempfile::tempdir().unwrap();
        let external = tempfile::tempdir().unwrap();
        bundle(external.path(), "Other.app");
        std::os::unix::fs::symlink(
            external.path().join("Other.app"),
            t.path().join("Linked.app"),
        )
        .unwrap();
        assert!(scan_mac_roots(&[t.path().into()]).is_empty());
    }
}
