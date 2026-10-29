import { desktopIntent } from "../../../packages/shared-schemas/desktop-intent";
import {
  parseAgentReply,
  boundedMessages,
} from "../../../packages/shared-schemas/agent.ts";
import type { Agent } from "../../../packages/shared-schemas/index.ts";
import { mockHermes } from "../../../services/agent-adapter/mock.ts";
import { isNative } from "./broker";
import { partialText } from "./partialText";
export function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () =>
      reject(signal.reason ?? new DOMException("Cancelled", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        if (!signal.aborted) resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}
let nextCloud = 0;
export function agentFor(
  backend: "offline" | "hermes" | "auto" | "gemini" | "groq",
  identity?: string,
): Agent {
  return {
    async reply(text, mode, signal, history = [], onProgress) {
      // Explicit user launch requests use the same constrained local intent path in every backend.
      const local = desktopIntent(text);
      if (local?.kind === "open")
        return mockHermes.reply(`open ${local.query}`, mode, signal);
      if (backend === "offline" || /^open\s+/i.test(text.trim()))
        return mockHermes.reply(text, mode, signal);
      if (!isNative)
        throw Error(
          "Live providers require the native desktop app. Browser preview remains offline.",
        );
      const { invoke } = await import("@tauri-apps/api/core");
      if (backend === "auto") {
        const [gemini, groq] = await Promise.all([
          invoke<{ configured: boolean }>("gemini_status").catch(() => ({
            configured: false,
          })),
          invoke<boolean>("groq_status").catch(() => false),
        ]);
        const choices: ("gemini" | "groq")[] = [];
        if (gemini?.configured) choices.push("gemini");
        if (groq) choices.push("groq");
        if (!choices.length)
          throw Error(
            "No conversation provider is connected. Add your credentials in Settings → Connections.",
          );
        const start = nextCloud++ % choices.length;
        const errors: string[] = [];
        for (let i = 0; i < choices.length; i++) {
          signal.throwIfAborted();
          const provider = choices[(start + i) % choices.length];
          try {
            return await agentFor(provider, identity).reply(
              text,
              mode,
              signal,
              history,
              onProgress,
            );
          } catch (error) {
            signal.throwIfAborted();
            errors.push(`${provider}: ${String(error)}`);
            onProgress?.("");
          }
        }
        throw Error(`All configured providers failed. ${errors.join("; ")}`);
      }
      const messages = boundedMessages(history, text);
      if (identity) {
        messages.splice(0, Math.max(0, messages.length - 30));
        messages.unshift(
          {
            role: "user",
            content: `Companion preference: your chosen name is ${JSON.stringify(identity)}. Use this name when introducing yourself. Physical movement and location are controlled by the application; never claim an unconfirmed desktop action.`,
          },
          {
            role: "assistant",
            content:
              "I'll use that companion name and describe only confirmed actions.",
          },
        );
      }
      signal.throwIfAborted();
      const requestId = crypto.randomUUID();
      const cancel = () => {
        if (backend === "gemini" || backend === "groq")
          void invoke(backend === "gemini" ? "cancel_gemini" : "cancel_groq", {
            requestId,
          });
      };
      signal.addEventListener("abort", cancel, { once: true });
      let answer: string;
      let raw = "";
      const { listen } = await import("@tauri-apps/api/event");
      const unlisten =
        backend === "gemini" || backend === "groq"
          ? await listen<{ requestId: string; delta: string }>(
              "provider-stream",
              (event) => {
                if (event.payload.requestId !== requestId || signal.aborted)
                  return;
                raw += event.payload.delta;
                onProgress?.(backend === "gemini" ? partialText(raw) : raw);
              },
            )
          : () => {};
      try {
        answer = await abortable(
          invoke<string>(
            backend === "gemini"
              ? "gemini_chat_stream"
              : backend === "groq"
                ? "groq_chat"
                : "hermes_chat",
            {
              messages,
              mode,
              requestId,
            },
          ),
          signal,
        );
      } finally {
        signal.removeEventListener("abort", cancel);
        unlisten();
      }
      signal.throwIfAborted();
      const reply =
        backend === "groq" ? { text: answer } : parseAgentReply(answer);
      if (mode === "Chat" || mode === "Creative") delete reply.appQuery;
      return reply;
    },
  };
}
