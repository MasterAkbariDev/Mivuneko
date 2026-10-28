import { test as base, expect } from "@playwright/test";
const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (e) => {
        if (e.type() === "error") errors.push(e.text());
      });
      await use();
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});
async function chat(page: any) {
  await page.goto("/?view=chat");
  await page.getByRole("button", { name: "Meet Mivuneko" }).click();
}
async function ask(page: any, text: string) {
  await page.getByLabel("Message Mivuneko", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}
test("pet renders 3D, changes pose, and exposes honest voice preview", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem(
      "mivuneko.preferences.v1",
      JSON.stringify({ character: "chibi" }),
    ),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Companion menu" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Original chibi prototype character" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Companion menu" }).click();
  await page.getByRole("button", { name: "Pet options" }).click();
  await page.getByRole("button", { name: "Sit", exact: true }).click();
  await expect(page.locator(".pet-character")).toHaveClass(/body-sit/);
  await page.getByLabel("Pet voice mode").selectOption("push-to-talk");
  await expect(page.locator(".pet-voice")).toContainText(
    "No microphone recording",
  );
  await page.getByLabel("Pet character").selectOption("mock-cat");
  await expect(
    page.getByRole("img", { name: /Original mock cat avatar/ }),
  ).toBeVisible();
  await expect(page.locator(".vite-error-overlay")).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("launch approval, deny, allow, activity and unknown app", async ({
  page,
}) => {
  await chat(page);
  await ask(page, "Open Telegram");
  await expect(page.getByRole("dialog")).toContainText("Open Telegram?");
  await page.getByRole("button", { name: "Deny", exact: true }).click();
  await expect(page.getByRole("log")).toContainText("Launch denied");
  await ask(page, "Open Telegram");
  await page.getByRole("button", { name: "Allow once" }).click();
  await expect(page.getByRole("log")).toContainText("Mock launch: Telegram");
  await ask(page, "Open cmd.exe");
  await expect(page.getByRole("alert")).toContainText(
    "No unique installed app",
  );
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(page.locator(".page")).toContainText("Mock launch: Telegram");
  await page.getByRole("button", { name: "Delete log" }).click();
  await expect(page.locator(".page")).toContainText("No tools have run");
});
test("Chat mode has no tools and disabling permission fails closed", async ({
  page,
}) => {
  await chat(page);
  await page.getByLabel("Companion mode").selectOption("Chat");
  await ask(page, "Open Telegram");
  await expect(page.getByRole("log")).toContainText("Switch to Assist");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Companion mode").selectOption("Assist");
  await page.getByRole("button", { name: "Permissions", exact: true }).click();
  await page.getByLabel("App launching", { exact: true }).uncheck();
  await page
    .getByRole("button", { name: "Conversations", exact: true })
    .click();
  await ask(page, "Open Telegram");
  await expect(page.getByRole("alert")).toContainText(
    "App launching is disabled",
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("Stop cancels pending approval and modal traps keyboard focus", async ({
  page,
}) => {
  await chat(page);
  await ask(page, "Open Notepad");
  await expect(
    page.getByRole("button", { name: "Deny", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    page.getByRole("button", { name: "Cancel request" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Deny", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Cancel request" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(page.locator(".page")).toContainText(
    "Stopped; pending approvals revoked",
  );
});
test("settings and chat activity synchronize to an already open pet", async ({
  page,
  context,
}) => {
  await page.goto("/");
  const main = await context.newPage();
  await chat(main);
  await main.getByRole("button", { name: "Settings", exact: true }).click();
  await main.getByLabel("Character", { exact: true }).selectOption("mock-cat");
  await expect(
    page.getByRole("img", { name: /Original mock cat avatar/ }),
  ).toBeVisible();
  await main.getByLabel("Do not disturb", { exact: true }).check();
  await expect(page.locator(".pet-bubble")).toContainText("do not disturb");
  await main.getByLabel("Do not disturb", { exact: true }).uncheck();
  await main
    .getByRole("button", { name: "Conversations", exact: true })
    .click();
  await ask(main, "Open Telegram");
  await expect(page.locator(".pet-bubble small")).toContainText("approval");
  await main.getByRole("button", { name: "Allow once" }).click();
  await expect(page.locator(".pet-bubble p")).toContainText(
    "Mock launch: Telegram",
  );
});
test("VRM import rejects invalid containers without crashing", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Companion menu" }).click();
  await page.getByRole("button", { name: "Pet options" }).click();
  await page.getByLabel("Pet character").selectOption("local-vrm");
  await page.getByLabel("Import VRM").setInputFiles({
    name: "bad.vrm",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("bad"),
  });
  await expect(page.getByRole("alert")).toContainText("Invalid VRM/GLB");
  await expect(
    page.getByRole("button", { name: "Companion menu" }),
  ).toBeVisible();
});
test("narrow chat remains usable without horizontal page overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await chat(page);
  await expect(
    page.getByLabel("Message Mivuneko", { exact: true }),
  ).toBeVisible();
  const sidebar = await page.locator("aside").boundingBox();
  const selected = await page
    .getByRole("button", { name: "Conversations", exact: true })
    .boundingBox();
  expect(selected!.x + selected!.width).toBeLessThanOrEqual(
    sidebar!.x + sidebar!.width,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("proactive check-in happens once while unanswered and respects quiet default", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-27T14:00:00Z") });
  await page.addInitScript(() =>
    localStorage.setItem(
      "mivuneko.preferences.v1",
      JSON.stringify({ proactive: true, character: "mock-cat" }),
    ),
  );
  await page.goto("/");

  await page.clock.fastForward(31 * 60 * 1000);
  await expect(page.locator(".pet-bubble")).toContainText("Want some company?");
  await page.clock.fastForward(60 * 60 * 1000);
  await expect(page.locator(".pet-bubble p")).toHaveText(
    "Want some company? You can open Chat whenever you like.",
  );
});

test("installed app picker still requires approval", async ({ page }) => {
  await chat(page);
  await page.getByRole("button", { name: "Apps", exact: true }).click();
  await page
    .getByRole("button", { name: "Request Calculator", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Open Calculator?");
  await page.getByRole("button", { name: "Allow once" }).click();
  await expect(page.getByRole("log")).toContainText("Mock launch: Calculator");
});
test("opt-in history survives reload and disabling it deletes storage", async ({
  page,
}) => {
  await chat(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Remember conversations on this device").check();
  await page
    .getByRole("button", { name: "Conversations", exact: true })
    .click();
  await ask(page, "A remembered hello");
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("mivuneko.history.v1")),
    )
    .toContain("A remembered hello");
  await page.reload();
  await expect(page.getByRole("log")).toContainText("A remembered hello");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Remember conversations on this device").uncheck();
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("mivuneko.history.v1")),
    )
    .toBe(null);
});
async function fakeNative(page: any, voice = false) {
  await page.addInitScript((withVoice: boolean) => {
    const w = window as any;
    w.__calls = [];
    w.__TAURI_INTERNALS__ = {
      invoke: async (command: string, args: any) => {
        w.__calls.push({ command, args });
        if (command === "hermes_chat")
          return JSON.stringify({
            text: "Live adapter response",
            emotion: "curious",
          });
        if (command === "hermes_status")
          return "Connected to a tool-free local Hermes profile";
        if (command === "list_apps")
          return [{ id: "calculator", name: "Calculator" }];
        if (command === "request_launch")
          return {
            id: "test-native-request",
            app: { id: "calculator", name: "Calculator" },
          };
        if (command === "resolve_launch")
          return { ok: true, message: "Launch requested for Calculator." };
        if (command === "transcribe_audio") return "Open Calculator";
        return null;
      },
      transformCallback: () => 1,
      unregisterCallback: () => {},
    };
    localStorage.setItem(
      "mivuneko.preferences.v1",
      JSON.stringify({
        backend: withVoice ? "offline" : "hermes",
        voice: withVoice ? "push-to-talk" : "off",
      }),
    );
  }, voice);
}
test("native Hermes adapter sends typed chat and renders emotion reply", async ({
  page,
}) => {
  await fakeNative(page);
  await chat(page);
  await ask(page, "Hello Hermes");
  await expect(page.getByRole("log")).toContainText("Live adapter response");
  const calls = await page.evaluate(() => (window as any).__calls);
  const call = calls.find((c: any) => c.command === "hermes_chat");
  expect(call.args.mode).toBe("Assist");
  expect(call.args.messages.at(-1).content).toBe("Hello Hermes");
  expect(JSON.stringify(call.args)).not.toContain("key");
});
test("synthetic microphone recording converts to WAV and routes transcript into consent", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["microphone"]);
  await fakeNative(page, true);
  await chat(page);
  await page
    .getByRole("button", { name: "Record", exact: true })
    .evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
  await expect(
    page.getByRole("button", { name: "Finish recording", exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(500);
  await page
    .getByRole("button", { name: "Finish recording", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Open Calculator?");
  const wav = await page.evaluate(
    () =>
      (window as any).__calls.find((c: any) => c.command === "transcribe_audio")
        .args.wav,
  );
  expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
  expect(wav.length).toBeGreaterThan(44);
  expect(
    await page.evaluate(
      () =>
        (window as any).__calls.filter(
          (c: any) => c.command === "transcribe_audio",
        ).length,
    ),
  ).toBe(1);
});

test("native turn guard prevents duplicate asynchronous submissions", async ({
  page,
}) => {
  await fakeNative(page);
  await chat(page);
  await page
    .getByLabel("Message Mivuneko", { exact: true })
    .fill("One request only");
  await page.locator("form").evaluate((form) => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  await expect(page.getByRole("log")).toContainText("Live adapter response");
  const count = await page.evaluate(
    () =>
      (window as any).__calls.filter((c: any) => c.command === "hermes_chat")
        .length,
  );
  expect(count).toBe(1);
});

test("inline chat stays beneath the pet, shares messages, and approves apps", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Companion menu" }).click();
  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await expect(page.getByLabel("Message beneath pet")).toBeFocused();
  expect(context.pages()).toHaveLength(1);
  await page.getByLabel("Message beneath pet").fill("Open Telegram");
  await page.getByRole("button", { name: "Send", exact: false }).click();
  await expect(
    page.getByRole("group", { name: "App launch approval" }),
  ).toContainText("Open Telegram?");
  await page.getByRole("button", { name: "Deny", exact: true }).click();
  await expect(page.getByRole("log")).toContainText("Launch denied");
  const main = await context.newPage();
  await chat(main);
  await expect(main.getByRole("log")).toContainText("Launch denied");
});

test("expressive bundled VRM exposes morphs and head anger effect", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Companion menu" }).click();
  await page.getByRole("button", { name: "Pet options" }).click();
  await page.getByLabel("Pet character").selectOption("sample-vrm");
  await expect(page.locator(".model-info")).toContainText("pixiv Inc.");
  await expect(page.locator(".model-info")).toContainText("angry");
  await page.getByLabel("Emotion preview").selectOption("angry");
  await expect(page.locator(".character-scene")).toHaveAttribute(
    "data-emotion",
    "angry",
  );
  await expect(page.locator(".character-scene")).toHaveAttribute(
    "data-model-ready",
    "true",
    { timeout: 20000 },
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("Gemini configuration stays out of storage and chat/voice use native commands", async ({
  page,
}) => {
  await fakeNative(page);
  await page.addInitScript(() => {
    const w = window as any;
    const previous = w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.invoke = async (command: string, args: any) => {
      if (
        !command.startsWith("gemini_") &&
        !["configure_gemini", "clear_gemini"].includes(command)
      )
        return previous(command, args);
      w.__calls.push({ command, args });
      if (command === "gemini_status")
        return {
          configured: false,
          keyCount: 0,
          proxyEnabled: false,
          chatModel: "",
        };
      if (command === "configure_gemini")
        return {
          configured: true,
          keyCount: args.config.keys.length,
          proxyEnabled: true,
          chatModel: args.config.chatModel,
        };
      if (command === "gemini_chat")
        return JSON.stringify({
          text: "A playful grumble!",
          emotion: "angry",
          appQuery: "",
        });
      if (command === "gemini_transcribe") return "Hello Mivuneko";
      if (command === "gemini_speak") {
        const bytes = new Uint8Array(44 + 3200),
          view = new DataView(bytes.buffer);
        const str = (offset: number, value: string) =>
          [...value].forEach((c, i) =>
            view.setUint8(offset + i, c.charCodeAt(0)),
          );
        str(0, "RIFF");
        view.setUint32(4, bytes.length - 8, true);
        str(8, "WAVEfmt ");
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, 16000, true);
        view.setUint32(28, 32000, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        str(36, "data");
        view.setUint32(40, 3200, true);
        return Array.from(bytes);
      }
      return null;
    };
  });
  await chat(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByLabel("Gemini API keys")
    .fill("test_key_12345\n\n test_key_67890 \ntest_key_12345");
  await page
    .getByLabel("Gemini proxy", { exact: true })
    .fill("socks5h://localhost:1080");
  await page
    .getByRole("button", { name: "Apply Gemini configuration" })
    .click();
  await expect(page.getByLabel("Gemini API keys")).toHaveValue(
    "test_key_12345\n\n test_key_67890 \ntest_key_12345",
  );
  await expect(page.getByLabel("Gemini proxy", { exact: true })).toHaveValue(
    "socks5h://localhost:1080",
  );
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    "test_key",
  );
  await page
    .getByLabel("Voice mode", { exact: true })
    .selectOption("push-to-talk");
  await page
    .getByRole("button", { name: "Conversations", exact: true })
    .click();
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Finish recording" }),
  ).toBeVisible();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Finish recording" }).click();
  await expect(page.getByRole("log")).toContainText("A playful grumble!");
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__calls.some((x: any) => x.command === "gemini_speak"),
      ),
    )
    .toBe(true);
  const calls = await page.evaluate(() => (window as any).__calls);
  expect(
    calls.find((c: any) => c.command === "configure_gemini").args.config.keys,
  ).toEqual([
    { key: "test_key_12345", project: "shared" },
    { key: "test_key_67890", project: "shared" },
  ]);
  expect(
    calls
      .find((c: any) => c.command === "gemini_transcribe")
      .args.wav.slice(0, 4),
  ).toEqual([82, 73, 70, 70]);
  expect(
    calls.find((c: any) => c.command === "gemini_speak").args.emotion,
  ).toBe("angry");
});

test("connection drafts and masked previews survive tab changes", async ({
  page,
}) => {
  await chat(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const keys = "AIzaTEST_FIRST_1234\nAIzaTEST_SECOND_5678\nAIzaTEST_FIRST_1234";
  await page.getByLabel("Gemini API keys", { exact: true }).fill(keys);
  await page
    .getByLabel("Gemini proxy", { exact: true })
    .fill("socks5h://127.0.0.1:1080");
  await expect(page.locator(".key-row")).toHaveCount(2);
  await expect(page.locator(".key-row").first()).toContainText(
    "AIza••••••••1234",
  );
  await expect(
    page.getByLabel("Gemini proxy", { exact: true }),
  ).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Gemini API keys", { exact: true })).toHaveValue(
    keys,
  );
  await expect(page.getByLabel("Gemini proxy", { exact: true })).toHaveValue(
    "socks5h://127.0.0.1:1080",
  );
  await expect(page.locator(".key-row")).toHaveCount(2);
  const persisted = await page.evaluate(() =>
    JSON.stringify({ ...localStorage, ...sessionStorage }),
  );
  expect(persisted).not.toContain("AIzaTEST");
});

test("native diagnostics identify each key, retain results and preserve proxy on clear", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let configured = false;
    (window as any).__TAURI_INTERNALS__ = {
      transformCallback: () => 1,
      unregisterCallback: () => {},
      invoke: async (command: string, args: any) => {
        if (command === "gemini_status" || command === "configure_gemini") {
          if (command === "configure_gemini") configured = true;
          return {
            configured,
            keyCount: configured ? 2 : 0,
            proxyEnabled: true,
            chatModel: "gemini-3.8-flash",
          };
        }
        if (command === "test_gemini_connection") {
          await new Promise((resolve) => setTimeout(resolve, 200));
          if (args.proxyOnly)
            return [
              {
                index: 0,
                ok: true,
                message: "HTTPS reached Google · HTTP 404",
              },
            ];
          const ok = args.config.keys[0].key.endsWith("1234");
          return [
            {
              index: 0,
              ok,
              message: ok
                ? "Working · authenticated; chat model accessible"
                : "Rejected · invalid API key",
            },
          ];
        }
        if (command === "clear_gemini") configured = false;
        if (command === "load_history") return "[]";
        return null;
      },
    };
  });
  await chat(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByLabel("Gemini API keys", { exact: true })
    .fill("AIzaTEST_FIRST_1234\nAIzaTEST_SECOND_5678");
  await page
    .getByLabel("Gemini proxy", { exact: true })
    .fill("socks5h://127.0.0.1:1080");
  await page
    .getByRole("button", { name: "Test all keys", exact: true })
    .click();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.locator(".key-row").first()).toContainText("Working");
  await expect(page.locator(".key-row").nth(1)).toContainText("Rejected");
  await expect(
    page.getByRole("status").filter({ hasText: "1 of 2 keys working" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Test proxy", exact: true }).click();
  await expect(page.locator(".connection-result")).toContainText("Connected");
  await page
    .getByRole("button", { name: "Apply Gemini configuration" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Configuration applied" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Gemini API keys", { exact: true }),
  ).not.toHaveValue("");
  await page.getByRole("button", { name: "Clear keys", exact: true }).click();
  await expect(page.locator(".key-row")).toHaveCount(0);
  await expect(page.getByLabel("Gemini proxy", { exact: true })).toHaveValue(
    "socks5h://127.0.0.1:1080",
  );
});

test("long conversations keep the composer visible and reveal the latest reply", async ({
  page,
}) => {
  await chat(page);
  for (let index = 0; index < 5; index++) {
    await ask(
      page,
      `Long message ${index}: ${"A little company. ".repeat(50)}`,
    );
    await expect(
      page.getByRole("log").locator(".message.assistant"),
    ).toHaveCount(index + 2);
  }
  await expect(
    page.getByLabel("Message Mivuneko", { exact: true }),
  ).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "Send", exact: true }),
  ).toBeInViewport();
  const scroll = await page.getByRole("log").evaluate((element) => ({
    remaining: element.scrollHeight - element.scrollTop - element.clientHeight,
    overflowing: element.scrollHeight > element.clientHeight,
  }));
  expect(scroll.overflowing).toBe(true);
  expect(scroll.remaining).toBeLessThan(3);
});

test("illustrated companion supports sleep, expressions, and keyboard menu dismissal", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("img", { name: "Luna illustrated companion, idle" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Companion status and actions", exact: true })
    .click();
  await page.getByRole("button", { name: "Sleep", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Luna illustrated companion, sleeping" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Companion status and actions",
      exact: true,
    }),
  ).toContainText("Dreaming");
  await page
    .getByRole("button", { name: "Companion menu", exact: true })
    .click();
  await page.getByRole("button", { name: "Pet options" }).click();
  await page.getByLabel("Emotion preview").selectOption("surprised");
  await expect(
    page.getByRole("img", { name: "Luna illustrated companion, surprised" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close pet options" }).focus();
  await page.keyboard.press("Escape");
  await expect(page.locator(".pet-voice")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Companion menu", exact: true }),
  ).toBeFocused();
});

test("redesigned settings remain usable on a narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await chat(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByLabel("Gemini API keys", { exact: true })
    .fill("AIzaDEMO_FIRST_1234");
  await page
    .getByLabel("Gemini proxy", { exact: true })
    .fill("socks5h://127.0.0.1:10808");
  await expect(page.locator(".key-row")).toContainText("AIza••••••••1234");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel("Character", { exact: true }).selectOption("luna");
  await expect(page.getByLabel("Character", { exact: true })).toHaveValue(
    "luna",
  );
});
