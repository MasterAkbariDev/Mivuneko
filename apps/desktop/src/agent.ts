import {
  parseAgentReply,
  boundedMessages,
} from "../../../packages/shared-schemas/agent.ts";
import type { Agent } from "../../../packages/shared-schemas/index.ts";
import { mockHermes } from "../../../services/agent-adapter/mock.ts";
import { isNative } from "./broker";
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
export function agentFor(backend: "offline" | "hermes" | "gemini"): Agent {
  return {
    async reply(text, mode, signal, history = []) {
      // Explicit user launch requests use the same constrained local intent path in every backend.
      if (backend === "offline" || /^open\s+/i.test(text.trim()))
        return mockHermes.reply(text, mode, signal);
      if (!isNative)
        throw Error(
          "Live providers require the native desktop app. Browser preview remains offline.",
        );
      const { invoke } = await import("@tauri-apps/api/core");
      const messages = boundedMessages(history, text);
      signal.throwIfAborted();
      const requestId = crypto.randomUUID();
      const cancel = () => {
        if (backend === "gemini") void invoke("cancel_gemini", { requestId });
      };
      signal.addEventListener("abort", cancel, { once: true });
      let answer: string;
      try {
        answer = await abortable(
          invoke<string>(backend === "gemini" ? "gemini_chat" : "hermes_chat", {
            messages,
            mode,
            requestId,
          }),
          signal,
        );
      } finally {
        signal.removeEventListener("abort", cancel);
      }
      signal.throwIfAborted();
      const reply = parseAgentReply(answer);
      if (mode === "Chat" || mode === "Creative") delete reply.appQuery;
      return reply;
    },
  };
}
