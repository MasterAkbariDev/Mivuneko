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
import { SettingsHome } from "./SettingsHome";
import { SpeechDownloadDock } from "./speechDownloads";
import { matchesShortcut } from "../../../packages/shared-schemas/shortcuts.ts";
import { useVoice } from "./useVoice";
import { useOpenMic } from "./useOpenMic";
import { MicButton } from "./MicButton";
import { Markdown } from "./Markdown";
import { speakable } from "../../../packages/shared-schemas/speech.ts";
import { setSpeechContext } from "./speechContext";
import { loadHistory, saveHistory, clearHistory } from "./history";
import {
  parseHistory,
  type ChatMessage,
} from "../../../packages/shared-schemas/history.ts";
import { publishPet } from "./session";
import { CharacterStudio } from "./CharacterStudio";
import { usePreferences, updatePreferences } from "./preferences";
import { broker, isNative } from "./broker";
import { voiceDecision } from "../../../packages/shared-schemas/voice-decision.ts";

const tabs = [
  "Conversations",
  "Characters",
  "Activity",
  "Permissions",
  "Settings",
] as const;
export function App() {
  const preferences = usePreferences();
  const [showApps, setShowApps] = useState(false);
  const [tab, setTab] = useState<string>(
      ["Settings", "Characters"].includes(
        new URLSearchParams(location.search).get("tab") ?? "",
      )
        ? new URLSearchParams(location.search).get("tab")!
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
    [error, setError] = useState(""),
    [approvalError, setApprovalError] = useState(""),
    [streaming, setStreaming] = useState(""),
    [openMicActive, setOpenMicActive] = useState(false),
    [liveTranscript, setLiveTranscript] = useState("");
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
  }, [messages, busy, tab, streaming, liveTranscript]);
  const [historyReady, setHistoryReady] = useState(false);
  const voice = useVoice(
    (text) => {
      void send(text);
    },
    setMood,
    setError,
  );
  const openMic = useOpenMic(
    openMicActive &&
      preferences.voice === "open-mic" &&
      isNative &&
      tab === "Conversations" &&
      !onboard,
    busy || !!pending || !historyReady,
    voice.speaking,
    setLiveTranscript,
    (text) => {
      void send(text);
    },
    (message) => {
      setError(message);
      if (
        message.startsWith("Microphone unavailable") ||
        message.startsWith("Recording limit reached")
      )
        setOpenMicActive(false);
    },
    () => void voice.stop(),
    setInput,
  );
  useEffect(() => {
    if (preferences.voice !== "open-mic") setOpenMicActive(false);
    const hidden = () => {
      if (document.hidden) setOpenMicActive(false);
    };
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, [preferences.voice]);
  const approvalVoice = useVoice(
    (text) => {
      const decision = voiceDecision(text);
      if (decision === null)
        setApprovalError(
          `I heard “${text}”. Say “approve” or “deny”, or use the buttons.`,
        );
      else void resolve(decision);
    },
    () => {},
    setApprovalError,
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
    const lastReply = messages.filter((m) => m.role === "assistant").at(-1);
    setSpeechContext(lastReply?.text ?? "");
    publishPet(
      mood,
      latest?.role === "assistant" ? speakable(latest) : "Thinking…",
    );
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
  async function applyApproval(request: LaunchRequest) {
    if (preferences.approvalMode === "ask") {
      setApprovalError("");
      setPending(request);
      setMood("concerned");
      log(`Approval requested: ${request.app.name}`);
      return;
    }
    const allow = preferences.approvalMode === "auto";
    const result = await broker.resolveLaunch(request.id, allow);
    add(result.message);
    log(
      `${allow ? "Automatically approved" : "Automatically denied"}: ${request.app.name}. ${result.message}`,
    );
    setMood(result.ok ? "celebrating" : "idle");
  }
  async function send(text = input) {
    if (!text.trim() || busy || pending || !historyReady || turnActive.current)
      return;
    if (text.length > 4000) {
      setError("Messages are limited to 4000 characters.");
      return;
    }
    setInput("");
    setStreaming("");
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
        (partial) => {
          if (!c.signal.aborted) setStreaming(partial);
        },
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
        await applyApproval(p);
      } else {
        setMood(reply.mood ?? "happy");
        if (preferences.voice !== "off" && isNative)
          void voice.speak(speakable(reply), preferences.volume, reply.mood);
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
        setStreaming("");
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
      await applyApproval(request);
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
    void approvalVoice.stop();
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
    setOpenMicActive(false);
    setLiveTranscript("");
    turnActive.current = false;
    await voice.stop();
    await approvalVoice.stop();
    setPending(null);
    await broker.revoke();
    setBusy(false);
    setMood("idle");
    log(
      "Stopped; pending approvals revoked. Already launched apps remain open.",
    );
  }
  const shortcutActions = useRef<Record<string, () => void>>({});
  shortcutActions.current = {
    stop: () => void stop(),
    chat: () => setTab("Conversations"),
    characters: () => setTab("Characters"),
    settings: () => setTab("Settings"),
    record: () => {
      if (busy || pending || onboard) return;
      if (preferences.voice === "open-mic") {
        if (openMic.phase === "hearing") openMic.finish();
        else setOpenMicActive((active) => !active);
      } else if (preferences.voice === "push-to-talk")
        voice.recording ? voice.finishRecording() : void voice.record();
      else
        setError(
          "Choose Push to talk or Open mic in Settings → Voice & input first.",
        );
    },
  };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        event.isComposing ||
        (event.target as HTMLElement)?.closest("[data-shortcut-capture]")
      )
        return;
      for (const [action, chord] of Object.entries(preferences.shortcuts))
        if (matchesShortcut(event, chord)) {
          event.preventDefault();
          shortcutActions.current[action]?.();
          break;
        }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [preferences.shortcuts]);
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--text-scale",
      String(preferences.textScale),
    );
  }, [preferences.textScale]);
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
                    (
                      ["chat", "cat", "activity", "shield", "settings"] as const
                    )[i]
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
                : tab === "Settings" || tab === "Characters"
                  ? "A space that feels like you."
                  : "Your companion, with you in control."}
            </p>
          </div>
          <span className="status">
            <span className="dot" />{" "}
            {preferences.backend === "auto"
              ? "Gemini + Groq"
              : preferences.backend === "hermes"
                ? "Hermes local"
                : "Offline utilities"}{" "}
            · {isNative ? "Desktop" : "Browser preview"}
          </span>
        </header>
        {tab === "Conversations" ? (
          <div className="workspace">
            <CompanionCard onSettings={() => setTab("Characters")} />
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
                    {m.role === "assistant" ? (
                      <Markdown text={m.text} />
                    ) : (
                      <p>{m.text}</p>
                    )}
                  </div>
                ))}
                {liveTranscript && !busy ? (
                  <div className="message user" aria-live="polite">
                    <small>YOU · listening</small>
                    <p>{liveTranscript}</p>
                  </div>
                ) : null}
                {busy && streaming ? (
                  <div className="message assistant">
                    <small>Mivuneko</small>
                    <p>{streaming}</p>
                  </div>
                ) : null}
                {busy && !streaming ? (
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
                    {openMicActive && openMic.working
                      ? "transcribing locally"
                      : openMicActive && !busy && !voice.speaking
                        ? "open mic on"
                        : voice.recording
                          ? "microphone recording"
                          : voice.preparing
                            ? "preparing voice…"
                            : voice.speaking
                              ? "speaking"
                              : preferences.voice === "off"
                                ? "text only"
                                : preferences.voiceProvider === "gemini"
                                  ? "Gemini voice"
                                  : "local voice"}
                  </small>
                  {preferences.voice === "open-mic" && (
                    <MicButton
                      active={openMicActive}
                      phase={openMic.phase}
                      waiting={busy || !!pending}
                      speaking={voice.speaking}
                      disabled={!isNative}
                      onClick={() => {
                        setError("");
                        setOpenMicActive((active) => !active);
                      }}
                    />
                  )}
                  {preferences.voice === "open-mic" && openMicActive && (
                    <button
                      type="button"
                      disabled={
                        openMic.phase !== "hearing" || busy || !!pending
                      }
                      onClick={() => openMic.finish()}
                    >
                      Done speaking
                    </button>
                  )}
                  {preferences.voice !== "open-mic" && (
                    <button
                      type="button"
                      title={
                        !isNative
                          ? "Recording requires the native app"
                          : preferences.voice !== "push-to-talk"
                            ? "Enable push-to-talk in Characters"
                            : busy || pending
                              ? "Wait for the current request"
                              : "Record your voice"
                      }
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
                  )}
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
                {openMicActive && (
                  <span>
                    Open mic is on. Speech is transcribed locally; completed
                    phrases are sent to the selected conversation provider.{" "}
                  </span>
                )}
                {preferences.approvalMode === "auto"
                  ? "Recognized app launches are automatically approved."
                  : preferences.approvalMode === "deny"
                    ? "App launches are denied."
                    : "App launch approval follows your Permissions setting."}
              </p>
            </section>
          </div>
        ) : tab === "Characters" ? (
          <CharacterStudio />
        ) : (
          <section className="page">
            <h2>
              {tab === "Activity"
                ? "Activity log"
                : tab === "Permissions"
                  ? "Access and approvals"
                  : "Your preferences"}
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
                  Choose how recognized application launches are handled in
                  Assist and Autonomous modes.
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
                <label className="setting">
                  Approval mode
                  <select
                    aria-label="Approval mode"
                    value={preferences.approvalMode}
                    disabled={busy || !!pending}
                    onChange={(e) =>
                      updatePreferences({
                        approvalMode: e.target
                          .value as typeof preferences.approvalMode,
                      })
                    }
                  >
                    <option value="ask">Approve each request</option>
                    <option value="auto">
                      Automatically approve app launches
                    </option>
                    <option value="deny">Deny app launches</option>
                  </select>
                </label>
                <p>
                  Automatic approval opens recognized installed apps without
                  asking. Shell commands and arbitrary paths remain unavailable.
                </p>
                <p>
                  Microphone access starts when you use Record or Start open mic
                  in the native app with system permission. Screenshots,
                  accessibility, shell and arbitrary file access are
                  unavailable.
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
                <SettingsHome />
                <button type="button" onClick={() => setTab("Characters")}>
                  Open character studio
                </button>
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
      <SpeechDownloadDock />
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
            <button
              type="button"
              disabled={!isNative || preferences.voice === "off"}
              onClick={() =>
                approvalVoice.recording
                  ? approvalVoice.finishRecording()
                  : void approvalVoice.record()
              }
            >
              {approvalVoice.recording
                ? "Finish voice decision"
                : "Decide by voice"}
            </button>
            <p>
              Say “approve” or “deny”.{" "}
              {preferences.voice === "off"
                ? "Enable a voice mode in Characters first."
                : ""}
            </p>
            {approvalError && (
              <p className="error" role="alert">
                {approvalError}
              </p>
            )}
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
              <li>
                Expressive 2D and 3D companions with expressions and effects
              </li>
              <li>
                App launches ask first by default; change this in Permissions
              </li>
              <li>
                Microphone starts only when you choose Record or Start open mic;
                history is opt-in
              </li>
            </ul>
            <p>
              Choose a companion in Characters, then connect your conversation
              provider and microphone in Settings. Voice starts only when you
              turn it on.
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
