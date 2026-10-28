import { Icon } from "./Icon";
import { Markdown } from "./Markdown";
import { speakable } from "../../../packages/shared-schemas/speech.ts";
import { useEffect, useRef, useState } from "react";
import type { LaunchRequest } from "../../../packages/shared-schemas/index.ts";
import { logActivity } from "./activity";
import { agentFor } from "./agent";
import { broker, isNative } from "./broker";
import { useConversation } from "./conversation";
import { usePreferences } from "./preferences";
import { publishPet } from "./session";
import { useVoice } from "./useVoice";
export function InlineChat({ onClose }: { onClose: () => void }) {
  const prefs = usePreferences();
  const [messages, setMessages] = useConversation();
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<LaunchRequest | null>(null);
  const controller = useRef<AbortController | null>(null);
  const active = useRef(false);
  const latest = useRef("");
  const messageList = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = messageList.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, busy]);
  const voice = useVoice(
    (text) => {
      void send(text);
    },
    (mood) => publishPet(mood, latest.current),
    setError,
  );
  async function stop() {
    controller.current?.abort();
    active.current = false;
    await voice.stop();
    await broker.revoke();
    setPending(null);
    setBusy(false);
    publishPet("idle", latest.current);
  }
  useEffect(
    () => () => {
      controller.current?.abort();
      void broker.revoke();
    },
    [],
  );
  useEffect(() => {
    if (prefs.voice === "off") void voice.stop();
  }, [prefs.voice]);
  async function send(text = input) {
    if (!text.trim() || text.length > 4000 || active.current || pending) return;
    active.current = true;
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    setInput("");
    setError("");
    setMessages((old) => [...old, { role: "user", text }]);
    try {
      await voice.stop();
      c.signal.throwIfAborted();
      publishPet("thinking", "Thinking…");
      const reply = await agentFor(prefs.backend).reply(
        text,
        "Assist",
        c.signal,
        messages,
      );
      c.signal.throwIfAborted();
      latest.current = reply.text;
      setMessages((old) => [...old, { role: "assistant", text: reply.text }]);
      publishPet(reply.mood ?? "happy", reply.text);
      if (reply.appQuery) {
        if (!prefs.appLaunching)
          throw Error("App launching is disabled in Permissions.");
        const apps = await broker.listApps();
        c.signal.throwIfAborted();
        const matches = apps.filter(
          (app) => app.name.toLowerCase() === reply.appQuery!.toLowerCase(),
        );
        if (matches.length !== 1)
          throw Error("No unique installed app matched. Try its exact name.");
        const request = await broker.requestLaunch(matches[0].id);
        if (c.signal.aborted) {
          await broker.revoke();
          return;
        }
        logActivity(`Approval requested: ${request.app.name}`);
        setPending(request);
        publishPet("concerned", `Open ${request.app.name}?`);
      } else if (prefs.voice !== "off")
        void voice.speak(speakable(reply), prefs.volume, reply.mood);
    } catch (e) {
      if (!c.signal.aborted) {
        setError(String(e));
        publishPet("error", "Please check the chat error.");
      }
    } finally {
      if (controller.current === c) {
        active.current = false;
        setBusy(false);
      }
    }
  }
  async function resolve(allow: boolean) {
    if (!pending || active.current) return;
    active.current = true;
    setBusy(true);
    const request = pending;
    setPending(null);
    try {
      const result = await broker.resolveLaunch(
        request.id,
        allow && prefs.appLaunching,
      );
      setMessages((old) => [
        ...old,
        { role: "assistant", text: result.message },
      ]);
      logActivity(result.message);
      latest.current = result.message;
      publishPet(result.ok ? "celebrating" : "idle", result.message);
    } catch (e) {
      setError(String(e));
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="inline-chat" aria-label="Chat beneath Mivuneko">
      <div className="inline-chat-head">
        <span>
          <i className="dot" /> Mivuneko{" "}
          <small>
            {prefs.backend === "auto"
              ? "Gemini + Groq"
              : prefs.backend === "hermes"
                ? "Hermes"
                : "offline"}
          </small>
        </span>
        <button
          aria-label="Close inline chat"
          onClick={() => {
            void stop();
            onClose();
          }}
        >
          <Icon name="close" />
        </button>
      </div>
      <div
        ref={messageList}
        className="inline-messages"
        role="log"
        aria-live="polite"
      >
        {messages.slice(-4).map((m, i) =>
          m.role === "assistant" ? (
            <div key={i} className={m.role}>
              <small>Mivuneko</small>
              <Markdown text={m.text} />
            </div>
          ) : (
            <p key={i} className={m.role}>
              <small>You</small>
              {m.text}
            </p>
          ),
        )}
        {busy && (
          <p role="status" className="thinking-indicator">
            <i />
            <i />
            <i />
            <span>Thinking…</span>
          </p>
        )}
      </div>
      {pending && (
        <div
          className="inline-approval"
          role="group"
          aria-label="App launch approval"
        >
          <strong>Open {pending.app.name}?</strong>
          <small>
            {isNative
              ? "Launches this app on your computer."
              : "Browser simulation."}{" "}
            One time only.
          </small>
          <button autoFocus onClick={() => void resolve(false)}>
            Deny
          </button>
          <button onClick={() => void resolve(true)}>Allow once</button>
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          autoFocus
          aria-label="Message beneath pet"
          placeholder="Tell me something…"
          maxLength={4000}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!!pending || voice.recording}
        />
        <div className="inline-actions">
          <button
            type="button"
            disabled={
              !isNative || prefs.voice !== "push-to-talk" || busy || !!pending
            }
            onClick={() =>
              voice.recording ? voice.finishRecording() : void voice.record()
            }
          >
            <Icon name="mic" />
            <span>{voice.recording ? "Finish recording" : "Microphone"}</span>
          </button>
          <button type="button" onClick={() => void stop()}>
            <Icon name="stop" />
            <span>Stop</span>
          </button>
          <button
            className="primary"
            disabled={busy || !!pending || voice.recording || !input.trim()}
          >
            <span>Send</span>
            <Icon name="send" />
          </button>
        </div>
      </form>
      <small className="inline-privacy">
        {voice.recording
          ? "● Recording · up to 29 seconds"
          : prefs.voiceProvider === "gemini"
            ? "Voice recordings are sent to Google when finished."
            : "Voice uses your local configuration."}
      </small>
    </section>
  );
}
