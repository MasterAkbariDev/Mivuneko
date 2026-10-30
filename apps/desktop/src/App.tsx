import { CharacterGuide } from "./CharacterGuide";
import { wakeCompanion } from "../../../packages/shared-schemas/companion-wake";
import { performCompanionActions } from "./performCompanionActions";
import {
  companionSequence,
  describeAction,
  runCompanionSequence,
} from "../../../packages/shared-schemas/companion-actions";
import { companionName } from "./companionName";
import {
  desktopIntent,
  matchApps,
} from "../../../packages/shared-schemas/desktop-intent";
import {
  cancelCompanionTask,
  directCompanion,
  moveCompanion,
} from "./companionTask";
import { ScreenAssistant } from "./ScreenAssistant";
import { CompanionCard } from "./CompanionCard";
import { Icon } from "./Icon";
import { useActivity, logActivity } from "./activity";
import { useConversation } from "./conversation";
import { useEffect, useRef, useState } from "react";
import { markTurn, startTurn } from "./metrics";
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
import { broker, getLaunchPolicy, isNative, setLaunchPolicy } from "./broker";
import { voiceDecision } from "../../../packages/shared-schemas/voice-decision.ts";

const tabs = [
  "Conversations",
  "Characters",
  "Activity",
  "Permissions",
  "Settings",
] as const;
export function App() {
  const [screenRequest, setScreenRequest] = useState<string | null>(null);
  const preferences = usePreferences();
  const name = companionName(preferences);
  const chainActive = useRef(false);
  const movementReply = useRef<{ at: number; text: string } | null>(null);
  const [codeReveal, setCodeReveal] = useState(0);
  const [showApps, setShowApps] = useState(false);
  const [tab, setTab] = useState<string>(
      ["Settings", "Characters", "Character guide"].includes(
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
  const [onboard, setOnboard] = useState(false);
  const enabled = preferences.appLaunching;
  const setEnabled = (value: boolean) =>
    updatePreferences({ appLaunching: value });
  // The native broker enforces the launch policy; these preferences only mirror it.
  // First run migrates the stored preference into Rust, afterwards Rust wins.
  const policySynced = useRef(false);
  useEffect(() => {
    void getLaunchPolicy()
      .then((native) => {
        if (native?.stored)
          updatePreferences({
            appLaunching: native.enabled,
            approvalMode: native.mode,
          });
        else if (native)
          return setLaunchPolicy({
            enabled: preferences.appLaunching,
            mode: preferences.approvalMode,
          });
      })
      .catch(() => {})
      .finally(() => {
        policySynced.current = true;
      });
  }, []);
  useEffect(() => {
    if (!policySynced.current) return;
    void setLaunchPolicy({
      enabled: preferences.appLaunching,
      mode: preferences.approvalMode,
    }).catch((e) => setError(String(e)));
  }, [preferences.appLaunching, preferences.approvalMode]);
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
    { measureTurn: true },
  );
  const openMic = useOpenMic(
    openMicActive && preferences.voice === "open-mic" && isNative && !onboard,
    !!pending ||
      !historyReady ||
      !!screenRequest ||
      (!preferences.bargeIn && (busy || voice.preparing)),
    voice.speaking || voice.preparing || busy,
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
    () => void interrupt(),
    setInput,
  );
  useEffect(() => {
    if (preferences.voice !== "open-mic") setOpenMicActive(false);
    const hidden = () => {
      if (document.hidden && !isNative) setOpenMicActive(false);
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
    const policy = request.policy ?? preferences.approvalMode;
    if (policy === "ask") {
      setApprovalError("");
      setPending(request);
      setMood("concerned");
      log(`Approval requested: ${request.app.name}`);
      return;
    }
    const allow = policy === "auto";
    const result = await broker.resolveLaunch(request.id, allow);
    add(result.message);
    log(
      `${allow ? "Automatically approved" : "Automatically denied"}: ${request.app.name}. ${result.message}`,
    );
    setMood(result.ok ? "celebrating" : "idle");
  }
  async function send(text = input) {
    if (
      /^(?:please\s+)?(?:stop (?:talking|speaking)|be quiet|quiet please|pause (?:your )?(?:voice|speech))\s*[.!?]*$/i.test(
        text.trim(),
      )
    ) {
      setInput("");
      await interrupt();
      return;
    }
    if (
      !text.trim() ||
      busy ||
      pending ||
      screenRequest ||
      !historyReady ||
      turnActive.current
    )
      return;
    if (text.length > 4000) {
      setError("Messages are limited to 4000 characters.");
      return;
    }
    updatePreferences(wakeCompanion(preferences));
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
      const sequence = companionSequence(text);
      if (sequence) {
        if (sequence.error) throw Error(sequence.error);
        if (!isNative)
          throw Error("Ordered desktop actions run in the desktop app.");
        add(`I'll ${sequence.actions.map(describeAction).join(", then ")}.`);
        setMood("happy");
        chainActive.current = true;
        try {
          await performCompanionActions(sequence.actions, c.signal);
        } finally {
          chainActive.current = false;
        }
        const final = sequence.actions[sequence.actions.length - 1];
        const message =
          final.kind === "sit"
            ? "Done. I'm sitting here."
            : "Done. I finished those actions in order.";
        add(message);
        setMood("happy");
        return;
      }
      const intent = desktopIntent(text);
      if (intent?.kind === "hide") {
        if (!isNative)
          throw Error("Desktop movement is available in the installed app.");
        add(
          "I'll step out of view. Use Show pet in the tray to bring me back.",
        );
        await performCompanionActions([intent], c.signal);
        return;
      }
      if (intent?.kind === "expression") {
        await performCompanionActions([intent], c.signal);
        add(
          intent.expression === "auto"
            ? "I'll choose my expressions naturally again."
            : `Showing ${intent.expression}.`,
        );
        setMood("happy");
        return;
      }
      if (intent?.kind === "locate") {
        if (!isNative) throw Error("Find pet is available in the desktop app.");
        const { invoke } = await import("@tauri-apps/api/core");
        const p = await invoke<{ monitor?: string }>("recover_pet", {
          center: false,
        });
        add(
          `I'm here on ${p.monitor || "your current monitor"}. I've made sure I'm visible.`,
        );
        setMood("happy");
        return;
      }
      if (intent?.kind === "screen") {
        setScreenRequest(text);
        setMood("idle");
        return;
      }
      if (
        intent?.kind === "stand" ||
        intent?.kind === "sit" ||
        intent?.kind === "automatic" ||
        intent?.kind === "move"
      ) {
        if (intent.kind === "move") {
          if (isNative) {
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke("recover_pet", { center: false });
          }
          const at = directCompanion(intent.destination);
          movementReply.current = {
            at,
            text:
              intent.destination === "unobtrusive"
                ? "I'll move to a quiet edge and stay out of your way."
                : `Moving ${intent.destination.startsWith("monitor-") ? "to your requested monitor" : intent.destination === "elsewhere" ? "to another spot" : `toward the ${intent.destination}`}.`,
          };
        } else cancelCompanionTask();
        updatePreferences({
          ...(intent.kind === "move"
            ? { petEdit: false, focus: false, monitor: "current" }
            : {}),
          petAvoiding:
            intent.kind === "move" && intent.destination === "unobtrusive",
          petMode:
            intent.kind === "stand"
              ? "stand"
              : intent.kind === "sit"
                ? "sit"
                : intent.kind === "automatic"
                  ? "auto"
                  : intent.gait,
        });
        add(
          intent.kind === "stand"
            ? "Standing up."
            : intent.kind === "sit"
              ? "I'll sit here."
              : intent.kind === "automatic"
                ? "I'll choose when to move and rest again."
                : intent.destination === "unobtrusive"
                  ? "I'll move to a quiet edge and stay out of your way."
                  : `Moving ${intent.destination.startsWith("monitor-") ? "to your requested monitor" : intent.destination === "elsewhere" ? "to another spot" : `toward the ${intent.destination}`}.`,
        );
        setMood("happy");
        return;
      }
      startTurn(preferences.backend);
      let streamedMood = false;
      const reply = await agentFor(preferences.backend, name).reply(
        text,
        mode,
        c.signal,
        messages,
        (partial, meta) => {
          if (c.signal.aborted) return;
          // The tagged header names the emotion before any text: show it right away.
          if (meta?.emotion && !streamedMood) {
            streamedMood = true;
            setMood(meta.emotion);
          }
          if (partial.trim()) markTurn("turn.first_text");
          setStreaming(partial);
        },
        { format: preferences.replyFormat },
      );
      c.signal.throwIfAborted();
      markTurn("turn.first_text");
      markTurn("turn.reply_done");
      add(reply.text);
      if (reply.companionActions?.length) {
        if (!isNative)
          throw Error("Desktop actions require the installed app.");
        setMood(reply.mood ?? "happy");
        if (preferences.voice !== "off")
          void voice.speak(
            speakable(reply, false),
            preferences.volume,
            reply.mood,
          );
        chainActive.current = true;
        try {
          await performCompanionActions(reply.companionActions, c.signal);
        } finally {
          chainActive.current = false;
        }
        add("Done. I finished the requested companion actions.");
        return;
      }
      const hasCode = /```|~~~/.test(reply.text);
      let codeShown = hasCode;
      if (hasCode) {
        setTab("Conversations");
        setCodeReveal((v) => v + 1);
        if (isNative) {
          try {
            const { getCurrentWindow } = await import("@tauri-apps/api/window");
            await getCurrentWindow().show();
            await getCurrentWindow().setFocus();
          } catch {
            codeShown = false;
            setError(
              "The code is saved, but the conversation window could not be shown.",
            );
          }
        }
      }
      if (reply.appQuery) {
        if (!enabled) throw Error("App launching is disabled in Permissions.");
        const apps = await broker.listApps();
        c.signal.throwIfAborted();
        const matches = matchApps(reply.appQuery, apps);
        if (matches.length !== 1)
          throw Error(
            matches.length
              ? `Several apps match: ${matches
                  .slice(0, 5)
                  .map((a) => a.name)
                  .join(", ")}. Use the full name or Installed apps.`
              : "No unique installed app matched. Try its exact name or open Installed apps.",
          );
        const p = await broker.requestLaunch(matches[0].id);
        if (c.signal.aborted) {
          await broker.revoke();
          return;
        }
        await applyApproval(p);
      } else {
        setMood(reply.mood ?? "happy");
        if (preferences.voice !== "off" && isNative)
          void voice.speak(
            speakable(reply, codeShown),
            preferences.volume,
            reply.mood,
          );
      }
    } catch (e) {
      if (
        !c.signal.aborted &&
        !(e instanceof DOMException && e.name === "AbortError")
      ) {
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
  async function interrupt() {
    controller.current?.abort();
    if (chainActive.current) {
      cancelCompanionTask();
      updatePreferences({ petMode: "stand" });
    }
    turnActive.current = false;
    setBusy(false);
    setStreaming("");
    await voice.stop();
    setMood("idle");
  }
  async function stop() {
    controller.current?.abort();
    cancelCompanionTask();
    if (["walk", "run", "auto"].includes(preferences.petMode))
      updatePreferences({ petMode: "stand" });
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
  const globalKeyAt = useRef(0);
  const shortcutActions = useRef<Record<string, () => void>>({});
  shortcutActions.current = {
    stop: () => void stop(),
    reset: () => {
      if (chainActive.current) controller.current?.abort();
      cancelCompanionTask();
      updatePreferences({
        petScale: 1,
        petMode: "stand",
        petEdit: false,
        petAvoiding: false,
        clickThrough: false,
      });
      if (isNative)
        void import("@tauri-apps/api/core").then(({ invoke }) =>
          invoke("recover_pet", { center: true }),
        );
    },
    "voice-status": () => {
      if (isNative)
        void import("@tauri-apps/api/event").then(({ emit }) =>
          emit("voice-active", openMicActive || voice.recording),
        );
    },
    "voice-toggle": () => {
      setOnboard(false);
      if (openMicActive || voice.recording) {
        setOpenMicActive(false);
        void voice.stop();
      } else {
        updatePreferences({ voice: "open-mic" });
        setOpenMicActive(true);
      }
    },
    edit: () => {
      if (!preferences.petEdit) cancelCompanionTask();
      updatePreferences({ petEdit: !preferences.petEdit, clickThrough: false });
    },
    clickThrough: () =>
      updatePreferences({ clickThrough: !preferences.clickThrough }),
    focus: () => updatePreferences({ focus: !preferences.focus }),
    screen: () => {
      setTab("Conversations");
      setScreenRequest("Help me understand what is on my screen.");
    },
    chat: () => setTab("Conversations"),
    characters: () => setTab("Characters"),
    settings: () => setTab("Settings"),
    record: () => {
      if (busy || pending) return;
      setOnboard(false);
      if (preferences.voice === "open-mic") {
        if (openMic.phase === "hearing") openMic.finish();
        else setOpenMicActive((active) => !active);
      } else if (preferences.voice === "push-to-talk")
        voice.recording ? voice.finishRecording() : void voice.record();
      else {
        updatePreferences({ voice: "open-mic" });
        setOpenMicActive(true);
      }
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
          if (isNative && event.key !== "Escape")
            setTimeout(() => {
              if (Date.now() - globalKeyAt.current > 100)
                shortcutActions.current[action]?.();
            }, 70);
          else shortcutActions.current[action]?.();
          break;
        }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [preferences.shortcuts]);
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    if (!isNative) return;
    let disposed = false;
    const offs: Array<() => void> = [];
    void import("@tauri-apps/api/event").then(async ({ listen }) => {
      for (const [name, fn] of [
        [
          "global-action",
          (value: unknown) => {
            globalKeyAt.current = Date.now();
            shortcutActions.current[String(value)]?.();
          },
        ],
        [
          "pet-move-result",
          (value: unknown) => {
            const r = value as { at: number; state: string; message: string };
            const pending = movementReply.current;
            if (
              pending?.at === r.at &&
              ["failed", "arrived", "cancelled"].includes(r.state)
            ) {
              setMessages((list) => {
                let index = -1;
                list.forEach((m, i) => {
                  if (m.role === "assistant" && m.text === pending.text)
                    index = i;
                });
                if (index < 0) return list;
                return list.map((m, i) =>
                  i === index
                    ? {
                        role: "assistant",
                        text:
                          r.state === "arrived"
                            ? "I'm here."
                            : r.state === "cancelled"
                              ? "Stopped."
                              : `I couldn't move there: ${r.message}`,
                      }
                    : m,
                );
              });
              movementReply.current = null;
            }
            if (r.state === "failed") {
              setError(r.message);
              publishPet("concerned", r.message);
            } else if (r.state === "arrived") publishPet("happy", r.message);
          },
        ],
        [
          "pet-message",
          (value: unknown) => {
            if (typeof value === "string") void sendRef.current(value);
          },
        ],
      ] as const) {
        const off = await listen(name, (event) => fn(event.payload));
        if (disposed) off();
        else offs.push(off);
      }
    });
    return () => {
      disposed = true;
      offs.forEach((f) => f());
    };
  }, []);
  useEffect(() => {
    if (!isNative) return;
    void import("@tauri-apps/api/core")
      .then(({ invoke }) =>
        invoke<string[]>("configure_global_shortcuts", {
          bindings: preferences.shortcuts,
        }),
      )
      .then((errors) => {
        if (Array.isArray(errors) && errors.length)
          setError(errors.join(" · "));
        window.dispatchEvent(
          new CustomEvent("shortcut-status", {
            detail: Array.isArray(errors) ? errors : [],
          }),
        );
      })
      .catch((e) => setError(`Shortcuts: ${String(e)}`));
  }, [preferences.shortcuts]);
  useEffect(() => {
    if (!isNative) return;
    void import("@tauri-apps/api/event").then(({ emit }) =>
      emit("voice-active", openMicActive || voice.recording),
    );
  }, [openMicActive, voice.recording]);
  useEffect(() => {
    if (!codeReveal || busy || tab !== "Conversations") return;
    const timer = setTimeout(() => {
      const list = messageList.current,
        code = list?.querySelector<HTMLElement>(
          ".message.assistant:last-of-type .md-code",
        );
      const panels = list?.querySelectorAll<HTMLElement>(".md-code");
      const panel =
        code ?? (panels?.length ? panels[panels.length - 1] : undefined);
      if (list && panel) {
        list.scrollTo({
          top:
            list.scrollTop +
            panel.getBoundingClientRect().top -
            list.getBoundingClientRect().top -
            18,
          behavior: preferences.reduced ? "instant" : "smooth",
        });
        panel.classList.remove("code-revealed");
        requestAnimationFrame(() => panel.classList.add("code-revealed"));
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [codeReveal, busy, tab]);
  useEffect(() => {
    if (!isNative) return;
    void import("@tauri-apps/api/event").then(({ emit }) =>
      emit(
        "pet-chat-busy",
        busy || !!pending || !!screenRequest || !historyReady,
      ),
    );
  }, [busy, pending, screenRequest, historyReady]);
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
              <strong>{name}</strong>
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
        <header className={tab === "Conversations" ? "sr" : undefined}>
          <div>
            <h1>{tab}</h1>
            {tab !== "Conversations" && (
              <p>
                {tab === "Settings" || tab === "Characters"
                  ? "A space that feels like you."
                  : "Your companion, with you in control."}
              </p>
            )}
          </div>
          <span className="status">
            <span className="dot" />{" "}
            {preferences.backend === "auto"
              ? "Gemini + Groq"
              : preferences.backend === "gemini-only"
                ? "Gemini"
                : preferences.backend === "groq-only"
                  ? "Groq"
                  : preferences.backend === "hermes"
                    ? "Hermes local"
                    : "Offline utilities"}{" "}
          </span>
        </header>
        {tab === "Conversations" ? (
          <div className="workspace">
            <section className="chat">
              <div className="chat-head">
                <div>
                  <h2>
                    {name} <span className="dot" />
                  </h2>
                </div>
                <div className="chat-head-tools">
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
                  <details className="conversation-options">
                    <summary
                      aria-label="Conversation options"
                      title="Conversation options"
                    >
                      <Icon name="more" />
                    </summary>
                    <div className="conversation-options-panel">
                      <label>
                        Voice mode
                        <select
                          aria-label="Chat voice mode"
                          value={preferences.voice}
                          onChange={(e) =>
                            updatePreferences({
                              voice: e.target.value as typeof preferences.voice,
                            })
                          }
                        >
                          <option value="off">Text only</option>
                          <option value="push-to-talk">Push to talk</option>
                          <option value="open-mic">Open microphone</option>
                        </select>
                      </label>
                      <label className="conversation-interruption">
                        <input
                          type="checkbox"
                          checked={preferences.bargeIn}
                          onChange={(e) =>
                            updatePreferences({ bargeIn: e.target.checked })
                          }
                        />
                        Interrupt when I speak
                      </label>
                      <small>
                        {preferences.rememberHistory
                          ? "History saved on this device"
                          : "History is not saved"}
                      </small>
                    </div>
                  </details>
                </div>
              </div>
              <div
                ref={messageList}
                className="messages"
                role="log"
                aria-live="polite"
              >
                {messages.map((m, i) => (
                  <div key={i} className={`message ${m.role}`}>
                    {m.role === "assistant" &&
                      messages[i - 1]?.role !== "assistant" && (
                        <small>{name}</small>
                      )}
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
                    <small>{name}</small>
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
                  placeholder={`Message ${name}…`}
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
                  <button
                    type="button"
                    aria-label="Apps"
                    title="Open an app"
                    disabled={busy || !!pending || voice.recording}
                    onClick={() => setShowApps(true)}
                  >
                    <Icon name="plus" />
                  </button>
                  <small className="composer-status" role="status">
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
                              : ""}
                  </small>
                  {preferences.voice === "open-mic" && (
                    <MicButton
                      compact
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
                      aria-label="Done speaking"
                      title="Finish speaking"
                      disabled={
                        openMic.phase !== "hearing" || busy || !!pending
                      }
                      onClick={() => openMic.finish()}
                    >
                      <Icon name="send" />
                    </button>
                  )}
                  {preferences.voice !== "open-mic" && (
                    <button
                      type="button"
                      aria-label={
                        voice.recording ? "Finish recording" : "Record"
                      }
                      title={
                        !isNative
                          ? "Recording requires the native app"
                          : busy || pending
                            ? "Wait for the current request"
                            : "Record your voice"
                      }
                      disabled={!isNative || busy || !!pending}
                      onClick={() =>
                        voice.recording
                          ? voice.finishRecording()
                          : void voice.record()
                      }
                    >
                      <Icon name="mic" />
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="Stop"
                    title="Interrupt response"
                    disabled={
                      !busy &&
                      !voice.speaking &&
                      !voice.preparing &&
                      !voice.recording &&
                      !pending
                    }
                    onClick={() => void (pending ? stop() : interrupt())}
                  >
                    <Icon name="stop" />
                  </button>
                  <button
                    className="primary"
                    aria-label="Send"
                    title="Send message"
                    disabled={
                      busy ||
                      !!pending ||
                      !input.trim() ||
                      !historyReady ||
                      voice.recording
                    }
                  >
                    <Icon name="send" />
                  </button>
                </div>
              </form>
            </section>
          </div>
        ) : tab === "Characters" ? (
          <CharacterStudio onOpenGuide={() => setTab("Character guide")} />
        ) : tab === "Character guide" ? (
          <CharacterGuide onBack={() => setTab("Characters")} />
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
      {screenRequest && (
        <ScreenAssistant
          prompt={screenRequest}
          onClose={() => setScreenRequest(null)}
          onAnswer={(answer) => {
            add(answer);
            setScreenRequest(null);
            setMood("happy");
            if (preferences.voice !== "off" && isNative)
              void voice.speak(
                speakable({ text: answer }),
                preferences.volume,
                "curious",
              );
          }}
        />
      )}

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
    </div>
  );
}
