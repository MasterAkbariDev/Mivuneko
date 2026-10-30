// Latency spans measured where the user perceives them (plan §10, Slice 0).
// Stored locally through record_spans: timings and provider/engine names, never text.
import { isNative } from "./broker";

type Span = { turn: string; name: string; ms: number; detail: string };
let turn = "",
  start = 0,
  detail = "";
const marked = new Set<string>();
let queue: Span[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;

function push(span: Span) {
  if (!isNative) return;
  queue.push(span);
  clearTimeout(timer);
  timer = setTimeout(() => {
    const spans = queue.splice(0, 64);
    queue = [];
    void import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke("record_spans", { spans }))
      .catch(() => {});
  }, 1500);
}
const safe = (s: string) => s.replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 64);

/** Starts timing a conversation turn from the moment the user sends it. */
export function startTurn(provider: string) {
  turn = crypto.randomUUID();
  start = performance.now();
  detail = safe(provider);
  marked.clear();
}
/** Records the first occurrence of `name` in the current turn. */
export function markTurn(
  name: "turn.first_text" | "turn.reply_done" | "turn.first_audio",
) {
  if (!turn || marked.has(name)) return;
  marked.add(name);
  push({ turn, name, ms: performance.now() - start, detail });
}
/** Records a self-contained duration, such as one transcription. */
export function recordSpan(
  name: "stt.transcribe" | "stt.open_mic",
  ms: number,
  engine: string,
) {
  push({ turn: turn || "none", name, ms, detail: safe(engine) });
}
