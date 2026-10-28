import { CompanionCard } from "./CompanionCard";
import { Icon } from "./Icon";
import { useActivity, logActivity } from "./activity";
import { useConversation } from "./conversation";
import { useEffect, useRef, useState } from "react";
import type {
  LaunchRequest,
  AppInfo,
  Mode,
  Mood,
} from "../../../packages/shared-schemas/index.ts";
import { agentFor } from "./agent";
import { InstalledApps } from "./InstalledApps";
import { BackendSettings } from "./BackendSettings";
import { useVoice } from "./useVoice";
import { loadHistory, saveHistory, clearHistory } from "./history";
import {
  parseHistory,
  type ChatMessage,
} from "../../../packages/shared-schemas/history.ts";
import { publishPet } from "./session";
import { PetSettings } from "./PetSettings";
import { usePreferences, updatePreferences } from "./preferences";
import { broker, isNative } from "./broker";

const tabs = ["Conversations", "Activity", "Permissions", "Settings"] as const;
export function App() {
  const preferences = usePreferences();
  const [showApps, setShowApps] = useState(false);
  const [tab, setTab] = useState<string>(
      new URLSearchParams(location.search).get("tab") === "Settings"
        ? "Settings"
        : "Conversations",
    ),
    [mode, setMode] = useState<Mode>("Assist"),
    [mood, setMood] = useState<Mood>("idle");
  const [messages, setMessages] = useConversation();
  useEffect(() => {
    if (!isNative) return;
    let disposed = false;
    let off: (() => void) | undefined;
    void import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen<{ tab: string }>("mivuneko-navigate", (event) => {
          if (tabs.includes(event.payload.tab as (typeof tabs)[number]))
            setTab(event.payload.tab);
        }),
      )
      .then((fn) => {
        if (disposed) fn();
        else off = fn;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      off?.();
    };
  }, []);
  const [logs, setLogs] = useActivity();
  const [input, setInput] = useState(""),
    [pending, setPending] = useState<LaunchRequest | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [onboard, setOnboard] = useState(
    !sessionStorage.getItem("mivuneko-welcome"),
  );
  const enabled = preferences.appLaunching;
  const setEnabled = (value: boolean) =>
    updatePreferences({ appLaunching: value });
  const controller = useRef<AbortController | null>(null);
  const turnActive = useRef(false);
  const messageList = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = messageList.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, busy, tab]);
  const [historyReady, setHistoryReady] = useState(false);
  const voice = useVoice(
    (text) => {
      void send(text);
    },
    setMood,
    setError,
  );
  useEffect(() => {
    let active = true;
    setHistoryReady(false);
    if (
      preferences.rememberHistory &&
      messages.length === 1 &&
      messages[0].text.startsWith("Hi, I’m Mivuneko.")
    ) {
      void loadHistory()
        .then((saved) => {
          if (active) {
            if (saved.length) setMessages(saved);
            setHistoryReady(true);
          }
        })
        .catch((e) => {
          if (active) {
            setError(String(e));
            setHistoryReady(true);
          }
        });
    } else {
      if (!preferences.rememberHistory)
        void clearHistory().catch((e) => setError(String(e)));
      setHistoryReady(true);
    }
    return () => {
      active = false;
    };
  }, [preferences.rememberHistory]);
  useEffect(() => {
    if (!preferences.rememberHistory || !historyReady) return;
    const timer = setTimeout(() => {
      void saveHistory(parseHistory(messages)).catch((e) =>
        setError(String(e)),
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [messages, preferences.rememberHistory, historyReady]);

  useEffect(() => {
    if (preferences.voice === "off") void voice.stop();
  }, [preferences.voice]);
  useEffect(() => {
    const latest = messages.at(-1);
    publishPet(mood, latest?.role === "assistant" ? latest.text : "Thinking…");
  }, [mood, messages]);
  useEffect(() => {
    if (!onboard && !pending && !showApps) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    function trap(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        if (pending) void resolve(false);
        else if (showApps) setShowApps(false);
        else setOnboard(false);
        return;
      }

      if (e.key !== "Tab" || !dialog) return;
      const items = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input,select,textarea,[tabindex="0"]',
        ),
      );
      const first = items[0],
        last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [onboard, pending, showApps]);

  const add = (text: string) =>
    setMessages((m) => [...m, { role: "assistant", text }]);
  const log = logActivity;
  async function send(text = input) {
    if (!text.trim() || busy || pending || !historyReady || turnActive.current)
      return;
    if (text.length > 4000) {
      setError("Messages are limited to 4000 characters.");
      return;
    }
    setInput("");
    setError("");
    setMessages((m) => [...m, { role: "user", text }]);
    turnActive.current = true;
    setBusy(true);
    setMood("thinking");
    const c = new AbortController();
    controller.current = c;
    try {
      if (isNative) {
        await voice.stop();
        c.signal.throwIfAborted();
        if (preferences.voice !== "off") voice.prepare();
        setMood("thinking");
      }
      const reply = await agentFor(preferences.backend).reply(
        text,
        mode,
        c.signal,
        messages,
      );
      c.signal.throwIfAborted();
      add(reply.text);
      if (reply.appQuery) {
        if (!enabled) throw Error("App launching is disabled in Permissions.");
        const apps = await broker.listApps();
        c.signal.throwIfAborted();
        const matches = apps.filter(
          (a) => a.name.toLowerCase() === reply.appQuery!.toLowerCase(),
        );
        if (matches.length !== 1)
          throw Error("No unique installed app matched. Try its exact name.");
        const p = await broker.requestLaunch(matches[0].id);
        if (c.signal.aborted) {
          await broker.revoke();
          return;
        }
        setPending(p);
        log(`Approval requested: ${p.app.name}`);
        setMood("concerned");
      } else {
        setMood(reply.mood ?? "happy");
        if (preferences.voice !== "off" && isNative)
          void voice.speak(reply.text, preferences.volume, reply.mood);
      }
    } catch (e) {
      if (!c.signal.aborted) {
        setError(String(e));
        setMood("error");
        log(String(e));
      }
    } finally {
      if (controller.current === c) {
        turnActive.current = false;
        setBusy(false);
      }
    }
  }
  async function requestApp(app: AppInfo) {
    setShowApps(false);
    setError("");
    if (!enabled || mode === "Chat" || mode === "Creative") {
      setError("Use Assist mode and enable app launching in Permissions.");
      return;
    }
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    try {
      const request = await broker.requestLaunch(app.id);
      if (c.signal.aborted) {
        await broker.revoke();
        return;
      }
      setPending(request);
      setMood("concerned");
      log(`Approval requested: ${app.name}`);
    } catch (e) {
      if (!c.signal.aborted) setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (tab !== "Conversations") void voice.stop();
  }, [tab]);
  async function resolve(allow: boolean) {
    if (!pending) return;
    const p = pending;
    setPending(null);
    setBusy(true);
    try {
      const result = await broker.resolveLaunch(p.id, allow);
      add(result.message);
      log(result.message);
      setMood(result.ok ? "celebrating" : "idle");
    } catch (e) {
      setError(String(e));
      log(String(e));
      setMood("error");
    } finally {
      setBusy(false);
    }
  }
  async function stop() {
    controller.current?.abort();
    turnActive.current = false;
    await voice.stop();
    setPending(null);
    await broker.revoke();
    setBusy(false);
    setMood("idle");
    log(
      "Stopped; pending approvals revoked. Already launched apps remain open.",
    );
  }
  return (
    <div className={preferences.reduced ? "shell reduced" : "shell"}>
      <aside inert={onboard || !!pending || showApps}>
        <div className="brand">
          <Icon name="cat" /> Mivuneko<small>DESKTOP COMPANION</small>
        </div>
        <nav>
          {tabs.map((t, i) => (
            <button
              key={t}
              className={tab === t ? "active" : ""}
              aria-current={tab === t ? "page" : undefined}
              onClick={() => setTab(t)}
            >
              <span>
                <Icon
                  name={
                    (["chat", "activity", "shield", "settings"] as const)[i]
                  }
                />
              </span>
              {t}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-presence">
            <span className="sidebar-avatar">
              <Icon name="cat" />
            </span>
            <div>
              <strong>Mivuneko</strong>
              <small>
                <span className="dot" />
                Here with you
              </small>
            </div>
          </div>
          <small>Your space. Your rules.</small>
          <button onClick={() => setOnboard(true)}>Quick start ↗</button>
        </div>
      </aside>
      <main
        className={
          tab === "Conversations" ? "conversation-main" : "settings-main"
        }
        inert={onboard || !!pending || showApps}
      >
        <header>
          <div>
            <h1>{tab}</h1>
            <p>
              {tab === "Conversations"
                ? "A little company, on your terms."
                : tab === "Settings"
                  ? "A space that feels like you."
                  : "Your companion, with you in control."}
            </p>
          </div>
          <span className="status">
            <span className="dot" />{" "}
            {preferences.backend === "gemini"
              ? "Gemini"
              : preferences.backend === "hermes"
                ? "Hermes local"
                : "Offline demo"}{" "}
            · {isNative ? "Desktop" : "Browser preview"}
          </span>
        </header>
        {tab === "Conversations" ? (
          <div className="workspace">
            <CompanionCard onSettings={() => setTab("Settings")} />
            <section className="chat">
              <div className="chat-head">
                <div>
                  <h3>
                    <span className="chat-avatar">
                      <Icon name="cat" />
                    </span>
                    Mivuneko <span className="dot" />
                  </h3>
                  <small>
                    {preferences.rememberHistory
                      ? "Local conversation history enabled"
                      : "Private session · history is not saved"}
                  </small>
                </div>
                <select
                  aria-label="Companion mode"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as Mode)}
                  disabled={!!pending || busy || voice.recording}
                >
                  {["Chat", "Assist", "Creative", "Autonomous"].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div
                ref={messageList}
                className="messages"
                role="log"
                aria-live="polite"
              >
                {messages.map((m, i) => (
                  <div key={i} className={`message ${m.role}`}>
                    <small>{m.role === "user" ? "YOU" : "Mivuneko"}</small>
                    <p>{m.text}</p>
                  </div>
                ))}
                {busy ? (
                  <p role="status" className="thinking-indicator">
                    <i />
                    <i />
                    <i />
                    <span>Thinking…</span>
                  </p>
                ) : null}
              </div>
              {error ? (
                <p className="error" role="alert">
                  {error}
                </p>
              ) : null}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <label className="sr" htmlFor="message">
                  Message Mivuneko
                </label>
                <textarea
                  id="message"
                  maxLength={4000}
                  placeholder="Tell me something…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                <div className="composer-actions">
                  <small>
                    {mode} mode ·{" "}
                    {voice.recording
                      ? "microphone recording"
                      : voice.speaking
                        ? "speaking"
                        : preferences.voice === "off"
                          ? "text only"
                          : preferences.voiceProvider === "gemini"
                            ? "Gemini voice"
                            : "local voice"}
                  </small>
                  <button
                    type="button"
                    disabled={
                      !isNative ||
                      preferences.voice !== "push-to-talk" ||
                      busy ||
                      !!pending
                    }
                    onClick={() =>
                      voice.recording
                        ? voice.finishRecording()
                        : void voice.record()
                    }
                  >
                    <Icon name="mic" />
                    <span>
                      {voice.recording ? "Finish recording" : "Record"}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={busy || !!pending || voice.recording}
                    onClick={() => setShowApps(true)}
                  >
                    <Icon name="grid" />
                    <span>Apps</span>
                  </button>
                  <button type="button" onClick={() => void stop()}>
                    <Icon name="stop" />
                    <span>Stop</span>
                  </button>
                  <button
                    className="primary"
                    disabled={
                      busy ||
                      !!pending ||
                      !input.trim() ||
                      !historyReady ||
                      voice.recording
                    }
                  >
                    <span>Send</span>
                    <Icon name="send" />
                  </button>
                </div>
              </form>
              <p className="chat-note">
                App access requires your approval. Every time.
              </p>
            </section>
          </div>
        ) : (
          <section className="page">
            <h2>
              {tab === "Activity"
                ? "A transparent trail."
                : tab === "Permissions"
                  ? "You hold the keys."
                  : "Make yourself at home."}
            </h2>
            {tab === "Activity" ? (
              <>
                <p>
                  Session-only tool activity. No message contents in the tool
                  log.
                </p>
                <button
                  onClick={() => {
                    const url = URL.createObjectURL(
                      new Blob([logs.join("\n")], { type: "text/plain" }),
                    );
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "mivuneko-activity.txt";
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Export log
                </button>{" "}
                <button onClick={() => setLogs([])}>Delete log</button>
                <ul>
                  {logs.length ? (
                    logs.map((l, i) => <li key={i}>{l}</li>)
                  ) : (
                    <li>No tools have run this session.</li>
                  )}
                </ul>
              </>
            ) : tab === "Permissions" ? (
              <>
                <p>
                  Assist and Autonomous can request launches. Neither bypasses
                  approval.
                </p>
                <label className="setting">
                  App launching{" "}
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={async (e) => {
                      setEnabled(e.target.checked);
                      await stop();
                    }}
                  />
                </label>
                <p>
                  Microphone is available only through Record in the native app
                  with system permission. Screenshots, accessibility, shell and
                  arbitrary file access are unavailable.
                </p>
                <button
                  onClick={async () => {
                    setEnabled(false);
                    await stop();
                  }}
                >
                  Revoke all pending approvals
                </button>
              </>
            ) : (
              <>
                <BackendSettings />
                <PetSettings />
                <label className="setting">
                  Language{" "}
                  <select aria-label="Language">
                    <option>English · en-US</option>
                  </select>
                </label>
                <p>
                  Characters: original prototypes / imported VRM. Voice and
                  provider behavior follow your settings above.
                </p>
                <p>
                  Hermes credentials stay in your environment or macOS Keychain.
                  The optional voice helper configures a local whisper.cpp
                  model.
                </p>
                <button
                  onClick={() => {
                    setMessages([]);
                    void clearHistory().catch((e) => setError(String(e)));
                    setLogs([]);
                    void stop();
                  }}
                >
                  Delete session history
                </button>
              </>
            )}
          </section>
        )}
      </main>
      {showApps ? (
        <InstalledApps
          onClose={() => setShowApps(false)}
          onRequest={(app) => void requestApp(app)}
        />
      ) : null}
      {pending ? (
        <div className="scrim">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="approval-title"
            className="modal"
          >
            <span className="modal-icon">
              <Icon name="shield" />
            </span>
            <h2 id="approval-title">Open {pending.app.name}?</h2>
            <p>Mivuneko requests a one-time app launch in {mode} mode.</p>
            <dl>
              <dt>Target</dt>
              <dd>
                {pending.app.name}
                <small>{pending.app.location}</small>
              </dd>
              <dt>Data affected</dt>
              <dd>Starts an app process. No messages or files are read.</dd>
            </dl>
            <p>
              {isNative
                ? "This will open an application on this computer."
                : "Browser preview: this will simulate the launch."}
            </p>
            <div className="actions">
              <button autoFocus onClick={() => void resolve(false)}>
                Deny
              </button>
              <button className="primary" onClick={() => void resolve(true)}>
                Allow once
              </button>
            </div>
            <button onClick={() => void stop()}>Cancel request</button>
          </section>
        </div>
      ) : null}
      {onboard ? (
        <div className="scrim">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="welcome"
          >
            <span className="modal-icon">
              <Icon name="cat" />
            </span>
            <h2 id="welcome">
              A little company.
              <br />
              On your terms.
            </h2>
            <p>Meet Mivuneko, your little desktop companion.</p>
            <ul>
              <li>Original illustrated companion, with 3D and VRM options</li>
              <li>One-time approval before each app launch</li>
              <li>Microphone only when you press Record; history is opt-in</li>
            </ul>
            <p>
              Use Assist mode and type “Open Telegram”. Browser previews
              simulate apps; Windows builds discover a small allowlisted
              catalog.
            </p>
            <button
              autoFocus
              className="primary"
              onClick={() => {
                sessionStorage.setItem("mivuneko-welcome", "1");
                setOnboard(false);
              }}
            >
              Meet Mivuneko →
            </button>
          </section>
        </div>
      ) : null}
    </div>
  );
}
