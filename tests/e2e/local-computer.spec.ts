import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.__calls = [];
    w.__step = 0;
    const callbacks = new Map<number, Function>();
    let next = 1;
    w.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    w.__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: "main" },
        currentWebview: { label: "main" },
      },
      transformCallback: (fn: Function) => {
        callbacks.set(next, fn);
        return next++;
      },
      unregisterCallback() {},
      invoke: async (command: string, args: any) => {
        w.__calls.push({ command, args });
        if (command === "plugin:event|listen") return args.handler;
        if (command === "load_history") return "[]";
        if (command === "get_launch_policy")
          return { enabled: true, mode: "ask", stored: true };
        if (command === "voice_capabilities") return { systemSpeech: false };
        if (command === "voice_engines" || command === "list_apps") return [];
        if (command === "local_runtime_status")
          return { installed: true, voiceReady: true };
        if (command === "ollama_models")
          return { models: [{ name: "qwen3.5:9b" }, { name: "gpt-oss:20b" }] };
        if (command === "ollama_chat")
          return JSON.stringify({
            text: "This reply was generated locally.",
            emotion: "happy",
            appQuery: "",
            companionActions: [],
          });
        if (command === "computer_windows")
          return {
            windows: [
              {
                id: "qa-window",
                title: "Local test app",
                process: w.__browserWindow ? "msedge.exe" : "computerqa.exe",
              },
            ],
          };
        if (command === "computer_open_browser") return { opened: true };
        if (command === "computer_start") return { sessionId: "session-1" };
        if (command === "computer_next") {
          if (w.__holdPlan)
            return await new Promise((resolve) => {
              w.__releasePlan = () =>
                resolve({
                  revision: 0,
                  step: 1,
                  action: {
                    kind: "click",
                    reason: "Click the visible test button",
                  },
                  observation: {
                    image: "",
                    title: "Local test app",
                    elements: [],
                  },
                });
            });
          return {
            revision: w.__step,
            step: w.__step + 1,
            action: w.__step
              ? {
                  kind: "finish",
                  reason: "The app displays the requested result.",
                }
              : {
                  kind: "click",
                  element: "observed-button",
                  reason: "Click the visible test button",
                },
            observation: {
              image:
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1kAAAAASUVORK5CYII=",
              title: "Local test app",
              elements: [],
            },
          };
        }
        if (command === "computer_act") {
          w.__step++;
          return { performed: "click" };
        }
        return null;
      },
    };
    sessionStorage.setItem("mivuneko-welcome", "1");
    localStorage.setItem(
      "mivuneko.preferences.v1",
      JSON.stringify({
        backend: "ollama",
        computerApproval: "review",
        voice: "off",
        rememberHistory: false,
      }),
    );
  });
});
test("Ollama conversation uses the selected installed model without calling cloud providers", async ({
  page,
}) => {
  await page.goto("/?view=chat");
  await page
    .getByLabel("Message Mivuneko", { exact: true })
    .fill("Tell me something brief");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByText("This reply was generated locally.", { exact: true }),
  ).toBeVisible();
  const calls = await page.evaluate(() => (window as any).__calls);
  expect(calls.find((v: any) => v.command === "ollama_chat").args.model).toBe(
    "qwen3.5:9b",
  );
  expect(
    calls.some((v: any) =>
      ["gemini_chat_stream", "groq_chat", "hermes_chat"].includes(v.command),
    ),
  ).toBe(false);
});
test("computer actions wait for approval and submit only the bound session revision", async ({
  page,
}) => {
  await page.goto("/?view=chat");
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("mivuneko-open-computer", {
        detail: "Use the local test app",
      }),
    ),
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByText("Click the visible test button", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as any).__calls.filter((v: any) => v.command === "computer_act")
          .length,
    ),
  ).toBe(0);
  await page
    .getByRole("button", { name: "Approve this step", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Done", exact: true }),
  ).toBeVisible();
  const call = await page.evaluate(() =>
    (window as any).__calls.find((v: any) => v.command === "computer_act"),
  );
  expect(call.args).toEqual({
    sessionId: "session-1",
    revision: 0,
    interactive: false,
  });
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("region", { name: "Computer task" })).toHaveCount(
    0,
  );
});
test("Stop discards a late computer proposal without executing it", async ({
  page,
}) => {
  await page.goto("/?view=chat");
  await page.evaluate(() => {
    (window as any).__holdPlan = true;
    window.dispatchEvent(
      new CustomEvent("mivuneko-open-computer", { detail: "Use the test app" }),
    );
  });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Stop session", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop session", exact: true }).click();
  await page.evaluate(() => (window as any).__releasePlan());
  await expect(
    page.getByRole("button", { name: "Approve this step", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (window as any).__calls.filter((v: any) => v.command === "computer_act")
          .length,
    ),
  ).toBe(0);
});

test("browser searches open directly without planning, mouse input or step approvals", async ({
  page,
}) => {
  await page.goto("/?view=chat");
  await page
    .getByLabel("Message Mivuneko", { exact: true })
    .fill("open Edge and search elon musk for me");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page
    .getByRole("button", { name: "Open in browser", exact: true })
    .click();
  await expect(
    page.getByText("I've opened a browser search for elon musk.", {
      exact: true,
    }),
  ).toBeVisible();
  const calls = await page.evaluate(() => (window as any).__calls);
  expect(
    calls.find((v: any) => v.command === "computer_open_browser").args,
  ).toEqual({
    url: "https://www.google.com/search?q=elon%20musk",
    browser: "edge",
  });
  expect(
    calls.some((v: any) =>
      [
        "computer_start",
        "computer_next",
        "computer_act",
        "ollama_chat",
      ].includes(v.command),
    ),
  ).toBe(false);
});
test("automatic Wikipedia requests use the default browser with no confirmation", async ({
  page,
}) => {
  await page.goto("/?view=chat");
  await page.evaluate(() => {
    const key = "mivuneko.preferences.v1";
    localStorage.setItem(
      key,
      JSON.stringify({
        ...JSON.parse(localStorage.getItem(key) || "{}"),
        computerApproval: "automatic",
      }),
    );
    window.dispatchEvent(new StorageEvent("storage", { key }));
  });
  await page
    .getByLabel("Message Mivuneko", { exact: true })
    .fill("open wikipedia page for me on my browser");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByText("I've opened the page in your browser.", { exact: true }),
  ).toBeVisible();
  const calls = await page.evaluate(() => (window as any).__calls);
  expect(
    calls.find((v: any) => v.command === "computer_open_browser").args,
  ).toEqual({ url: "https://www.wikipedia.org/", browser: "default" });
  expect(
    calls.some((v: any) =>
      ["computer_start", "computer_next", "computer_act"].includes(v.command),
    ),
  ).toBe(false);
  await expect(
    page.getByRole("button", { name: "Approve this step" }),
  ).toHaveCount(0);
});
test("routine app steps execute automatically and reobserve a stale window", async ({
  page,
}) => {
  await page.goto("/?view=chat");
  await page.evaluate(() => {
    const key = "mivuneko.preferences.v1";
    localStorage.setItem(
      key,
      JSON.stringify({
        ...JSON.parse(localStorage.getItem(key) || "{}"),
        computerApproval: "automatic",
      }),
    );
    window.dispatchEvent(new StorageEvent("storage", { key }));
    const api = (window as any).__TAURI_INTERNALS__;
    const invoke = api.invoke;
    let failed = false;
    api.invoke = async (cmd: string, args: any) => {
      if (cmd === "computer_act" && !failed) {
        failed = true;
        throw "The window changed after observation. Observe it again before acting.";
      }
      return invoke(cmd, args);
    };
    window.dispatchEvent(
      new CustomEvent("mivuneko-open-computer", {
        detail: "Use the local test app",
      }),
    );
  });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Done", exact: true }),
  ).toBeVisible();
  const calls = await page.evaluate(() => (window as any).__calls);
  expect(calls.filter((v: any) => v.command === "computer_next")).toHaveLength(
    3,
  );
  expect(calls.filter((v: any) => v.command === "computer_act")).toHaveLength(
    2,
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Approve this step" }),
  ).toHaveCount(0);
});

test("computer-task responses are spoken through the selected character voice", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as any,
      previous = w.__TAURI_INTERNALS__.invoke;
    w.__played = 0;
    w.__TAURI_INTERNALS__.invoke = async (command: string, args: any) => {
      if (command === "character_voice")
        return { engine: "kokoro", speed: 1, gain: 1 };
      if (command === "synthesize_phrase") {
        w.__calls.push({ command, args });
        return [0];
      }
      return previous(command, args);
    };
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
        return Promise.resolve({ duration: 0.01 });
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
            w.__played++;
            setTimeout(() => this.onended?.(), 10);
          },
          stop() {
            this.onended?.();
          },
        };
      }
    };
    const key = "mivuneko.preferences.v1";
    localStorage.setItem(
      key,
      JSON.stringify({
        ...JSON.parse(localStorage.getItem(key) || "{}"),
        computerApproval: "automatic",
        voice: "push-to-talk",
        voiceProvider: "local",
        renderer: "sample-vrm",
      }),
    );
  });
  await page.goto("/?view=chat");
  await page
    .getByLabel("Message Mivuneko", { exact: true })
    .fill("open wikipedia page for me on my browser");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__played))
    .toBeGreaterThan(0);
  const phrases = await page.evaluate(() =>
    (window as any).__calls.filter(
      (v: any) => v.command === "synthesize_phrase",
    ),
  );
  expect(phrases.map((v: any) => v.args.text).join(" ")).toContain(
    "I've opened the page in your browser",
  );
  expect(phrases.every((v: any) => v.args.character === "haru")).toBe(true);
});
