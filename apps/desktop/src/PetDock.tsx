import { cancelCompanionTask } from "./companionTask";
import { wakeCompanion } from "../../../packages/shared-schemas/companion-wake";
import { useEffect, useRef, useState } from "react";
import { companionName } from "./companionName";
import { Icon } from "./Icon";
import { isNative } from "./broker";
import { updatePreferences, usePreferences } from "./preferences";
export function PetDock({
  visible,
  closeSignal,
  onError,
  menuSignal = 0,
  chatSignal = 0,
}: {
  visible: boolean;
  closeSignal: number;
  onError: (e: string) => void;
  menuSignal?: number;
  chatSignal?: number;
}) {
  const [menu, setMenu] = useState(false);
  const [open, setOpen] = useState(false),
    [text, setText] = useState(""),
    [active, setActive] = useState(false),
    [busy, setBusy] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null),
    root = useRef<HTMLDivElement>(null);
  const p = usePreferences();
  useEffect(() => {
    setOpen(false);
    setMenu(false);
  }, [closeSignal]);
  useEffect(() => {
    if (menuSignal) {
      setMenu((v) => !v);
      setOpen(false);
    }
  }, [menuSignal]);
  useEffect(() => {
    if (chatSignal) {
      setOpen((v) => !v);
      setMenu(false);
    }
  }, [chatSignal]);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  useEffect(() => {
    const f = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) {
        setOpen(false);
        setMenu(false);
      }
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
        else {
          off = f;
          void import("@tauri-apps/api/event").then(({ emitTo }) =>
            emitTo("main", "global-action", "voice-status"),
          );
        }
      });
    return () => {
      disposed = true;
      off?.();
    };
  }, []);
  useEffect(() => {
    if (!isNative) return;
    let off: (() => void) | undefined,
      disposed = false;
    void import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen<boolean>("pet-chat-busy", (e) => setBusy(e.payload)),
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
    <>
      {p.micIndicator && active && (
        <span
          className="pet-mic-dot"
          aria-label="Microphone active"
          role="img"
          title="Microphone active"
        />
      )}

      <div
        ref={root}
        className={`pet-dock ${visible || open || menu ? "is-visible" : ""} ${open ? "is-open" : ""} ${menu ? "has-menu" : ""}`}
        data-pet-control
      >
        {menu ? (
          <div
            className="pet-context-menu"
            role="menu"
            aria-label="Pet controls"
          >
            <strong>{companionName(p)}</strong>
            {(p.petMode === "sleep" || p.petExpression === "sleeping") && (
              <button
                role="menuitem"
                onClick={() => {
                  updatePreferences({ ...wakeCompanion(p), petMode: "stand" });
                  setMenu(false);
                }}
              >
                <Icon name="sun" />
                Wake up
              </button>
            )}
            <button
              role="menuitem"
              onClick={() => {
                if (!p.petEdit) cancelCompanionTask();
                updatePreferences({ petEdit: !p.petEdit });
                setMenu(false);
              }}
            >
              <Icon name="pencil" />
              {p.petEdit ? "Finish editing" : "Edit size & position"}
            </button>
            <button
              role="menuitem"
              onClick={() => {
                cancelCompanionTask();
                updatePreferences({
                  petScale: 1,
                  petMode: "stand",
                  petEdit: false,
                  petAvoiding: false,
                  clickThrough: false,
                });
                if (isNative) void emit("global-action", "reset");
                setMenu(false);
              }}
            >
              <Icon name="sun" />
              Reset size & find pet
            </button>
            <button
              role="menuitem"
              onClick={() => {
                void emit("pet-message", "come to the center of the screen");
                setMenu(false);
              }}
            >
              <Icon name="pin" />
              Come to center
            </button>
            <button
              role="menuitem"
              onClick={() => {
                cancelCompanionTask();
                updatePreferences({
                  ...wakeCompanion(p),
                  petMode: p.petMode === "auto" ? "stand" : "auto",
                });
                setMenu(false);
              }}
            >
              <Icon name="moon" />
              {p.petMode === "auto" ? "Stay here" : "Move freely"}
            </button>
          </div>
        ) : null}
        {open ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim() && !busy) {
                void emit("pet-message", text.trim());
                setText("");
                requestAnimationFrame(() => input.current?.focus());
              }
            }}
          >
            <textarea
              ref={input}
              rows={2}
              wrap="soft"
              aria-label="Message your companion"
              placeholder="Tell me anything…"
              value={text}
              maxLength={4000}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setOpen(false);
                }
              }}
            />
            <button aria-label="Send message" disabled={!text.trim() || busy}>
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
              aria-label={
                p.petEdit ? "Lock pet position" : "Unlock pet editing"
              }
              title={p.petEdit ? "Lock position" : "Drag & resize"}
              onClick={() => {
                if (!p.petEdit) cancelCompanionTask();
                updatePreferences({ petEdit: !p.petEdit });
              }}
            >
              <Icon name="pencil" />
            </button>
          </>
        )}
      </div>
    </>
  );
}
