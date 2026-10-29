import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { isNative } from "./broker";
import { updatePreferences, usePreferences } from "./preferences";
export function PetDock({
  visible,
  closeSignal,
  onError,
}: {
  visible: boolean;
  closeSignal: number;
  onError: (e: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [text, setText] = useState(""),
    [active, setActive] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    root = useRef<HTMLDivElement>(null);
  const p = usePreferences();
  useEffect(() => {
    setOpen(false);
  }, [closeSignal]);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  useEffect(() => {
    const f = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", f);
    return () => window.removeEventListener("pointerdown", f);
  }, []);
  useEffect(() => {
    if (!isNative) return;
    let off: (() => void) | undefined,
      disposed = false;
    void import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen<boolean>("voice-active", (e) => setActive(e.payload)),
      )
      .then((f) => {
        if (disposed) f();
        else off = f;
      });
    return () => {
      disposed = true;
      off?.();
    };
  }, []);
  async function emit(name: string, value: string) {
    try {
      if (isNative) {
        const { emitTo } = await import("@tauri-apps/api/event");
        await emitTo("main", name, value);
      } else onError("Open the desktop app to talk to your companion.");
    } catch (e) {
      onError(String(e));
    }
  }
  return (
    <div
      ref={root}
      className={`pet-dock ${visible || open ? "is-visible" : ""} ${open ? "is-open" : ""}`}
      data-pet-control
    >
      {open ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) {
              void emit("pet-message", text.trim());
              setText("");
              setOpen(false);
            }
          }}
        >
          <input
            ref={input}
            aria-label="Message your companion"
            placeholder="Tell me anything…"
            value={text}
            maxLength={4000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setOpen(false);
              }
            }}
          />
          <button aria-label="Send message" disabled={!text.trim()}>
            <Icon name="send" />
          </button>
          <button
            type="button"
            aria-label="Close quick chat"
            onClick={() => setOpen(false)}
          >
            <Icon name="close" />
          </button>
        </form>
      ) : (
        <>
          <button
            className={active ? "is-active" : ""}
            aria-label={active ? "Turn voice chat off" : "Turn voice chat on"}
            title={active ? "Voice on · click to pause" : "Talk with me"}
            onClick={() => void emit("global-action", "voice-toggle")}
          >
            <Icon name={active ? "stop" : "mic"} />
            {active && <span className="voice-pulse" />}
          </button>
          <span className="dock-divider" />
          <button
            aria-label="Quick chat"
            title="Write a message"
            onClick={() => setOpen(true)}
          >
            <Icon name="chat" />
          </button>
          <button
            className={p.petEdit ? "is-active" : ""}
            aria-label={p.petEdit ? "Lock pet position" : "Unlock pet editing"}
            title={p.petEdit ? "Lock position" : "Drag & resize"}
            onClick={() => updatePreferences({ petEdit: !p.petEdit })}
          >
            <Icon name="pin" />
          </button>
        </>
      )}
    </div>
  );
}
