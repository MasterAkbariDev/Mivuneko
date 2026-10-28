import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.__calls = [];
    w.__micStops = 0;
    let installed = false;
    w.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    w.__TAURI_INTERNALS__ = {
      transformCallback: () => 1,
      unregisterCallback() {},
      invoke: async (command: string, args: any) => {
        w.__calls.push({ command, args });
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
          ];
        if (command === "install_voice_engine") {
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
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?view=chat&tab=Characters");
  await page.getByRole("button", { name: /3D VRM sample/ }).click();
  await expect(
    page.locator('.character-scene[data-model-ready="true"]'),
  ).toBeVisible({ timeout: 20000 });
  const pet = await context.newPage();
  await pet.goto("/");
  await expect(
    pet.locator('.character-scene[data-model-ready="true"]'),
  ).toBeVisible({ timeout: 20000 });
  await page
    .getByLabel("Import VRM file")
    .setInputFiles(
      resolve("apps/desktop/public/models/pixiv-expression-sample.vrm"),
    );
  await expect(
    page.getByRole("button", { name: /Your VRM model/ }),
  ).toHaveAttribute("aria-pressed", "true");
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
