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
}
async function settings(page: any, category = "Voice & input") {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: category, exact: true }).click();
}
async function ask(page: any, text: string) {
  await page.getByLabel("Message Mivuneko", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}
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
  await main.getByRole("button", { name: "Characters", exact: true }).click();
  await main.getByRole("button", { name: /^Miku/ }).click();
  await expect(
    page.getByRole("img", { name: /Miku · unofficial fan art 2D companion/ }),
  ).toBeVisible();
  await main.getByLabel("Do not disturb", { exact: true }).check();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("mivuneko.preferences.v1") || "{}")
            .focus,
      ),
    )
    .toBe(true);
  await main.getByLabel("Do not disturb", { exact: true }).uncheck();
  await main
    .getByRole("button", { name: "Conversations", exact: true })
    .click();
  await ask(main, "Open Telegram");
  await expect(page.locator(".luna-model")).toHaveAttribute(
    "data-emotion",
    "concerned",
  );
  await main.getByRole("button", { name: "Allow once" }).click();
  await expect(page.locator(".pet-bubble p")).toContainText(
    "Mock launch: Telegram",
  );
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
      JSON.stringify({ proactive: true, character: "luna" }),
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
  await settings(page, "Connections");
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
  await settings(page, "Connections");
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
    w.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    w.__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: "main" },
        currentWebview: { label: "main" },
      },
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
        if (command === "voice_engines") return [];
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
  await page.getByRole("button", { name: "Record", exact: true }).click();
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

test("double-clicking the pet opens quick chat without a utility window", async ({
  page,
}) => {
  await page.goto("/?view=pet");
  await page.getByRole("group", { name: /Mivuneko character/ }).dblclick();
  await expect(page.getByLabel("Message your companion")).toBeVisible();
  expect(page.context().pages()).toHaveLength(1);
});

test("Gemini configuration stays private while speech uses local commands", async ({
  page,
}) => {
  await fakeNative(page);
  await page.addInitScript(() => {
    const w = window as any;
    localStorage.setItem(
      "mivuneko.preferences.v1",
      JSON.stringify({ voiceProvider: "system" }),
    );
    const previous = w.__TAURI_INTERNALS__.invoke;
    let configured = false;
    w.__TAURI_INTERNALS__.invoke = async (command: string, args: any) => {
      if (
        !command.startsWith("gemini_") &&
        ![
          "configure_gemini",
          "clear_gemini",
          "transcribe_audio",
          "synthesize_speech",
        ].includes(command)
      )
        return previous(command, args);
      w.__calls.push({ command, args });
      if (command === "gemini_status")
        return {
          configured,
          keyCount: 0,
          proxyEnabled: false,
          chatModel: "",
        };
      if (command === "configure_gemini") {
        configured = true;
        return {
          configured: true,
          keyCount: args.config.keys.length,
          proxyEnabled: true,
          chatModel: args.config.chatModel,
        };
      }
      if (command === "gemini_chat_stream")
        return JSON.stringify({
          text: "A playful grumble!",
          emotion: "angry",
          appQuery: "",
        });
      if (command === "transcribe_audio") return "Hello Mivuneko";
      if (command === "synthesize_speech") {
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
  await settings(page, "Connections");
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
  await settings(page);
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
        (window as any).__calls.some(
          (x: any) => x.command === "synthesize_speech",
        ),
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
      .find((c: any) => c.command === "transcribe_audio")
      .args.wav.slice(0, 4),
  ).toEqual([82, 73, 70, 70]);
  expect(
    calls.find((c: any) => c.command === "synthesize_speech").args.character,
  ).toBe("luna");
});

test("connection drafts and masked previews survive tab changes", async ({
  page,
}) => {
  await chat(page);
  await settings(page, "Connections");
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
  await settings(page, "Connections");
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
    (window as any).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: () => {},
    };
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
  await settings(page, "Connections");
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
  await settings(page, "Connections");
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

test("redesigned settings remain usable on a narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await chat(page);
  await settings(page, "Connections");
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
  await page.getByRole("button", { name: "Characters", exact: true }).click();
  await page.getByRole("button", { name: "Luna", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Luna", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("approval policy automatically denies or approves recognized app launches", async ({
  page,
}) => {
  await chat(page);
  await page.getByRole("button", { name: "Permissions", exact: true }).click();
  await page.getByLabel("Approval mode").selectOption("deny");
  await page
    .getByRole("button", { name: "Conversations", exact: true })
    .click();
  await ask(page, "Open Telegram");
  await expect(page.getByRole("log")).toContainText("Launch denied");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Permissions", exact: true }).click();
  await page.getByLabel("Approval mode").selectOption("auto");
  await page
    .getByRole("button", { name: "Conversations", exact: true })
    .click();
  await ask(page, "Open Telegram");
  await expect(page.getByRole("log")).toContainText("Mock launch: Telegram");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("completed pet captions clear while the conversation remains", async ({
  page,
  context,
}) => {
  await page.clock.install();
  await page.goto("/");
  const main = await context.newPage();
  await chat(main);
  await ask(main, "Open Telegram");
  await main.getByRole("button", { name: "Allow once" }).click();
  await expect(page.locator(".pet-bubble")).toContainText(
    "Mock launch: Telegram",
  );
  await page.clock.fastForward(9000);
  await expect(page.locator(".pet-bubble")).toHaveCount(0);
  await expect(main.getByRole("log")).toContainText("Mock launch: Telegram");
});

test("spoken approval resolves the pending launch", async ({ page }) => {
  await fakeNative(page, true);
  await page.addInitScript(() => {
    const w = window as any;
    const original = w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.invoke = async (command: string, args: any) => {
      if (command === "transcribe_audio") return "approve";
      return original(command, args);
    };
  });
  await chat(page);
  await ask(page, "Open Calculator");
  await expect(page.getByRole("dialog")).toContainText("Open Calculator?");
  await page.getByRole("button", { name: "Decide by voice" }).click();
  await expect(
    page.getByRole("button", { name: "Finish voice decision" }),
  ).toBeVisible();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Finish voice decision" }).click();
  await expect(page.getByRole("log")).toContainText(
    "Launch requested for Calculator.",
  );
  const calls = await page.evaluate(() => (window as any).__calls);
  expect(
    calls.find((x: any) => x.command === "resolve_launch").args.allow,
  ).toBe(true);
});

test("automatic provider routing alternates and falls back after a failure", async ({
  page,
}) => {
  await fakeNative(page);
  await page.addInitScript(() => {
    const w = window as any;
    localStorage.setItem(
      "mivuneko.preferences.v1",
      JSON.stringify({ backend: "auto", voice: "off" }),
    );
    const previous = w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.invoke = async (command: string, args: any) => {
      if (command === "gemini_status") return { configured: true };
      if (command === "groq_status") return true;
      if (command === "gemini_chat_stream") {
        w.__calls.push({ command, args });
        return JSON.stringify({ text: "Gemini answer", emotion: "happy" });
      }
      if (command === "groq_chat") {
        w.__calls.push({ command, args });
        if (w.__failGroq) throw Error("Groq unavailable");
        return "Groq answer";
      }
      return previous(command, args);
    };
  });
  await chat(page);
  await ask(page, "First question");
  await expect(page.getByRole("log")).toContainText("Gemini answer");
  await ask(page, "Second question");
  await expect(page.getByRole("log")).toContainText("Groq answer");
  await ask(page, "Third question");
  await expect(page.getByRole("log").getByText("Gemini answer")).toHaveCount(2);
  await page.evaluate(() => {
    (window as any).__failGroq = true;
  });
  await ask(page, "Fourth question");
  await expect(page.getByRole("log").getByText("Gemini answer")).toHaveCount(3);
  const calls = await page.evaluate(() =>
    (window as any).__calls
      .filter((c: any) =>
        ["gemini_chat_stream", "groq_chat"].includes(c.command),
      )
      .map((c: any) => c.command),
  );
  expect(calls).toEqual([
    "gemini_chat_stream",
    "groq_chat",
    "gemini_chat_stream",
    "groq_chat",
    "gemini_chat_stream",
  ]);
});

for (const turnTaking of ["automatic", "manual"] as const) {
  test(`open mic keeps thinking pauses and submits once (${turnTaking})`, async ({
    page,
  }) => {
    await fakeNative(page, true);
    await page.addInitScript(() => {
      const w = window as any;
      let now = 0;
      Object.defineProperty(performance, "now", { value: () => now });
      w.__advanceAudio = (value: number, elapsed: number) => {
        now += elapsed;
        w.__processor?.onaudioprocess?.({
          inputBuffer: {
            getChannelData: () => new Float32Array(4096).fill(value),
          },
        });
      };
      const track = { stop: () => {} };
      Object.defineProperty(navigator, "mediaDevices", {
        value: { getUserMedia: async () => ({ getTracks: () => [track] }) },
      });
      w.AudioContext = class {
        sampleRate = 16000;
        destination = {};
        resume() {
          return Promise.resolve();
        }
        close() {
          return Promise.resolve();
        }
        createMediaStreamSource() {
          return { connect() {} };
        }
        createScriptProcessor() {
          return (w.__processor = {
            connect() {},
            disconnect() {},
            onaudioprocess: null,
          });
        }
        createGain() {
          return { gain: { value: 0 }, connect() {} };
        }
        decodeAudioData() {
          return Promise.reject(Error("test has no playback"));
        }
      };
      const previous = w.__TAURI_INTERNALS__.invoke;
      let count = 0;
      w.__TAURI_INTERNALS__.invoke = async (command: string, args: any) => {
        if (command === "transcribe_audio") {
          count++;
          return count === 1 ? "draft words" : "finished words";
        }
        return previous(command, args);
      };
    });
    await chat(page);
    await settings(page);
    await page.getByLabel("Voice mode").selectOption("open-mic");
    await page.getByLabel("Voice message submission").selectOption(turnTaking);
    await page
      .getByRole("button", { name: "Conversations", exact: true })
      .click();
    await page.getByRole("button", { name: "Start open mic" }).click();
    await expect
      .poll(() => page.evaluate(() => !!(window as any).__processor))
      .toBe(true);
    await page.evaluate(() => {
      for (let i = 0; i < 4; i++) (window as any).__advanceAudio(0, 256);
      for (let i = 0; i < 28; i++) (window as any).__advanceAudio(0.1, 256);
    });
    await expect(page.getByRole("log")).toContainText("draft words");
    await page.evaluate(() => {
      for (let i = 0; i < 9; i++) (window as any).__advanceAudio(0, 256);
    });
    await expect(
      page.getByRole("log").getByText("YOU", { exact: true }),
    ).toHaveCount(0);
    await page.evaluate(() => {
      // More than the former 20-second cap, still the same utterance.
      for (let i = 0; i < 80; i++) (window as any).__advanceAudio(0.1, 256);
    });
    await expect(
      page.getByRole("button", { name: "Done speaking" }),
    ).toBeEnabled();
    await page.evaluate(() => {
      for (let i = 0; i < 16; i++) (window as any).__advanceAudio(0, 256);
    });
    if (turnTaking === "manual") {
      await expect(
        page.getByRole("log").getByText("YOU", { exact: true }),
      ).toHaveCount(0);
      await page.getByRole("button", { name: "Done speaking" }).click();
    }
    await expect(page.getByRole("log")).toContainText("finished words");
    await expect(
      page.getByRole("log").getByText("YOU", { exact: true }),
    ).toHaveCount(1);
    await expect(page.getByRole("log").getByText("finished words")).toHaveCount(
      1,
    );
    await page.getByRole("button", { name: "Stop open mic" }).click();
    if (turnTaking === "manual") {
      await page.getByRole("button", { name: "Start open mic" }).click();
      await expect(
        page.getByRole("button", { name: "Done speaking" }),
      ).toBeDisabled();
      await page.evaluate(() => {
        for (let i = 0; i < 4; i++) (window as any).__advanceAudio(0, 256);
        for (let i = 0; i < 480; i++) (window as any).__advanceAudio(0.1, 256);
      });
      await expect(page.getByRole("alert")).toContainText(
        "Recording limit reached",
      );
      await expect(
        page.getByLabel("Message Mivuneko", { exact: true }),
      ).toHaveValue("finished words");
      await expect(
        page.getByRole("log").getByText("YOU", { exact: true }),
      ).toHaveCount(1);
    }
  });
}

test("character playback completes and recovers from a failed later phrase", async ({
  page,
}) => {
  await fakeNative(page);
  await page.addInitScript(() => {
    const w = window as any;
    w.__failPhrase = false;
    let count = 0;
    const previous = w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.invoke = async (command: string, args: unknown) => {
      if (command === "cancel_voice") {
        count = 0;
        return null;
      }
      if (command === "character_voice")
        return { engine: "kokoro", speed: 0.98, gain: 1 };
      if (command === "synthesize_phrase") {
        count++;
        if (count > 1) await new Promise((resolve) => setTimeout(resolve, 80));
        if (w.__failPhrase && count > 1)
          throw new Error("Character synthesis failed");
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
            setTimeout(() => this.onended?.(), 10);
          },
          stop() {
            this.onended?.();
          },
        };
      }
    };
  });
  await chat(page);
  await settings(page);
  const happy = page
    .locator(".mood-previews")
    .getByRole("button", { name: "Happy", exact: true });
  await happy.click();
  await expect(happy).toBeDisabled();
  await expect(happy).toBeEnabled();
  await page.evaluate(() => {
    (window as any).__failPhrase = true;
  });
  await happy.click();
  await expect(page.getByRole("alert")).toContainText(
    "Character synthesis failed",
  );
  await expect(happy).toBeEnabled();
});

test("saved Gemini speech selection survives startup and reload", async ({
  page,
}) => {
  await fakeNative(page);
  await page.addInitScript(() => {
    const preferences = JSON.parse(
      localStorage.getItem("mivuneko.preferences.v1") || "{}",
    );
    localStorage.setItem(
      "mivuneko.preferences.v1",
      JSON.stringify({ ...preferences, voiceProvider: "gemini" }),
    );
  });
  await chat(page);
  await settings(page);
  await expect(page.getByLabel("Speech engine")).toHaveValue("gemini");
  await page.reload();
  await settings(page);
  await expect(page.getByLabel("Speech engine")).toHaveValue("gemini");
});

test("long spoken explanations retain every paragraph after code", async ({
  page,
}) => {
  await fakeNative(page);
  await page.addInitScript(() => {
    const w = window as any,
      previous = w.__TAURI_INTERNALS__.invoke;
    w.__spoken = [];
    const text =
      Array.from(
        { length: 24 },
        (_, i) =>
          `A closure remembers variable number ${i} from its surrounding function.`,
      ).join(" ") +
      "\n```js\nconst secretCode = () => 42;\n```\nThe final paragraph explains that each invocation has its own environment.";
    localStorage.setItem(
      "mivuneko.preferences.v1",
      JSON.stringify({
        backend: "hermes",
        voice: "push-to-talk",
        voiceProvider: "system",
      }),
    );
    w.__TAURI_INTERNALS__.invoke = async (command: string, args: any) => {
      if (command === "hermes_chat")
        return JSON.stringify({
          text,
          emotion: "happy",
          speech: "Only a short summary.",
        });
      if (command === "synthesize_speech") {
        w.__spoken.push(args.text);
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
          onended: null as (() => void) | null,
          connect() {},
          start() {
            setTimeout(() => this.onended?.(), 10);
          },
          stop() {
            this.onended?.();
          },
        };
      }
    };
  });
  await chat(page);
  await ask(page, "Explain closures in detail.");
  await expect
    .poll(() => page.evaluate(() => (window as any).__spoken.join(" ")))
    .toContain(
      "The final paragraph explains that each invocation has its own environment.",
    );
  const said = await page.evaluate(() => (window as any).__spoken.join(" "));
  for (let i = 0; i < 24; i++)
    expect(said).toContain(
      `A closure remembers variable number ${i} from its surrounding function.`,
    );
  expect(said).not.toContain("secretCode");
  expect(said).not.toContain("Only a short summary.");
  expect(said).not.toContain("available in our conversation");
  await expect(page.locator(".md-code.code-revealed")).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as any).__calls.some(
        (c: any) => c.command === "plugin:window|show",
      ),
    ),
  ).toBe(true);
});

test("Markdown tables are readable in the widened conversation", async ({
  page,
}) => {
  await fakeNative(page);
  await page.addInitScript(() => {
    const w = window as any,
      previous = w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.invoke = async (command: string, args: any) =>
      command === "hermes_chat"
        ? JSON.stringify({
            text: '| Type | Stores | Example |\n|---|---|---|\n| **int** | Whole numbers | `count = 5` |\n| **str** | Text | `greeting = "Hello"` |',
            emotion: "happy",
          })
        : previous(command, args);
  });
  await chat(page);
  await ask(page, "Explain variable types.");
  await expect(page.getByRole("table")).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Type", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "count = 5", exact: true }),
  ).toBeVisible();
  const width = await page
    .locator(".chat")
    .evaluate((e) => e.getBoundingClientRect().width);
  expect(width).toBeGreaterThan(850);
});
