/// Bounded SSE decoder. Network chunks can split lines and UTF-8 sequences.
#[derive(Default)]
pub struct Decoder {
    buffer: Vec<u8>,
    data: Vec<String>,
    total: usize,
}
impl Decoder {
    pub fn push(&mut self, chunk: &[u8]) -> Result<Vec<String>, String> {
        self.total = self.total.saturating_add(chunk.len());
        if self.total > 12_000_000 {
            return Err("Stream response too large".into());
        }
        self.buffer.extend_from_slice(chunk);
        let mut events = Vec::new();
        while let Some(end) = self.buffer.iter().position(|b| *b == b'\n') {
            let mut line: Vec<u8> = self.buffer.drain(..=end).collect();
            line.pop();
            if line.last() == Some(&b'\r') {
                line.pop();
            }
            let line = std::str::from_utf8(&line).map_err(|_| "Invalid stream encoding")?;
            if line.is_empty() {
                if !self.data.is_empty() {
                    events.push(self.data.join("\n"));
                    self.data.clear();
                }
            } else if let Some(value) = line.strip_prefix("data:") {
                self.data
                    .push(value.strip_prefix(' ').unwrap_or(value).to_string());
            }
        }
        if self.buffer.len() > 1_000_000 {
            return Err("Stream event too large".into());
        }
        Ok(events)
    }
    pub fn finish(&mut self) -> Result<Vec<String>, String> {
        if !self.buffer.is_empty() {
            self.buffer.push(b'\n');
        }
        self.buffer.push(b'\n');
        self.push(&[])
    }
}

#[cfg(test)]
mod tests {
    use super::Decoder;
    #[test]
    fn splits_utf8_and_sse_boundaries_without_losing_events() {
        let bytes = "data: {\"text\":\"雪\"}\r\n\r\ndata: [DONE]\n\n".as_bytes();
        let mut d = Decoder::default();
        let mut events = Vec::new();
        for b in bytes {
            events.extend(d.push(&[*b]).unwrap());
        }
        assert_eq!(events, vec!["{\"text\":\"雪\"}", "[DONE]"]);
    }
}
