#[cfg(windows)]
mod windows_catalog;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
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
/// How launch requests are decided. Rust enforces `enabled` and `Deny` and binds each token to
/// its target and window; `Ask` vs `Auto` is decided by the main window's UI (whether it
/// shows a card before resolving). Fine for local-reversible launches only: send-capable
/// actions need a confirmation the webview cannot synthesize (plan Slice 6).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ApprovalMode {
    #[default]
    Ask,
    Auto,
    Deny,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct LaunchPolicy {
    pub enabled: bool,
    pub mode: ApprovalMode,
}
impl Default for LaunchPolicy {
    fn default() -> Self {
        Self {
            enabled: true,
            mode: ApprovalMode::Ask,
        }
    }
}
#[derive(Clone, Serialize)]
pub struct LaunchRequest {
    /// One-time approval token (256 bits from the OS CSPRNG, hex).
    pub id: String,
    pub app: AppInfo,
    /// The policy that will decide this request, so the UI can show it.
    pub policy: ApprovalMode,
}
#[derive(Serialize)]
pub struct LaunchResult {
    pub ok: bool,
    pub message: String,
}
#[derive(Clone)]
struct Entry {
    info: AppInfo,
    path: PathBuf,
}
/// What an approval token is bound to: the action, its payload, its expiry and the
/// context allowed to approve it.
struct Pending {
    token: [u8; 32],
    app: String,
    payload: [u8; 32],
    context: String,
    created: Instant,
}
const APPROVAL_TTL: Duration = Duration::from_secs(60);
#[derive(Default)]
pub struct Broker {
    pending: Vec<Pending>,
    policy: LaunchPolicy,
}
/// SHA-256 over the capability, app id and the exact target path that would run.
fn payload_digest(entry: &Entry) -> [u8; 32] {
    let mut hash = Sha256::new();
    hash.update(b"app.launch\0");
    hash.update(entry.info.id.as_bytes());
    hash.update(b"\0");
    hash.update(entry.path.to_string_lossy().as_bytes());
    hash.finalize().into()
}
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}
fn decode_token(token: &str) -> Option<[u8; 32]> {
    if token.len() != 64 {
        return None;
    }
    let mut out = [0u8; 32];
    for (i, byte) in out.iter_mut().enumerate() {
        *byte = u8::from_str_radix(token.get(i * 2..i * 2 + 2)?, 16).ok()?;
    }
    Some(out)
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
        #[cfg(windows)]
        {
            let mut discovered = windows_catalog::catalog();
            for entry in entries.into_iter().filter(|e| e.path.is_file()) {
                if !discovered
                    .iter()
                    .any(|e| e.info.name.eq_ignore_ascii_case(&entry.info.name))
                {
                    discovered.push(entry);
                }
            }
            return discovered;
        }
        #[cfg(not(windows))]
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
    #[cfg(windows)]
    if entry.info.id.starts_with("win:") {
        use std::os::windows::process::CommandExt;
        let explorer =
            PathBuf::from(std::env::var_os("SystemRoot").ok_or("Windows folder unavailable")?)
                .join("explorer.exe");
        std::process::Command::new(explorer)
            .env_remove("MIVUNEKO_GEMINI_KEYS")
            .env_remove("GEMINI_API_KEY")
            .env_remove("GEMINI_API_KEYS")
            .env_remove("GEMINI_KEYS")
            .env_remove("GROQ_API_KEY")
            .env_remove("MIVUNEKO_HERMES_KEY")
            .env_remove("API_SERVER_KEY")
            .arg(&entry.path)
            .creation_flags(0x08000000)
            .spawn()
            .map_err(|_| "Windows could not open this app")?;
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
    pub fn policy(&self) -> LaunchPolicy {
        self.policy
    }
    /// Replaces the policy. Pending approvals are revoked so none outlive the change.
    pub fn set_policy(&mut self, policy: LaunchPolicy) {
        self.policy = policy;
        self.pending.clear();
    }
    /// Creates a one-time approval token for launching `app_id`, approvable only from
    /// `context` (the requesting window).
    pub fn request(&mut self, app_id: &str, context: &str) -> Result<LaunchRequest, String> {
        self.request_from(catalog(), app_id, context)
    }
    fn request_from(
        &mut self,
        catalog: Vec<Entry>,
        app_id: &str,
        context: &str,
    ) -> Result<LaunchRequest, String> {
        if !self.policy.enabled {
            return Err("App launching is turned off in Permissions.".into());
        }
        let app = catalog
            .into_iter()
            .find(|e| e.info.id == app_id)
            .ok_or("Unknown or unavailable app")?;
        self.pending.retain(|p| p.created.elapsed() < APPROVAL_TTL);
        if self.pending.len() >= 8 {
            return Err("Too many pending requests".into());
        }
        let mut token = [0u8; 32];
        getrandom::fill(&mut token).map_err(|_| "Secure randomness unavailable")?;
        self.pending.push(Pending {
            token,
            app: app_id.into(),
            payload: payload_digest(&app),
            context: context.into(),
            created: Instant::now(),
        });
        Ok(LaunchRequest {
            id: token.iter().map(|b| format!("{b:02x}")).collect(),
            app: app.info,
            policy: self.policy.mode,
        })
    }
    /// Consumes the token (before anything runs), then checks expiry, approval context,
    /// policy and that the target is still exactly what was approved.
    pub fn resolve(
        &mut self,
        token: &str,
        allow: bool,
        context: &str,
    ) -> Result<LaunchResult, String> {
        self.resolve_with(token, allow, context, catalog, launch)
    }
    fn resolve_with(
        &mut self,
        token: &str,
        allow: bool,
        context: &str,
        catalog: impl FnOnce() -> Vec<Entry>,
        run: impl FnOnce(&Entry) -> Result<LaunchResult, String>,
    ) -> Result<LaunchResult, String> {
        let wanted = decode_token(token).ok_or("Request expired or consumed")?;
        let index = self
            .pending
            .iter()
            .position(|p| constant_time_eq(&p.token, &wanted))
            .ok_or("Request expired or consumed")?;
        let pending = self.pending.swap_remove(index);
        if pending.created.elapsed() > APPROVAL_TTL {
            return Err("Request expired".into());
        }
        if !constant_time_eq(pending.context.as_bytes(), context.as_bytes()) {
            return Err("This approval belongs to another window".into());
        }
        if !allow || !self.policy.enabled || self.policy.mode == ApprovalMode::Deny {
            return Ok(LaunchResult {
                ok: false,
                message: "Launch denied.".into(),
            });
        }
        // Only rediscovered catalog targets, never shell text or arbitrary user paths.
        let app = catalog()
            .into_iter()
            .find(|e| e.info.id == pending.app)
            .ok_or("App is no longer available")?;
        if !constant_time_eq(&payload_digest(&app), &pending.payload) {
            return Err("The app changed after approval was requested".into());
        }
        run(&app)
    }
    pub fn revoke(&mut self) {
        self.pending.clear()
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn entry(id: &str, path: &str) -> Entry {
        Entry {
            info: AppInfo {
                id: id.into(),
                name: id.into(),
                location: None,
            },
            path: path.into(),
        }
    }
    fn launched(_: &Entry) -> Result<LaunchResult, String> {
        Ok(LaunchResult {
            ok: true,
            message: "launched".into(),
        })
    }
    fn calc() -> Vec<Entry> {
        vec![entry("calc", "/Applications/Calculator.app")]
    }
    #[test]
    fn unknown_ids_cannot_launch() {
        let mut b = Broker::default();
        assert!(b.request("../../cmd.exe", "main").is_err());
        assert!(b.resolve("fake", true, "main").is_err());
        assert!(b.resolve(&"0".repeat(64), true, "main").is_err());
    }
    #[test]
    fn tokens_are_256_bit_unique_and_single_use() {
        let mut b = Broker::default();
        let first = b.request_from(calc(), "calc", "main").unwrap();
        let second = b.request_from(calc(), "calc", "main").unwrap();
        assert_eq!(first.id.len(), 64);
        assert_ne!(first.id, second.id);
        let ok = b
            .resolve_with(&first.id, true, "main", calc, launched)
            .unwrap();
        assert!(ok.ok);
        assert!(b
            .resolve_with(&first.id, true, "main", calc, launched)
            .is_err());
    }
    #[test]
    fn denial_consumes_request() {
        let mut b = Broker::default();
        let r = b.request_from(calc(), "calc", "main").unwrap();
        assert!(
            !b.resolve_with(&r.id, false, "main", calc, launched)
                .unwrap()
                .ok
        );
        assert!(b.resolve_with(&r.id, true, "main", calc, launched).is_err());
    }
    #[test]
    fn wrong_context_is_rejected_and_burns_the_token() {
        let mut b = Broker::default();
        let r = b.request_from(calc(), "calc", "main").unwrap();
        assert!(b.resolve_with(&r.id, true, "pet", calc, launched).is_err());
        assert!(b.resolve_with(&r.id, true, "main", calc, launched).is_err());
    }
    #[test]
    fn changed_target_is_rejected() {
        let mut b = Broker::default();
        let r = b.request_from(calc(), "calc", "main").unwrap();
        let moved = || vec![entry("calc", "/tmp/Evil.app")];
        assert!(b
            .resolve_with(&r.id, true, "main", moved, launched)
            .is_err());
    }
    #[test]
    fn policy_is_enforced_in_rust() {
        let mut b = Broker::default();
        b.set_policy(LaunchPolicy {
            enabled: false,
            mode: ApprovalMode::Auto,
        });
        assert!(b.request_from(calc(), "calc", "main").is_err());
        b.set_policy(LaunchPolicy {
            enabled: true,
            mode: ApprovalMode::Deny,
        });
        let r = b.request_from(calc(), "calc", "main").unwrap();
        assert_eq!(r.policy, ApprovalMode::Deny);
        assert!(
            !b.resolve_with(&r.id, true, "main", calc, launched)
                .unwrap()
                .ok
        );
    }
    #[test]
    fn policy_change_revokes_pending_approvals() {
        let mut b = Broker::default();
        let r = b.request_from(calc(), "calc", "main").unwrap();
        b.set_policy(LaunchPolicy::default());
        assert!(b.resolve_with(&r.id, true, "main", calc, launched).is_err());
    }
    #[test]
    fn revoke_invalidates_all() {
        let mut b = Broker::default();
        let r = b.request_from(calc(), "calc", "main").unwrap();
        b.revoke();
        assert!(b.resolve_with(&r.id, true, "main", calc, launched).is_err());
    }
    #[test]
    fn expired_approval_rejected() {
        let mut b = Broker::default();
        let r = b.request_from(calc(), "calc", "main").unwrap();
        b.pending[0].created = Instant::now() - Duration::from_secs(61);
        assert!(b.resolve_with(&r.id, true, "main", calc, launched).is_err());
    }
    #[test]
    fn policy_serializes_as_lowercase() {
        let json = serde_json::to_string(&LaunchPolicy::default()).unwrap();
        assert_eq!(json, r#"{"enabled":true,"mode":"ask"}"#);
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
