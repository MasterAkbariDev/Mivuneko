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
  await page.getByRole("tab", { name: "3D Animated VRM", exact: true }).click();
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
  await page.getByRole("tab", { name: "3D Animated VRM", exact: true }).click();
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
    animateVrm(vrm, { ...state, body: "sit" }, 2, 1, false);
    const hips = vrm.humanoid.getNormalizedBoneNode("hips"),
      seated = hips.position.y;
    animateVrm(vrm, { ...state, body: "sit" }, 2, 1, false, true);
    const dragLift = hips.position.y - seated;
    animateVrm(vrm, { ...state, body: "sit" }, 2, 1, false);
    const restoredPose = Math.abs(hips.position.y - seated);
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
      dragLift,
      restoredPose,
      gesture,
      morphed,
      weight: expression.weight,
      ratio: canvas.width / canvas.getBoundingClientRect().width,
    };
  });
  expect(result.dragLift).toBeGreaterThan(0.3);
  expect(result.restoredPose).toBeLessThan(0.01);
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
  ).toHaveCount(0);
  await page.getByLabel("Pet display").selectOption("current");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("mivuneko.preferences.v1") ?? "{}")
          .monitor,
    ),
  ).toBe("current");
  await page
    .getByRole("button", { name: "Conversations", exact: true })
    .click();
  for (const [text, mode] of [
    ["walk to the left", "walk"],
    ["run to the top right", "run"],
    ["sit down", "sit"],
    ["stand up", "stand"],
    ["sit down", "sit"],
    ["walk to the left", "walk"],
    ["I cannot code, go out of the code screen", "walk"],
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

test("pet hover dock opens a compact composer and edit mode starts locked", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "mivuneko.preferences.v1",
      JSON.stringify({ renderer: "sample-vrm", petMode: "sit", petScale: 1.5 }),
    );
    localStorage.setItem("mivuneko.automatic-behavior.v1", "1");
    const w = window as any,
      previous = w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.metadata = {
      currentWindow: { label: "pet" },
      currentWebview: { label: "pet" },
    };
    w.__TAURI_INTERNALS__.invoke = async (command: string, args: any) => {
      if (command === "pet_cursor") return { x: 0, y: 0, down: false };
      return previous(command, args);
    };
  });
  await page.goto("/?view=pet");
  await expect(
    page.locator('.character-scene[data-model-ready="true"]'),
  ).toBeVisible({ timeout: 30000 });
  const points = await page.evaluate(() => {
    const canvas = document.querySelector("canvas") as any,
      r = canvas.getBoundingClientRect();
    const inside: Array<{ x: number; y: number }> = [];
    for (let y = r.top + 10; y < r.bottom; y += 12)
      for (let x = r.left + 10; x < r.right; x += 12)
        if (canvas.petHit(x, y)) inside.push({ x, y });
    return { inside, corner: canvas.petHit(r.left + 2, r.top + 2) };
  });
  expect(points.inside.length).toBeGreaterThan(5);
  expect(points.corner).toBe(false);
  // Native cursor fixture is outside the pet; reveal just the dock for DOM behavior checks.
  await page
    .locator(".pet-dock")
    .evaluate((el) => el.classList.add("is-visible"));
  await page.getByRole("button", { name: "Quick chat", exact: true }).click();
  const input = page.getByLabel("Message your companion");
  await expect(input).toBeFocused();
  await input.fill("stand up");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__calls.some(
          (c: any) =>
            c.command === "plugin:event|emit_to" &&
            c.args.event === "pet-message" &&
            c.args.payload === "stand up",
        ),
      ),
    )
    .toBe(true);
  await expect(input).toBeVisible();
  await expect(input).toHaveValue("");
  await page.getByRole("button", { name: "Close quick chat" }).click();
  await page
    .locator(".pet-dock")
    .evaluate((el) => el.classList.add("is-visible"));
  await page.getByRole("button", { name: "Unlock pet editing" }).click();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("mivuneko.preferences.v1")!).petEdit,
    ),
  ).toBe(true);
});

test("microphone dot is quiet, active-only, stable across animation and optional", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.__TAURI_INTERNALS__.metadata = {
      currentWindow: { label: "pet" },
      currentWebview: { label: "pet" },
    };
    localStorage.setItem(
      "mivuneko.preferences.v1",
      JSON.stringify({
        renderer: "sample-vrm",
        petScale: 1,
        petMode: "stand",
        micIndicator: true,
      }),
    );
    localStorage.setItem("mivuneko.automatic-behavior.v1", "1");
  });
  await page.goto("/?view=pet");
  await expect(
    page.locator('.character-scene[data-model-ready="true"]'),
  ).toBeVisible({ timeout: 30000 });
  const dot = page.getByRole("img", { name: "Microphone active", exact: true });
  await expect(dot).toHaveCount(0);
  await page.evaluate(() => (window as any).__emit("voice-active", true));
  await expect(dot).toBeVisible();
  const before = await dot.boundingBox();
  expect(before!.width).toBe(5);
  expect(before!.height).toBe(5);
  await page.evaluate(async () => {
    const path = "/src/preferences.ts",
      p = await import(path);
    p.updatePreferences({ petMode: "walk", petExpression: "angry" });
  });
  await expect(page.locator(".character-scene")).toHaveAttribute(
    "data-emotion",
    "angry",
  );
  const after = await dot.boundingBox();
  expect(after!.x).toBe(before!.x);
  expect(after!.y).toBe(before!.y);
  expect(await dot.evaluate((e) => getComputedStyle(e).boxShadow)).toBe("none");
  await page.evaluate(() => (window as any).__emit("voice-active", false));
  await expect(dot).toHaveCount(0);
  await page.evaluate(() => (window as any).__emit("voice-active", true));
  await expect(dot).toBeVisible();
  await page.evaluate(async () => {
    const path = "/src/preferences.ts",
      p = await import(path);
    p.updatePreferences({ micIndicator: false });
  });
  await expect(dot).toHaveCount(0);
});
test("speech-engine selectors stay compact instead of inheriting text-field dimensions", async ({
  page,
}) => {
  await page.goto("/?view=chat&tab=Settings");
  await page
    .getByRole("button", { name: "Voice & input", exact: true })
    .click();
  const radios = page.locator(".engine input[type=radio]");
  await expect(radios).toHaveCount(3);
  for (const radio of await radios.all()) {
    const r = await radio.boundingBox();
    expect(r!.width).toBe(18);
    expect(r!.height).toBe(18);
  }
});
test("custom companion names persist and use companion-neutral speech settings", async ({
  page,
}) => {
  await page.goto("/?view=chat&tab=Characters");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Companion name", { exact: true }).fill("Yuki Chan");
  await page.reload();
  await expect(page.getByLabel("Companion name", { exact: true })).toHaveValue(
    "Yuki Chan",
  );
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Voice & input", exact: true })
    .click();
  await expect(
    page.getByText("Interrupt your companion by speaking", { exact: true }),
  ).toBeVisible();
});

test("zoom grows beyond the display while the dock and its actions stay visible", async ({
  page,
}) => {
  await page.addInitScript(() => {
    delete (window as any).__TAURI_INTERNALS__;
    localStorage.setItem(
      "mivuneko.preferences.v1",
      JSON.stringify({
        renderer: "sample-vrm",
        petScale: 1,
        petMode: "stand",
        petEdit: true,
      }),
    );
    localStorage.setItem("mivuneko.automatic-behavior.v1", "1");
  });
  await page.setViewportSize({ width: 1000, height: 720 });
  await page.goto("/?view=pet");
  await expect(
    page.locator('.character-scene[data-model-ready="true"]'),
  ).toBeVisible({ timeout: 30000 });
  const read = () =>
    page.evaluate(() => {
      const c = document.querySelector("canvas") as any,
        r = c.getBoundingClientRect();
      let pixels = 0;
      for (let y = r.top + 2; y < r.bottom; y += 8)
        for (let x = r.left + 2; x < r.right; x += 8)
          if (c.petHit(x, y)) pixels++;
      return pixels;
    });
  const small = await read();
  await page.evaluate(async () => {
    const path = "/src/preferences.ts",
      p = await import(path);
    p.updatePreferences({ petScale: 10 });
  });
  await expect
    .poll(() =>
      page
        .locator(".pet-character")
        .evaluate((e) => e.getBoundingClientRect().height),
    )
    .toBeGreaterThan(720);
  await expect.poll(read).toBeGreaterThan(small * 2);
  await page
    .getByRole("group", { name: /Mivuneko character/ })
    .dispatchEvent("dblclick");
  const input = page.getByLabel("Message your companion");
  await expect(input).toBeVisible();
  const rect = await input.boundingBox();
  expect(rect!.y).toBeGreaterThanOrEqual(0);
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(720);
  await page.getByRole("button", { name: "Close quick chat" }).click();
  await page
    .getByRole("group", { name: /Mivuneko character/ })
    .dispatchEvent("contextmenu", { button: 2 });
  await page.getByRole("menuitem", { name: "Reset size & find pet" }).click();
  await expect(page.locator(".character-scene")).toHaveAttribute(
    "data-zoom",
    "1",
  );
});

test("canvas follows its frame through repeated grow and shrink operations", async ({
  page,
}) => {
  await page.addInitScript(() => {
    delete (window as any).__TAURI_INTERNALS__;
    localStorage.setItem(
      "mivuneko.preferences.v1",
      JSON.stringify({ renderer: "sample-vrm", petScale: 1, petMode: "stand" }),
    );
    localStorage.setItem("mivuneko.automatic-behavior.v1", "1");
  });
  await page.setViewportSize({ width: 900, height: 720 });
  await page.goto("/?view=pet");
  await expect(
    page.locator('.character-scene[data-model-ready="true"]'),
  ).toBeVisible({ timeout: 30000 });
  for (const scale of [1, 3, 0.5, 10, 1]) {
    await page.evaluate(async (scale) => {
      const path = "/src/preferences.ts",
        p = await import(path);
      p.updatePreferences({ petScale: scale });
    }, scale);
    await expect
      .poll(() =>
        page
          .locator(".pet-character")
          .evaluate((e) => e.getBoundingClientRect().height),
      )
      .toBeCloseTo(320 * scale, 0);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const c = document.querySelector("canvas")!.getBoundingClientRect(),
            f = document
              .querySelector(".pet-character")!
              .getBoundingClientRect();
          return Math.abs(c.height - f.height);
        }),
      )
      .toBeLessThan(1);
    await expect(page.locator(".character-scene")).toHaveAttribute(
      "data-zoom",
      "1",
    );
  }
  const bounds = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>(".pet-root")!;
    return {
      bottom: parseFloat(root.style.getPropertyValue("--model-bottom")),
      height: innerHeight,
    };
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        parseFloat(
          document
            .querySelector<HTMLElement>(".pet-root")!
            .style.getPropertyValue("--model-bottom"),
        ),
      ),
    )
    .toBeLessThan(bounds.height - 48);
});

test("quick composer wraps vertically and remains open after sending", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.__TAURI_INTERNALS__.metadata = {
      currentWindow: { label: "pet" },
      currentWebview: { label: "pet" },
    };
  });
  await page.goto("/?view=pet");
  await page.getByRole("group", { name: /Mivuneko character/ }).dblclick();
  const box = page.getByLabel("Message your companion");
  await box.fill("A long message with several wrapped lines. ".repeat(20));
  const dimensions = await box.evaluate((e) => ({
    vertical: e.scrollHeight > e.clientHeight,
    horizontal: e.scrollWidth > e.clientWidth,
  }));
  expect(dimensions.vertical).toBe(true);
  expect(dimensions.horizontal).toBe(false);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(box).toBeVisible();
  await expect(box).toHaveValue("");
});

test("empty captions stay hidden and real captions receive vertical wheel scrolling", async ({
  page,
}) => {
  await page.goto("/?view=pet");
  await expect(page.locator(".pet-bubble")).toHaveCount(0);
  await page.evaluate(() => {
    const c = new BroadcastChannel("mivuneko.session");
    c.postMessage({
      mood: "speaking",
      text: "A long caption with complete text. ".repeat(14),
      mouth: 0,
      at: Date.now(),
    });
    c.close();
  });
  const caption = page.locator(".pet-bubble");
  await expect(caption).toBeVisible();
  await caption.hover();
  await page.mouse.wheel(0, 200);
  await expect
    .poll(() => caption.evaluate((e) => e.scrollTop))
    .toBeGreaterThan(0);
  const y = (await caption.boundingBox())!.y;
  await page.waitForTimeout(1200);
  expect(Math.abs((await caption.boundingBox())!.y - y)).toBeLessThan(1);
  await page.evaluate(() => {
    const c = new BroadcastChannel("mivuneko.session");
    c.postMessage({ mood: "idle", text: "", mouth: 0, at: Date.now() });
    c.close();
  });
  await expect(caption).toHaveCount(0);
});

test("dimensional galleries select models and expose the character manual", async ({
  page,
}) => {
  await page.goto("/?view=chat&tab=Characters");
  await expect(
    page.getByRole("tab", { name: "2D Illustrated poses", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("tab", { name: "2.5D Illustrations with depth", exact: true })
    .click();
  await page.getByRole("button", { name: "Mochi", exact: true }).click();
  await expect(page.locator(".depth-illustration")).toBeVisible();
  await page.getByRole("tab", { name: "3D Animated VRM", exact: true }).click();
  await expect(page.getByRole("button", { name: /Haru .*3D/ })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Luna", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: /Creating characters & voices/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Character guide", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Create and import a 3D character" }),
  ).toBeVisible();
});

test("LLM posture actions execute instead of only producing an acknowledgement", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as any,
      previous = w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.invoke = async (command: string, args: any) =>
      command === "hermes_chat"
        ? JSON.stringify({
            text: "I'll straighten up now.",
            emotion: "happy",
            companionActions: [{ kind: "stand" }],
          })
        : previous(command, args);
    localStorage.setItem(
      "mivuneko.preferences.v1",
      JSON.stringify({ backend: "hermes", petMode: "sit", voice: "off" }),
    );
    localStorage.setItem("mivuneko.automatic-behavior.v1", "1");
  });
  await page.goto("/?view=chat");
  await page
    .getByLabel("Message Mivuneko", { exact: true })
    .fill("Could you straighten your posture a little?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("mivuneko.preferences.v1")!).petMode,
      ),
    )
    .toBe("stand");
  await expect(
    page.getByText("Done. I finished the requested companion actions.", {
      exact: true,
    }),
  ).toBeVisible();
});

test("Haru keeps both feet in the camera through sitting and standing", async ({
  page,
}) => {
  await page.addInitScript(() => {
    delete (window as any).__TAURI_INTERNALS__;
    localStorage.setItem(
      "mivuneko.preferences.v1",
      JSON.stringify({ renderer: "sample-vrm", petMode: "sit", petScale: 1 }),
    );
    localStorage.setItem("mivuneko.automatic-behavior.v1", "1");
  });
  await page.goto("/?view=pet");
  const scene = page.locator(".character-scene[data-model-ready=true]");
  await expect(scene).toBeVisible({ timeout: 30000 });
  await expect(scene).toHaveAttribute("data-body", "sit");
  await page.waitForTimeout(1500);
  await expect(scene.locator("canvas")).toHaveAttribute(
    "data-feet-in-frame",
    "true",
  );
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem("mivuneko.preferences.v1")!);
    localStorage.setItem(
      "mivuneko.preferences.v1",
      JSON.stringify({ ...p, petMode: "stand" }),
    );
    window.dispatchEvent(
      new StorageEvent("storage", { key: "mivuneko.preferences.v1" }),
    );
  });
  await expect(scene).toHaveAttribute("data-body", "idle");
  await expect(scene.locator("canvas")).toHaveAttribute(
    "data-feet-in-frame",
    "true",
  );
});

for (const voiceKind of ["none", "prompt"] as const)
  test(`imported ${voiceKind} voice never borrows a built-in identity`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const w = window as any,
        previous = w.__TAURI_INTERNALS__.invoke;
      w.AudioContext = class {
        destination = {};
        currentTime = 0;
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
              a.fill(0);
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
      w.__TAURI_INTERNALS__.invoke = async (command: string, args: any) => {
        if (command === "hermes_chat")
          return JSON.stringify({
            text: "Hello, lovely to meet you.",
            emotion: "happy",
          });
        if (command === "gemini_speak_stream") {
          w.__calls.push({ command, args });
          w.__emit("voice-audio", {
            requestId: args.requestId,
            pcm: Array.from({ length: 4800 }, () => 0),
            sampleRate: 24000,
          });
          await new Promise((r) => setTimeout(r, 30));
          return;
        }
        return previous(command, args);
      };
    });
    await page.goto("/?view=chat");
    await page.evaluate(async (voiceKind) => {
      const path = "/src/characterPackStore.ts",
        { importPack } = await import(path);
      const image = await (await fetch("/characters/luna-atlas.png")).blob();
      const manifest = {
        schemaVersion: 1,
        id: "test.voice",
        name: "Voice test",
        author: "Test",
        license: "Original example",
        format: "2d",
        assets: {
          art: {
            type: "image",
            path: "art.png",
            grid: { columns: 3, rows: 2 },
          },
        },
        frames: { idle: { asset: "art", cell: [0, 0], anchor: [0.5, 0.96] } },
        poses: {
          idle: { frames: [{ frame: "idle", durationMs: 1000 }], loop: true },
        },
        voice:
          voiceKind === "none"
            ? { kind: "none" }
            : {
                kind: "prompt",
                prompt: "A clear, warm, airy character voice.",
              },
      };
      const pack = await importPack([
        new File([JSON.stringify(manifest)], "character.json", {
          type: "application/json",
        }),
        new File([image], "art.png", { type: "image/png" }),
      ]);
      const p = JSON.parse(
        localStorage.getItem("mivuneko.preferences.v1") || "{}",
      );
      localStorage.setItem(
        "mivuneko.preferences.v1",
        JSON.stringify({
          ...p,
          activePackId: pack.id,
          activePackName: pack.manifest.name,
          renderer: "2d",
          voice: "push-to-talk",
          voiceProvider: "gemini",
          backend: "hermes",
        }),
      );
      window.dispatchEvent(
        new StorageEvent("storage", { key: "mivuneko.preferences.v1" }),
      );
    }, voiceKind);
    await page
      .getByLabel("Message Mivuneko", { exact: true })
      .fill("Say a short hello");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(
      page.getByText("Hello, lovely to meet you.", { exact: true }),
    ).toBeVisible();
    if (voiceKind === "none") {
      await page.waitForTimeout(300);
      expect(
        await page.evaluate(
          () =>
            (window as any).__calls.filter(
              (c: any) =>
                c.command === "gemini_speak_stream" ||
                c.command === "synthesize_character",
            ).length,
        ),
      ).toBe(0);
    } else {
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as any).__calls.filter(
                (c: any) => c.command === "gemini_speak_stream",
              ).length,
          ),
        )
        .toBeGreaterThan(0);
      const call = await page.evaluate(() =>
        (window as any).__calls.find(
          (c: any) => c.command === "gemini_speak_stream",
        ),
      );
      expect(call.args.voicePrompt).toBe(
        "A clear, warm, airy character voice.",
      );
      expect(call.args.character).toBe("custom-pack");
    }
  });
