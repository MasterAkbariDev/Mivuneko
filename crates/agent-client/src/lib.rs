use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{io::Read, time::Duration};
#[derive(Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: String,
}
pub struct Config {
    pub base_url: String,
    pub key: String,
}
fn endpoint(base: &str, path: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(base).map_err(|_| "Invalid Hermes address")?;
    let local = match url.host() {
        Some(host) => host
            .to_string()
            .parse::<std::net::Ipv4Addr>()
            .is_ok_and(|a| a.is_loopback()),
        _ => false,
    };
    if !local
        || url.scheme() != "http"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/"
    {
        return Err(
            "Hermes must use an HTTP IPv4 loopback address without a path or credentials".into(),
        );
    }
    url.join(path).map_err(|_| "Invalid Hermes endpoint".into())
}
fn body(response: reqwest::blocking::Response) -> Result<Value, String> {
    let status = response.status();
    if !status.is_success() {
        return Err(format!("Hermes returned HTTP {}", status.as_u16()));
    }
    let mut bytes = Vec::new();
    response
        .take(1_048_577)
        .read_to_end(&mut bytes)
        .map_err(|_| "Could not read Hermes response")?;
    if bytes.len() > 1_048_576 {
        return Err("Hermes response exceeded 1 MB".into());
    }
    serde_json::from_slice(&bytes).map_err(|_| "Invalid JSON from Hermes".into())
}
fn validate_toolsets(value: &Value) -> Result<(), String> {
    let sets = value
        .as_array()
        .ok_or("Hermes toolset discovery returned an unsupported shape")?;
    for set in sets {
        let enabled = set["enabled"]
            .as_bool()
            .ok_or("Hermes toolset status is missing")?;
        if enabled
            && !set["tools"]
                .as_array()
                .is_some_and(|tools| tools.is_empty())
        {
            return Err("Hermes has enabled tools. Use a dedicated tool-free profile; Mivuneko handles desktop actions behind its own approvals.".into());
        }
    }
    Ok(())
}
impl Config {
    fn client(&self) -> Result<reqwest::blocking::Client, String> {
        if self.key.is_empty() || self.key.len() > 4096 || self.key.chars().any(char::is_control) {
            return Err("Configure the local Hermes API key before connecting".into());
        }
        reqwest::blocking::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(3))
            .timeout(Duration::from_secs(45))
            .build()
            .map_err(|_| "Cannot initialize Hermes client".into())
    }
    pub fn check(&self) -> Result<(), String> {
        let client = self.client()?;
        let response = client
            .get(endpoint(&self.base_url, "v1/toolsets")?)
            .bearer_auth(&self.key)
            .send()
            .map_err(|_| "Cannot reach local Hermes API server")?;
        validate_toolsets(&body(response)?)
    }
    pub fn chat(&self, mut messages: Vec<Message>, mode: &str) -> Result<String, String> {
        if !["Chat", "Assist", "Creative", "Autonomous"].contains(&mode) {
            return Err("Unknown companion mode".into());
        }
        if messages.is_empty()
            || messages.len() > 32
            || messages.iter().any(|m| {
                !["user", "assistant"].contains(&m.role.as_str()) || m.content.len() > 16000
            })
            || messages.iter().map(|m| m.content.len()).sum::<usize>() > 48000
        {
            return Err("Conversation exceeds bounded input limits".into());
        }
        self.check()?;
        messages.insert(0,Message{role:"system".into(),content:format!("You are Mivuneko, a friendly desktop pet. Mode: {mode}. Reply only as a JSON object with text (in the user's language), emotion (idle, happy, curious, confused, concerned, celebrating, angry, sad, surprised, crying, shy, love, excited, teasing, joking, wink, proud, determined or sleeping) and speech. Format text as Markdown: put code in fenced blocks with a language tag, and use short lists or bold sparingly. The speech field is one or two short, natural sentences to say aloud for this reply, with no code, URLs or symbols. When the reply is itself short and plain, speech may repeat it. Be concise and respectful. Your expressions are fictional. Do not guilt users for being absent. You have no tools in this profile. Do not claim to have launched apps or changed the desktop. Desktop requests are handled separately by Mivuneko's consent broker.")});
        let response=self.client()?.post(endpoint(&self.base_url,"v1/chat/completions")?).bearer_auth(&self.key).json(&json!({"model":"hermes-agent","messages":messages,"stream":false,"tools":[],"tool_choice":"none","max_tokens":1200})).send().map_err(|_|"Hermes request failed or timed out")?;
        let value = body(response)?;
        let choice = &value["choices"][0];
        if ![Some("stop"), Some("length")].contains(&choice["finish_reason"].as_str()) {
            return Err("Hermes did not finish this turn successfully".into());
        }
        if choice["message"]["tool_calls"]
            .as_array()
            .is_some_and(|a| !a.is_empty())
        {
            return Err("Unexpected Hermes tool call was rejected".into());
        }
        let text = choice["message"]["content"]
            .as_str()
            .filter(|s| !s.trim().is_empty() && s.len() <= 32000)
            .ok_or("Hermes returned no usable text")?;
        Ok(if choice["finish_reason"] == "length" {
            format!("{text}\n[Response reached its limit.]")
        } else {
            text.into()
        })
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{Read, Write},
        net::TcpListener,
        thread,
    };
    #[test]
    fn rejects_remote_urls_credentials_and_redirect_targets() {
        for base in [
            "https://example.com",
            "http://localhost:8642",
            "http://127.0.0.1:8642/proxy",
            "http://u:p@127.0.0.1",
            "http://127.0.0.1?x=1",
        ] {
            assert!(endpoint(base, "v1/toolsets").is_err())
        }
        assert!(endpoint("http://127.0.0.1:8642", "v1/toolsets").is_ok())
    }
    #[test]
    fn toolsets_fail_closed() {
        assert!(validate_toolsets(&json!([{"enabled":true,"tools":["terminal"]}])).is_err());
        assert!(validate_toolsets(&json!([{"tools":[]}])).is_err());
        assert!(validate_toolsets(&json!([])).is_ok());
    }
    #[test]
    fn real_http_contract_uses_discovery_auth_and_bounded_chat() {
        let server = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = server.local_addr().unwrap();
        let handle = thread::spawn(move || {
            for index in 0..2 {
                let (mut s, _) = server.accept().unwrap();
                s.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
                let mut bytes = Vec::new();
                let mut buf = [0u8; 8192];
                loop {
                    let n = s.read(&mut buf).unwrap();
                    if n == 0 {
                        break;
                    }
                    bytes.extend_from_slice(&buf[..n]);
                    if let Some(end) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                        let header = String::from_utf8_lossy(&bytes[..end]).to_lowercase();
                        let len = header
                            .lines()
                            .find_map(|line| {
                                line.strip_prefix("content-length: ")
                                    .and_then(|s| s.parse::<usize>().ok())
                            })
                            .unwrap_or(0);
                        if bytes.len() >= end + 4 + len {
                            break;
                        }
                    }
                }
                let request = String::from_utf8_lossy(&bytes).to_lowercase();
                assert!(request.contains("authorization: bearer test-key"));
                let result = if index == 0 {
                    assert!(request.starts_with("get /v1/toolsets"));
                    "[]"
                } else {
                    assert!(request.starts_with("post /v1/chat/completions"));
                    assert!(request.contains("tool_choice"));
                    r#"{"choices":[{"finish_reason":"stop","message":{"content":"Hello from test Hermes"}}]}"#
                };
                write!(s,"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",result.len(),result).unwrap();
            }
        });
        let config = Config {
            base_url: format!("http://{addr}"),
            key: "test-key".into(),
        };
        assert_eq!(
            config
                .chat(
                    vec![Message {
                        role: "user".into(),
                        content: "Hi".into()
                    }],
                    "Chat"
                )
                .unwrap(),
            "Hello from test Hermes"
        );
        handle.join().unwrap();
    }
}
