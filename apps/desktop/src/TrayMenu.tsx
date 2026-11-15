import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";
import { usePreferences } from "./preferences";
import { companionName } from "./companionName";
export function TrayMenu() {
  const p = usePreferences(),
    [error, setError] = useState(""),
    [microphone, setMicrophone] = useState(false),
    menu = useRef<HTMLDivElement>(null);
  async function act(action: string) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("tray_action", { action });
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => {
    let disposed = false;
    let off: (() => void) | undefined;
    void import("@tauri-apps/api/event")
      .then(async ({ listen, emitTo }) => {
        const cleanup = await listen<boolean>("voice-active", (e) =>
          setMicrophone(e.payload),
        );
        if (disposed) {
          cleanup();
          return;
        }
        off = cleanup;
        await emitTo("main", "global-action", "voice-status");
      })
      .catch(() => {});
    return () => {
      disposed = true;
      off?.();
    };
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        void act("dismiss");
        return;
      }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        const items = Array.from(
          menu.current?.querySelectorAll<HTMLButtonElement>("button") ?? [],
        );
        const current = items.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        const index =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? items.length - 1
              : (current + (e.key === "ArrowDown" ? 1 : -1) + items.length) %
                items.length;
        items[index]?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const rows: { action: string; icon: IconName; label: string }[] = [
    { action: "chat", icon: "chat", label: "Open chat" },
    { action: "pet", icon: "search", label: "Find companion" },
    { action: "voice", icon: "mic", label: "Microphone" },
    { action: "edit", icon: "pencil", label: "Edit companion" },
    { action: "settings", icon: "settings", label: "Settings" },
    { action: "reset", icon: "frame", label: "Reset size & position" },
    { action: "hide", icon: "eye-off", label: "Hide companion" },
    { action: "quit", icon: "power", label: "Quit" },
  ];
  return (
    <main className="tray-popup">
      <header>
        <Icon name="cat" />
        <div>
          <strong>Mivuneko</strong>
          <small>{companionName(p)}</small>
        </div>
      </header>
      <div
        className="tray-menu"
        role="menu"
        aria-label="Mivuneko menu"
        ref={menu}
      >
        {rows.map(({ action, icon, label }) => (
          <button
            role="menuitem"
            key={action}
            className={`tray-${action}`}
            onClick={() => void act(action)}
          >
            <Icon name={icon} />
            <span>{label}</span>
            {action === "voice" && (
              <i
                className={`tray-switch ${microphone ? "is-on" : ""}`}
                aria-label={microphone ? "Microphone active" : "Microphone off"}
              />
            )}
          </button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
