import { test, expect } from "@playwright/test";

// A provider that streams three sentences over ~1.6 s, answering in whichever reply
// format the app requests (tagged text, or the legacy JSON object).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.__calls = [];
    w.__times = {};
    const callbacks = new Map<number, Function>();
    const events = new Map<string, number>();
    let next = 1;
    const emit = (event: string, payload: unknown) =>
      callbacks.get(events.get(event)!)?.({ event, id: 1, payload });
    const sentences = [
      "Hello there, it is lovely to see you.",
      " I found a quiet spot on your desk.",
      " Let me know when you want to chat again.",
    ];
    w.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    w.__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: "main" },
        currentWebview: { label: "main" },
      },
      transformCallback: (fn: Function) => {
        const id = next++;
        callbacks.set(id, fn);
        return id;
      },
      unregisterCallback() {},
      invoke: async (command: string, args: any) => {
        w.__calls.push({ command, args, at: performance.now() });
        if (command === "plugin:event|listen") {
          events.set(args.event, args.handler);
          return args.handler;
        }
        if (command === "gemini_status")
          return { configured: true, keyCount: 1, chatModel: "gemini" };
        if (command === "groq_status") return false;
        if (command === "load_history") return "[]";
        if (command === "list_apps") return [];
        if (command === "voice_capabilities") return { systemSpeech: false };
        if (command === "voice_engines") return [];
        if (command === "character_voice")
          return { engine: "kokoro", speed: 1, gain: 1 };
        if (command === "synthesize_phrase") {
          w.__times.firstSynthesis ??= performance.now() - w.__times.request;
          w.__phrases = [...(w.__phrases ?? []), args.text];
          return [0];
        }
        if (command === "gemini_chat_stream") {
          w.__times.request = performance.now();
          const tagged = args.format === "tagged";
          const parts = tagged
            ? [
                "@meta emotion=happy\n" + sentences[0],
                sentences[1],
                sentences[2],
              ]
            : [
                '{"emotion":"happy","text":"' + sentences[0],
                sentences[1],
                sentences[2] + '","appQuery":"","companionActions":[]}',
              ];
          for (const [i, delta] of parts.entries()) {
            await new Promise((r) => setTimeout(r, i ? 550 : 150));
            emit("provider-stream", { requestId: args.requestId, delta });
          }
          await new Promise((r) => setTimeout(r, 300));
          w.__times.reply = performance.now() - w.__times.request;
          return JSON.stringify({
            text: sentences.join(""),
            emotion: "happy",
            appQuery: "",
            speech: "",
            companionActions: [],
          });
        }
        return null;
      },
    };
    // Deterministic playback: decoding and phrase playback are near-instant.
    w.AudioContext = class {
      destination = {};
      get currentTime() {
        return performance.now() / 1000;
      }
      resume() {
        return Promise.resolve();
      }
      close() {
        return Promise.resolve();
      }
      decodeAudioData() {
        return Promise.resolve({ duration: 0.05 });
      }
      createGain() {
        return { gain: { value: 1 }, connect() {}, disconnect() {} };
      }
      createAnalyser() {
        return {
          fftSize: 32,
          connect() {},
          disconnect() {},
          getFloatTimeDomainData(a: Float32Array) {
            a.fill(0);
          },
        };
      }
      createBufferSource() {
        return {
          buffer: null,
          onended: null as (() => void) | null,
          connect() {},
          disconnect() {},
          start() {
            setTimeout(() => this.onended?.(), 20);
          },
          stop() {
            this.onended?.();
          },
        };
      }
    };
    localStorage.setItem(
      "mivuneko.preferences.v1",
      JSON.stringify({
        backend: "gemini-only",
        voice: "spoken",
        voiceProvider: "local",
      }),
    );
    sessionStorage.setItem("mivuneko-welcome", "1");
  });
});

test("speech starts on the first streamed sentence, before the reply finishes", async ({
  page,
}) => {
  await page.goto("/?view=chat");
  await page.getByLabel("Message Mivuneko", { exact: true }).fill("Hi there");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("log")).toContainText("chat again");
  await expect
    .poll(() => page.evaluate(() => (window as any).__times.firstSynthesis))
    .toBeGreaterThan(0);
  const times = await page.evaluate(() => (window as any).__times);
  console.log(
    `STREAMING-VOICE first synthesis ${Math.round(times.firstSynthesis)} ms, reply complete ${Math.round(times.reply)} ms`,
  );
  // Speech must begin from the first sentence, well before the full reply arrives.
  expect(times.firstSynthesis).toBeLessThan(times.reply - 500);
  const phrases: string[] = await page.evaluate(
    () => (window as any).__phrases,
  );
  expect(phrases.join(" ")).toContain("Hello there");
  expect(phrases.join(" ")).toContain("chat again");
  expect(phrases.join(" ")).not.toMatch(/@meta|@actions|[{}"]/);
});
