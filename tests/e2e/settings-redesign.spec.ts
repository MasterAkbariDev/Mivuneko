import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.__calls = [];
    w.__micStops = 0;
    const callbacks = new Map<number, Function>();
    const events = new Map<string, number>();
    let nextCallback = 1;
    w.__emit = (event: string, payload: unknown) =>
      callbacks.get(events.get(event)!)?.({ event, id: 1, payload });
    let installed = false;
    w.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    w.__TAURI_INTERNALS__ = {
      transformCallback: (fn: Function) => {
        const id = nextCallback++;
        callbacks.set(id, fn);
        return id;
      },
      unregisterCallback() {},
      invoke: async (command: string, args: any) => {
        w.__calls.push({ command, args });
        if (command === "plugin:event|listen") {
          events.set(args.event, args.handler);
          return args.handler;
        }
        if (command === "voice_capabilities") return { systemSpeech: false };
        if (command === "voice_engines")
          return [
            {
              id: "whisper:base.en",
              label: "Whisper base.en",
              family: "Whisper",
              sizeMb: 148,
              speed: "Fast",
              accuracy: "English",
              detail: "Local English recognition",
              installed,
            },
            {
              id: "parakeet:tdt-0.6b-v2",
              label: "Parakeet TDT 0.6B v2",
              family: "Parakeet",
              sizeMb: 460,
              speed: "Fast",
              accuracy: "English",
              detail: "Local recognition",
              installed: false,
            },
          ];
        if (command === "install_voice_engine") {
          if (args.engine.startsWith("parakeet")) {
            w.__emit("voice-install-progress", {
              engine: args.engine,
              stage: "Downloading Parakeet speech model",
              received: 125829120,
              total: 503316480,
            });
            await new Promise<void>((resolve) => {
              w.__finishDownload = resolve;
            });
          }
          installed = true;
          return;
        }
        if (command === "list_apps") return [];
        if (command === "load_history") return "[]";
        if (command === "gemini_status")
          return {
            configured: true,
            keyCount: 10,
            proxyEnabled: true,
            chatModel: "gemini",
          };
        return null;
      },
    };
    sessionStorage.setItem("mivuneko-welcome", "1");
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        enumerateDevices: async () => [
          {
            kind: "audioinput",
            deviceId: "default",
            label: "System microphone",
          },
          {
            kind: "audioinput",
            deviceId: "usb-mic",
            label: "USB studio microphone",
          },
        ],
        addEventListener() {},
        removeEventListener() {},
        getUserMedia: async (constraints: any) => {
          w.__micConstraints = constraints;
          return { getTracks: () => [{ stop: () => w.__micStops++ }] };
        },
      },
    });
    w.AudioContext = class {
      createMediaStreamSource() {
        return { connect() {} };
      }
      createAnalyser() {
        return {
          fftSize: 512,
          getFloatTimeDomainData(a: Float32Array) {
            a.fill(0.04);
          },
        };
      }
      resume() {
        return Promise.resolve();
      }
      close() {
        return Promise.resolve();
      }
    };
  });
});
test("model download configures recognition and selected microphone is released", async ({
  page,
}) => {
  await page.goto("/?view=chat&tab=Settings");
  await expect(
    page.getByRole("button", { name: "Set up speech recognition · 148 MB" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Set up speech recognition · 148 MB" })
    .click();
  await expect(
    page.getByRole("radio", { name: "Whisper base.en" }),
  ).toBeChecked();
  await page.getByLabel("Microphone", { exact: true }).selectOption("usb-mic");
  await page
    .getByRole("button", { name: "Check microphone", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Stop microphone check" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as any).__micConstraints.audio.deviceId.exact,
    ),
  ).toBe("usb-mic");
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__micStops))
    .toBeGreaterThan(0);
});
test("editable shortcuts persist and navigate without firing inside capture fields", async ({
  page,
}) => {
  await page.goto("/?view=chat&tab=Settings");
  await page.getByRole("button", { name: "Shortcuts", exact: true }).click();
  const input = page.getByLabel("Open conversation shortcut");
  await input.focus();
  await input.press("Control+Shift+K");
  await expect(input).toHaveValue("Ctrl+Shift+K");
  await page.getByRole("button", { name: "Characters", exact: true }).click();
  await page.keyboard.press("Control+Shift+K");
  await expect(
    page.getByRole("button", { name: "Conversations", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Shortcuts", exact: true }).click();
  await expect(page.getByLabel("Open conversation shortcut")).toHaveValue(
    "Ctrl+Shift+K",
  );
});
test("bundled and imported VRM models render and selection reaches the desktop pet", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  // Apply the packaged app's connection policy to catch embedded-texture regressions.
  // Vite's websocket is allowed only in this browser test.
  const config = JSON.parse(
    readFileSync("apps/desktop/src-tauri/tauri.conf.json", "utf8"),
  );
  const connectionPolicy = config.app.security.csp.match(/connect-src[^;]+/)[0];
  await page.route("**/?view=chat&tab=Characters", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        "content-security-policy": `${connectionPolicy} ws://127.0.0.1:1420`,
      },
    });
  });
  const errors: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    const viteConnection =
      text.startsWith("WebSocket connection to 'ws://127.0.0.1:1420/") ||
      text.startsWith("[vite] failed to connect to websocket.");
    if (message.type() === "error" && !viteConnection) errors.push(text);
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?view=chat&tab=Characters");
  await page.getByRole("button", { name: /Haru · 3D/ }).click();
  await expect(
    page.locator('.character-scene[data-model-ready="true"]'),
  ).toBeVisible({ timeout: 20000 });
  await page
    .getByLabel("Pet expression", { exact: true })
    .selectOption("angry");
  await expect(page.locator(".character-scene")).toHaveAttribute(
    "data-emotion",
    "angry",
  );
  const pet = await context.newPage();
  await pet.goto("/");
  await expect(
    pet.locator('.character-scene[data-model-ready="true"]'),
  ).toBeVisible({ timeout: 20000 });
  await page
    .getByLabel("Import VRM file")
    .setInputFiles(resolve("apps/desktop/public/models/haru.vrm"));
  await expect(
    page.getByRole("button", { name: /Your VRM model/ }),
  ).toHaveAttribute("aria-pressed", "true", { timeout: 15000 });
  await expect(
    page.locator('.character-scene[data-model-ready="true"]'),
  ).toBeVisible({ timeout: 20000 });
  expect(errors).toEqual([]);
  await page.screenshot({
    path: "test-results/character-studio-redesign.png",
    fullPage: false,
  });
});
test("settings fit a compact desktop window", async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 740 });
  await page.goto("/?view=chat&tab=Settings");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/settings-redesign.png",
    fullPage: false,
  });
});

test("Parakeet installs with one click and a visible progress line persists across sections", async ({
  page,
}) => {
  await page.goto("/?view=chat&tab=Settings");
  // Locate the model's own download action, independently of card styling.
  await page
    .getByRole("radio", { name: "Parakeet TDT 0.6B v2" })
    .locator("..")
    .getByRole("button", { name: /Download/ })
    .click();
  const dock = page.getByRole("status", { name: "Speech download" });
  await expect(dock).toContainText("25%");
  const track = dock.getByRole("progressbar");
  await expect(track).toHaveAttribute("aria-valuenow", "25");
  expect((await track.boundingBox())!.height).toBeGreaterThanOrEqual(12);
  await page.getByRole("button", { name: "Characters", exact: true }).click();
  await expect(dock).toBeVisible();
  await expect(page.getByLabel("Speech engine", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("combobox", { name: "Pet expression", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/persistent-download.png" });
  await page.evaluate(() => (window as any).__finishDownload());
  await expect(dock).toContainText("Ready to use");
});

async function streamingVoice(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const w = window as any;
    w.__audioStarts = [];
    localStorage.setItem(
      "mivuneko.preferences.v1",
      JSON.stringify({ voiceProvider: "gemini" }),
    );
    const previous = w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.invoke = async (command: string, args: any) => {
      if (command === "gemini_speak_stream") {
        w.__speechRequest = args;
        w.__speechPending = true;
        await new Promise<void>((resolve) => {
          w.__finishSpeech = () => {
            w.__speechPending = false;
            resolve();
          };
        });
        return;
      }
      if (command === "cancel_gemini") {
        w.__finishSpeech?.();
        return;
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
      createGain() {
        return { gain: { value: 1 }, connect() {}, disconnect() {} };
      }
      createAnalyser() {
        return {
          fftSize: 32,
          connect() {},
          disconnect() {},
          getFloatTimeDomainData(a: Float32Array) {
            a.fill(0.1);
          },
        };
      }
      createBuffer(_channels: number, length: number, rate: number) {
        return {
          duration: length / rate,
          getChannelData: () => new Float32Array(length),
        };
      }
      createBufferSource() {
        let timer: ReturnType<typeof setTimeout>;
        return {
          buffer: null as any,
          onended: null as (() => void) | null,
          connect() {},
          disconnect() {},
          start(at: number) {
            w.__audioStarts.push({ at, duration: this.buffer.duration });
            timer = setTimeout(
              () => this.onended?.(),
              Math.max(
                0,
                (at - performance.now() / 1000 + this.buffer.duration) * 1000,
              ),
            );
          },
          stop() {
            clearTimeout(timer);
            this.onended?.();
          },
        };
      }
    };
  });
  await page.goto("/?view=chat&tab=Settings");
}
test("Gemini plays streamed chunks before generation completes and schedules them contiguously", async ({
  page,
}) => {
  await streamingVoice(page);
  const happy = page
    .locator(".mood-previews")
    .getByRole("button", { name: "Happy", exact: true });
  await happy.click();
  await expect
    .poll(() => page.evaluate(() => !!(window as any).__speechRequest))
    .toBe(true);
  await expect(happy).toBeDisabled();
  await page.evaluate(() => {
    const w = window as any;
    for (let i = 0; i < 2; i++)
      w.__emit("voice-audio", {
        requestId: w.__speechRequest.requestId,
        pcm: Array(4800).fill(0),
        sampleRate: 24000,
      });
  });
  expect(await page.evaluate(() => (window as any).__speechPending)).toBe(true);
  const starts = await page.evaluate(() => (window as any).__audioStarts);
  expect(starts).toHaveLength(2);
  expect(starts[1].at - starts[0].at).toBeCloseTo(starts[0].duration, 3);
  await page.evaluate(() => (window as any).__finishSpeech());
  await expect(happy).toBeEnabled();
});
test("stopping while Gemini is preparing prevents late audio from playing", async ({
  page,
}) => {
  await streamingVoice(page);
  const happy = page
    .locator(".mood-previews")
    .getByRole("button", { name: "Happy", exact: true });
  await happy.click();
  await expect
    .poll(() => page.evaluate(() => !!(window as any).__speechRequest))
    .toBe(true);
  await page
    .locator(".mood-previews")
    .getByRole("button", { name: "Stop", exact: true })
    .click();
  await page.evaluate(() => {
    const w = window as any;
    w.__emit("voice-audio", {
      requestId: w.__speechRequest.requestId,
      pcm: Array(4800).fill(0),
      sampleRate: 24000,
    });
  });
  await expect(happy).toBeEnabled();
  expect(await page.evaluate(() => (window as any).__audioStarts)).toEqual([]);
});

test("local voice setup installs Kokoro and enables previews without restarting", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as any;
    let ready = false;
    const previous = w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.invoke = async (command: string, args: any) => {
      if (command === "character_voice")
        return ready ? { engine: "kokoro", speed: 1, gain: 1 } : null;
      if (command === "install_voice_engine" && args.engine === "kokoro:v1") {
        ready = true;
        w.__calls.push({ command, args });
        return;
      }
      return previous(command, args);
    };
  });
  await page.goto("/?view=chat&tab=Settings");
  await expect(
    page
      .locator(".mood-previews")
      .getByRole("button", { name: "Happy", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Install local voice · 360 MB", exact: true })
    .click();
  await expect(
    page
      .locator(".mood-previews")
      .getByRole("button", { name: "Happy", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByText("Luna's own voice", { exact: true }),
  ).toBeVisible();
});
test("VRM gestures move real bones and deform facial meshes at high resolution", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto("/?view=chat&tab=Characters");
  await page.getByRole("button", { name: /Haru · 3D/ }).click();
  await expect(
    page.locator('.character-scene[data-model-ready="true"]'),
  ).toBeVisible({ timeout: 30000 });
  const result = await page.evaluate(async () => {
    const modelModule = "/src/vrmModel.ts",
      motionModule = "/src/vrmMotion.ts";
    const { loadVrm } = await import(modelModule);
    const { animateVrm } = await import(motionModule);
    const vrm = await loadVrm(
      await (await fetch("/models/haru.vrm")).arrayBuffer(),
    );
    const state = {
      expression: "idle",
      activity: "idle",
      body: "idle",
      mouth: 0,
      intensity: 1,
    };
    animateVrm(vrm, state, 0, 1, true);
    const arm = vrm.humanoid.getNormalizedBoneNode("rightUpperArm");
    const neutral = arm.quaternion.clone();
    vrm.update(0.016);
    vrm.scene.updateMatrixWorld(true);
    const hand = vrm.humanoid.getRawBoneNode("rightHand");
    const neutralHandZ = hand.getWorldPosition(hand.position.clone()).z;
    animateVrm(vrm, { ...state, expression: "happy" }, 1, 1, false);
    const gesture = neutral.angleTo(arm.quaternion);
    vrm.update(0.016);
    vrm.scene.updateMatrixWorld(true);
    const forwardHand =
      hand.getWorldPosition(hand.position.clone()).z - neutralHandZ;
    const expression = vrm.expressionManager.getExpression("angry");
    vrm.expressionManager.setValue("angry", 1);
    vrm.update(0.016);
    let morphed = false;
    vrm.scene.traverse((object: any) => {
      if (object.morphTargetInfluences?.some((value: number) => value > 0.9))
        morphed = true;
    });
    const canvas = document.querySelector(
      ".character-scene canvas",
    ) as HTMLCanvasElement;
    return {
      forwardHand,
      gesture,
      morphed,
      weight: expression.weight,
      ratio: canvas.width / canvas.getBoundingClientRect().width,
    };
  });
  expect(result.gesture).toBeGreaterThan(0.5);
  expect(result.forwardHand).toBeGreaterThan(0.05);
  expect(result.morphed).toBe(true);
  expect(result.weight).toBe(1);
  expect(result.ratio).toBeGreaterThanOrEqual(1.9);
  await page
    .getByLabel("Pet expression", { exact: true })
    .selectOption("angry");
  await page.screenshot({ path: "test-results/haru-gesture.png" });
});

test("companion commands choose actions without a manual mode selector", async ({
  page,
}) => {
  await page.goto("/?view=chat&tab=Characters");
  await expect(page.getByLabel("Pet mode", { exact: true })).toHaveCount(0);
  await expect(
    page
      .getByLabel("Pet display")
      .getByRole("option", { name: /All monitors/ }),
  ).toHaveCount(1);
  await page.getByLabel("Pet display").selectOption("all");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("mivuneko.preferences.v1") ?? "{}")
          .monitor,
    ),
  ).toBe("all");
  await page
    .getByRole("button", { name: "Conversations", exact: true })
    .click();
  for (const [text, mode] of [
    ["walk to the left", "walk"],
    ["run to the top right", "run"],
    ["sit down", "sit"],
    ["resume automatic behavior", "auto"],
  ]) {
    await page.getByLabel("Message Mivuneko", { exact: true }).fill(text);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("mivuneko.preferences.v1") ?? "{}")
              .petMode,
        ),
      )
      .toBe(mode);
  }
});
test("screen help previews an image before any cloud request", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as any,
      previous = w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.invoke = async (command: string, args: any) => {
      if (command === "capture_screen") {
        w.__calls.push({ command, args });
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 16;
        return Array.from(
          atob(canvas.toDataURL("image/jpeg").split(",")[1]),
          (c) => c.charCodeAt(0),
        );
      }
      if (command === "analyze_screen") {
        w.__calls.push({ command, args });
        return "The screenshot shows the test desktop.";
      }
      return previous(command, args);
    };
  });
  await page.goto("/?view=chat");
  await page
    .getByLabel("Message Mivuneko", { exact: true })
    .fill("help me understand my screen");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Share a screenshot" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as any).__calls.filter(
          (c: any) => c.command === "analyze_screen",
        ).length,
    ),
  ).toBe(0);
  await page
    .getByRole("button", { name: "Share screenshot with Gemini", exact: true })
    .click();
  await expect(page.getByRole("log")).toContainText("test desktop");
});
test("captions appearing do not change the character's position", async ({
  page,
}) => {
  await page.goto("/");
  const character = page.getByRole("group", { name: /Mivuneko character/ });
  const before = await character.boundingBox();
  await page.evaluate(() => {
    const channel = new BroadcastChannel("mivuneko.session");
    channel.postMessage({
      mood: "happy",
      text: "Hello from a caption",
      at: Date.now(),
      mouth: 0,
    });
    channel.close();
  });
  await expect(page.getByText("Hello from a caption")).toBeVisible();
  const after = await character.boundingBox();
  expect(after!.y).toBe(before!.y);
});
