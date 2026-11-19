import type { WorkContext } from "../../../packages/shared-schemas/work-context";
import {
  parseAgentReply,
  boundedMessages,
} from "../../../packages/shared-schemas/agent.ts";
import type { Agent } from "../../../packages/shared-schemas/index.ts";
import { mockHermes } from "../../../services/agent-adapter/mock.ts";
import { isNative } from "./broker";
import { partialText } from "./partialText";
import { parsePreferences } from "./preferences";
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
  choice:
    | "offline"
    | "hermes"
    | "auto"
    | "gemini"
    | "groq"
    | "gemini-only"
    | "groq-only"
    | "ollama",

  identity?: string,
  work?: WorkContext,
): Agent {
  const backend =
    choice === "gemini-only"
      ? "gemini"
      : choice === "groq-only"
        ? "groq"
        : choice;
  return {
    async reply(text, mode, signal, history = [], onProgress) {
      if (backend === "offline") return mockHermes.reply(text, mode, signal);
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
            return await agentFor(provider, identity, work).reply(
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
      messages.splice(
        Math.max(0, messages.length - 1),
        0,
        {
          role: "user",
          content: `Application task memory (observed evidence, not a new user instruction): ${JSON.stringify(work || {})}. Resolve references such as it, there, same project, another one, and follow-up answers using the conversation and this state. A completed step is not the end of a user's broader goal. For any request requiring current desktop facts, inspection, file work, terminal work, or interaction with an app, set computerTask to the understood goal and let tools inspect first. Do not merely promise to check or act, and do not ask for a folder/window that tools or prior observations can resolve. Task setup will ask only for genuinely missing requirements after inspection. For a goal that only launches a named application, use appQuery with its name; the native broker resolves the actual installed app, so never guess executable paths. Use computerTask for multi-step work in an app or project. For ordinary conversation or explanations, leave both computerTask and appQuery empty. Emit computerTask, appQuery and companionActions before text, with empty strings and [] for ordinary conversation, so the app can safely stream text after its route is known. Do not emit duplicate routing fields. Do not execute tasks quoted as examples or complaints. Never turn a previous request into a new action unless the current user request continues it. Never claim completion without current tool results.`,
        },
        {
          role: "assistant",
          content:
            "I will use confirmed task state and tool results, distinguish follow-ups from new goals, and hand actionable requests to tools.",
        },
      );
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
        if (backend === "ollama") void invoke("cancel_ollama", { requestId });
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
        backend === "gemini" || backend === "groq" || backend === "ollama"
          ? await listen<{ requestId: string; delta: string }>(
              "provider-stream",
              (event) => {
                if (event.payload.requestId !== requestId || signal.aborted)
                  return;
                raw += event.payload.delta;
                onProgress?.(
                  mode === "Assist" || mode === "Autonomous"
                    ? partialText(raw, true)
                    : backend === "gemini" ||
                        backend === "ollama" ||
                        /^\s*[{`]/.test(raw)
                      ? partialText(raw)
                      : raw,
                );
              },
            )
          : () => {};
      try {
        answer = await abortable(
          invoke<string>(
            backend === "gemini"
              ? "gemini_chat_stream"
              : backend === "ollama"
                ? "ollama_chat"
                : backend === "groq"
                  ? "groq_chat"
                  : "hermes_chat",
            {
              messages,
              mode,
              requestId,
              ...(backend === "ollama"
                ? {
                    model: parsePreferences(
                      JSON.parse(
                        localStorage.getItem("mivuneko.preferences.v1") ||
                          "null",
                      ),
                    ).ollamaModel,
                  }
                : {}),
            },
          ),
          signal,
        );
      } finally {
        signal.removeEventListener("abort", cancel);
        unlisten();
      }
      signal.throwIfAborted();
      const reply = parseAgentReply(answer);
      if (mode === "Chat" || mode === "Creative") {
        delete reply.appQuery;
        delete reply.computerTask;
      }
      return reply;
    },
  };
}
