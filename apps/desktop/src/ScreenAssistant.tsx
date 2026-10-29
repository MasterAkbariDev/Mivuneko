import { useEffect, useRef, useState } from "react";
import { isNative } from "./broker";
export function ScreenAssistant({
  prompt,
  onClose,
  onAnswer,
}: {
  prompt: string;
  onClose: () => void;
  onAnswer: (text: string) => void;
}) {
  const [bytes, setBytes] = useState<number[] | null>(null),
    [preview, setPreview] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const request = useRef<string | null>(null);
  useEffect(() => {
    let disposed = false,
      url = "";
    if (!isNative) {
      setError("Screen assistance is available in the desktop app.");
      return;
    }
    void import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke<number[]>("capture_screen"))
      .then((data) => {
        if (disposed) return;
        url = URL.createObjectURL(
          new Blob([new Uint8Array(data)], { type: "image/jpeg" }),
        );
        setBytes(data);
        setPreview(url);
      })
      .catch((e) => {
        if (!disposed) setError(String(e));
      });
    return () => {
      disposed = true;
      if (url) URL.revokeObjectURL(url);
      const id = request.current;
      request.current = null;
      if (id)
        void import("@tauri-apps/api/core")
          .then(({ invoke }) => invoke("cancel_gemini", { requestId: id }))
          .catch(() => {});
    };
  }, []);
  async function share() {
    if (!bytes || busy) return;
    setBusy(true);
    setError("");
    const id = crypto.randomUUID();
    request.current = id;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const answer = await invoke<string>("analyze_screen", {
        requestId: id,
        image: bytes,
        prompt,
      });
      if (request.current === id) {
        request.current = null;
        onAnswer(answer);
      }
    } catch (e) {
      if (request.current === id)
        setError(
          String(e).includes("connection failed")
            ? "Gemini could not be reached. Start your configured proxy or check Settings → Connections, then try sharing again."
            : String(e),
        );
    } finally {
      if (request.current === id) setBusy(false);
    }
  }
  return (
    <div className="scrim">
      <section
        className="screen-assistant dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Share a screenshot"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Tab") {
            const buttons = Array.from(
              e.currentTarget.querySelectorAll<HTMLButtonElement>(
                "button:not(:disabled)",
              ),
            );
            const first = buttons[0],
              last = buttons.at(-1);
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <h2>Let me see what you’re looking at</h2>
        <p>
          Review this screenshot before sharing it with Gemini. Only this image
          is shared, and it is not saved in conversation history.
        </p>
        {preview ? (
          <img src={preview} alt="Screenshot to review before sharing" />
        ) : !error ? (
          <p role="status">Preparing screenshot…</p>
        ) : null}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="button" autoFocus onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!bytes || busy}
            onClick={() => void share()}
          >
            {busy ? "Looking at your screen…" : "Share screenshot with Gemini"}
          </button>
        </div>
      </section>
    </div>
  );
}
