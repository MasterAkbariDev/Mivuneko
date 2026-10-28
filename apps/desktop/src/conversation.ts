import { useSyncExternalStore, type SetStateAction } from "react";
import type { ChatMessage } from "../../../packages/shared-schemas/history.ts";
import { parseHistory } from "../../../packages/shared-schemas/history.ts";
import { isNative } from "./broker";
let messages: ChatMessage[] = [
  {
    role: "assistant",
    text: "Hi, I’m Mivuneko. A little company, a little help. What shall we do today?",
  },
];
const listeners = new Set<() => void>();
const channel = new BroadcastChannel("mivuneko.conversation");
function receive(value: unknown) {
  messages = parseHistory(value);
  listeners.forEach((fn) => fn());
}
channel.onmessage = (event) => {
  if (event.data?.kind === "request")
    channel.postMessage({ kind: "snapshot", messages });
  else if (event.data?.kind === "snapshot") receive(event.data.messages);
  else receive(event.data);
};
if (!isNative) channel.postMessage({ kind: "request" });
if (isNative)
  void import("@tauri-apps/api/event")
    .then(({ listen }) =>
      listen("conversation-updated", (event) => receive(event.payload)),
    )
    .catch(() => {});
function setMessages(action: SetStateAction<ChatMessage[]>) {
  const next = typeof action === "function" ? action(messages) : action;
  receive(next);
  if (isNative)
    void import("@tauri-apps/api/event")
      .then(({ emitTo }) =>
        emitTo(
          new URLSearchParams(location.search).get("view") === "chat"
            ? "pet"
            : "main",
          "conversation-updated",
          messages,
        ),
      )
      .catch(() => {});
  else channel.postMessage(messages);
}
export function useConversation(): [ChatMessage[], typeof setMessages] {
  return [
    useSyncExternalStore(
      (fn) => {
        listeners.add(fn);
        return () => {
          listeners.delete(fn);
        };
      },
      () => messages,
    ),
    setMessages,
  ];
}
