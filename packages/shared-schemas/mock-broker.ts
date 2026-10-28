import type { Broker, LaunchRequest } from "./index.ts";
export function createMockBroker(now: () => number = Date.now): Broker {
  const apps = [
    { id: "telegram", name: "Telegram" },
    { id: "notepad", name: "Notepad" },
    { id: "calculator", name: "Calculator" },
  ];
  const pending = new Map<
    string,
    { request: LaunchRequest; expires: number }
  >();
  return {
    async listApps() {
      return apps;
    },
    async requestLaunch(appId) {
      const app = apps.find((a) => a.id === appId);
      if (!app) throw Error("Unknown app");
      for (const [id, p] of pending) if (p.expires <= now()) pending.delete(id);
      if (pending.size >= 8) throw Error("Too many pending requests");
      const request = { id: crypto.randomUUID(), app };
      pending.set(request.id, { request, expires: now() + 60000 });
      return request;
    },
    async resolveLaunch(id, allow) {
      const request = pending.get(id);
      pending.delete(id);
      if (!request || request.expires <= now())
        throw Error("Request expired or consumed");
      return {
        ok: allow,
        message: allow
          ? `Mock launch: ${request.request.app.name}. No app was opened.`
          : "Launch denied.",
      };
    },
    async revoke() {
      pending.clear();
    },
  };
}
