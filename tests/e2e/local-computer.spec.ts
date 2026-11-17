import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }, testInfo) => {
  await page.addInitScript(
    ({ actionReplies }: { actionReplies: boolean }) => {
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
            return {
              models: [{ name: "qwen3.5:9b" }, { name: "gpt-oss:20b" }],
            };
          if (command === "ollama_chat")
            return JSON.stringify({
              text: "This reply was generated locally.",
              emotion: "happy",
              appQuery: "",
              computerTask: actionReplies
                ? "Perform the current user request"
                : "",
              companionActions: [],
            });
          if (command === "computer_windows")
            return {
              windows: w.__checkWindows ?? [
                {
                  id: "qa-window",
                  title: "Local test app",
                  process: w.__browserWindow ? "msedge.exe" : "computerqa.exe",
                },
              ],
            };
          // Fixtures model semantic preparation; native scenarios separately exercise the real model.
          if (command === "computer_prepare_task") {
            if (w.__prepared)
              return typeof w.__prepared === "function"
                ? w.__prepared(args)
                : w.__prepared;
            const context = {
              ...args.context,
              goal: args.task,
              status: "working",
              question: "",
            };
            const base = { task: args.task, context, windows: [] };
            if (/check if/i.test(args.task)) {
              const windows = w.__checkWindows || [];
              return {
                ...base,
                kind: "inspect",
                result: windows.length
                  ? "Yes, vscode is open. " +
                    windows.map((v: any) => v.title).join("; ")
                  : "I don't see an open vscode window. It could be running without a visible window.",
              };
            }
            if (/wikipedia|search elon|description in browser/i.test(args.task))
              return {
                ...base,
                kind: "browser",
                browserRequest: /wikipedia/i.test(args.task)
                  ? {
                      browser: "edge",
                      useDefault: true,
                      query: "Wikipedia",
                      url: "https://www.wikipedia.org/",
                    }
                  : {
                      browser: "edge",
                      query: "elon musk",
                      ...(/description/.test(args.task)
                        ? { intent: "page" }
                        : {}),
                    },
              };
            const workspace =
              args.explicitWorkspace ||
              w.__editorWorkspaces?.[0]?.path ||
              args.context?.workspace;
            if (workspace)
              return {
                ...base,
                kind: "workspace",
                task: args.explicitWorkspace
                  ? args.task
                  : `${args.context.goal}\nUser clarification: ${args.task}`,
                context: {
                  ...context,
                  goal: args.explicitWorkspace
                    ? args.task
                    : `${args.context.goal}\n${args.task}`,
                  workspace,
                  windowId: "",
                },
              };
            return {
              ...base,
              kind: "window",
              context: { ...context, windowId: "qa-window", workspace: "" },
            };
          }
          if (command === "computer_editor_workspaces")
            return { workspaces: w.__editorWorkspaces ?? [] };
          if (command === "computer_select_target")
            return { windowId: "qa-window", needsWorkspace: false };
          if (command === "computer_resolve_page")
            return {
              url: "https://en.wikipedia.org/wiki/Elon_Musk",
              title: "Elon Musk",
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
    },
    { actionReplies: !testInfo.title.startsWith("Ollama conversation") },
  );
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
  await expect(
    page.getByRole("region", { name: "Permission request" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as any).__calls.filter((v: any) => v.command === "computer_act")
          .length,
    ),
  ).toBe(0);
  await page.getByRole("button", { name: "Allow", exact: true }).click();
  await expect(page.locator(".thinking-trace > summary").last()).toContainText(
    "Completed",
  );
  const call = await page.evaluate(() =>
    (window as any).__calls.find((v: any) => v.command === "computer_act"),
  );
  expect(call.args).toEqual({
    sessionId: "session-1",
    revision: 0,
    interactive: false,
    approved: true,
  });
  await expect(page.getByRole("button", { name: "Stop session" })).toHaveCount(
    0,
  );
  await page.locator(".thinking-trace > summary").last().click();
  await expect(page.locator(".thinking-scroll")).toContainText(
    "Selecting a control",
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
  await expect(
    page.getByRole("button", { name: "Stop", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.evaluate(() => (window as any).__releasePlan());
  await expect(
    page.getByRole("button", { name: "Allow", exact: true }),
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
  await page.getByRole("button", { name: "Allow", exact: true }).click();
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
      ["computer_start", "computer_next", "computer_act"].includes(v.command),
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
  await expect(page.locator(".thinking-trace > summary").last()).toContainText(
    "Completed",
  );
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

test("opening a description resolves and opens a relevant page rather than a search URL", async ({
  page,
}) => {
  await page.goto("/?view=chat");
  await page
    .getByLabel("Message Mivuneko", { exact: true })
    .fill("open elon musk description in browser");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("button", { name: "Allow", exact: true }).click();
  await expect(
    page.getByText("I've opened Elon Musk in your browser.", { exact: true }),
  ).toBeVisible();
  const calls = await page.evaluate(() => (window as any).__calls);
  expect(
    calls.find((v: any) => v.command === "computer_resolve_page").args.task,
  ).toBe("open elon musk description in browser");
  expect(
    calls.find((v: any) => v.command === "computer_open_browser").args.url,
  ).toBe("https://en.wikipedia.org/wiki/Elon_Musk");
});
test("model-understood editor requests hand off the original goal and select the editor", async ({
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
    const api = (window as any).__TAURI_INTERNALS__,
      invoke = api.invoke;
    api.invoke = async (cmd: string, args: any) => {
      if (cmd === "ollama_chat")
        return JSON.stringify({
          text: "I'll implement that in your editor.",
          emotion: "happy",
          computerTask: "Implement requested function in the editor",
        });
      if (cmd === "computer_select_target")
        return { windowId: "qa-window", needsWorkspace: false };
      return invoke(cmd, args);
    };
  });
  await page
    .getByLabel("Message Mivuneko", { exact: true })
    .fill("Could you implement a small greeting function in my editor?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator(".thinking-trace > summary").last()).toContainText(
    "Completed",
  );
  const calls = await page.evaluate(() => (window as any).__calls);
  expect(calls.find((v: any) => v.command === "computer_start").args.task).toBe(
    "Could you implement a small greeting function in my editor?",
  );
  expect(
    calls.find((v: any) => v.command === "computer_start").args.windowId,
  ).toBe("qa-window");
});

test("explicit file requests need no app and follow-ups retain the original goal", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as any;
    const old = w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.invoke = async (c: string, a: any) => {
      if (c === "computer_start") w.__step = 0;
      return old(c, a);
    };
    const key = "mivuneko.preferences.v1";
    localStorage.setItem(
      key,
      JSON.stringify({
        ...JSON.parse(localStorage.getItem(key)!),
        computerApproval: "automatic",
        actionReview: "auto",
      }),
    );
  });
  await page.goto("/?view=chat");
  async function send(text: string) {
    const before = await page.evaluate(
      () =>
        (window as any).__calls.filter(
          (x: any) => x.command === "computer_start",
        ).length,
    );
    await page.getByLabel("Message Mivuneko", { exact: true }).fill(text);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as any).__calls.filter(
              (x: any) => x.command === "computer_start",
            ).length,
        ),
      )
      .toBe(before + 1);
    await expect(page.locator(".thinking-trace>summary").last()).toContainText(
      "Completed",
    );
  }
  await send(
    'hey luna can you create a closure function example on this directory: "J:/Projects/jsPractice/closure/"',
  );
  await send("use notepad for that matter");
  let starts = await page.evaluate(() =>
    (window as any).__calls
      .filter((x: any) => x.command === "computer_start")
      .map((x: any) => x.args),
  );
  expect(starts[0].windowId).toBe("");
  expect(starts[0].workspace).toBe("J:/Projects/jsPractice/closure");
  expect(starts[1].task).toContain("closure function");
  expect(starts[1].task).toContain("notepad");
  await send('Create a grocery list file in "J:/Projects/shopping/"');
  starts = await page.evaluate(() =>
    (window as any).__calls
      .filter((x: any) => x.command === "computer_start")
      .map((x: any) => x.args),
  );
  expect(starts.at(-1).task).not.toContain("closure");
  expect(starts.at(-1).workspace).toBe("J:/Projects/shopping");
  const calls = await page.evaluate(() => (window as any).__calls);
  expect(calls.some((x: any) => x.command === "computer_select_target")).toBe(
    false,
  );
});

test("numbered questions support keyboard selection and preserve task context", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as any,
      old = w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.invoke = async (c: string, a: any) => {
      if (c === "computer_next" && !w.__asked) {
        w.__asked = true;
        return {
          revision: 0,
          step: 1,
          action: {
            kind: "ask_user",
            reason: "Which example would you like?",
            options: ["Counter", "Private state", "Both"],
          },
          observation: { image: "", title: "Workspace", elements: [] },
        };
      }
      return old(c, a);
    };
    const key = "mivuneko.preferences.v1";
    localStorage.setItem(
      key,
      JSON.stringify({
        ...JSON.parse(localStorage.getItem(key)!),
        computerApproval: "automatic",
      }),
    );
  });
  await page.goto("/?view=chat");
  await page
    .getByLabel("Message Mivuneko", { exact: true })
    .fill('Create a closure example in "J:/Projects/practice/"');
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const question = page.getByRole("region", { name: "Companion question" });
  await expect(question.getByRole("radio")).toHaveCount(3);
  await question.getByRole("radio").first().focus();
  await page.keyboard.press("3");
  await expect(question.getByRole("radio").nth(2)).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.keyboard.press("Enter");
  await expect(question).toHaveCount(0);
  await expect(page.locator(".thinking-trace>summary").last()).toContainText(
    "Completed",
  );
  const starts = await page.evaluate(() =>
    (window as any).__calls.filter((x: any) => x.command === "computer_start"),
  );
  expect(starts.at(-1).args.task).toContain("Both");
  expect(starts.at(-1).args.task).toContain("closure example");
});

test("custom dropdown opens styled options and mic control stays square", async ({
  page,
}) => {
  await page.goto("/?view=chat");
  await expect(page.getByLabel("Companion mode")).not.toBeVisible();
  await page.getByLabel("Conversation options", { exact: true }).click();
  const control = page
    .locator(".custom-select")
    .filter({ has: page.getByLabel("Companion mode") });
  await control.getByRole("button").click();
  const menu = page.getByRole("listbox", { name: "Companion mode" });
  await expect(menu).toBeVisible();
  await menu.getByRole("option", { name: "Creative", exact: true }).click();
  await expect(page.getByLabel("Companion mode")).toHaveValue("Creative");
  await page.getByLabel("Conversation options", { exact: true }).click();
  const box = await page
    .getByRole("button", { name: "Record", exact: true })
    .boundingBox();
  expect(Math.abs(box!.width - box!.height)).toBeLessThan(1);
  await page.setViewportSize({ width: 430, height: 820 });
  await expect(
    page.getByLabel("Message Mivuneko", { exact: true }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("task activity names the running action, survives tab changes and retains completed records", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as any,
      old = w.__TAURI_INTERNALS__.invoke;
    w.__holdAction = true;
    w.__TAURI_INTERNALS__.invoke = async (c: string, a: any) => {
      if (c === "computer_start") w.__step = 0;
      if (c === "computer_next" && !w.__step)
        return {
          revision: 0,
          step: 1,
          action: {
            kind: "write_file",
            path: "closure.js",
            text: "const counter = () => 1;",
            reason: "Save the requested example",
          },
          observation: { image: "", title: "Workspace", elements: [] },
          review: { decision: "allow", summary: "Requested file creation" },
        };
      if (c === "computer_act" && !w.__step && w.__holdAction)
        await new Promise<void>((resolve) => {
          w.__releaseAction = resolve;
        });
      return old(c, a);
    };
    const key = "mivuneko.preferences.v1";
    localStorage.setItem(
      key,
      JSON.stringify({
        ...JSON.parse(localStorage.getItem(key)!),
        computerApproval: "automatic",
      }),
    );
  });
  await page.goto("/?view=chat");
  await page
    .getByLabel("Message Mivuneko", { exact: true })
    .fill('Create a closure example in "J:/Projects/practice/"');
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator(".thinking-trace>summary").last()).toContainText(
    "Saving closure.js",
  );
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        (window as any).__calls.filter(
          (x: any) => x.command === "computer_stop",
        ).length,
    ),
  ).toBe(0);
  await page.evaluate(() => {
    (window as any).__holdAction = false;
    (window as any).__releaseAction();
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).__calls.filter(
            (x: any) => x.command === "computer_stop",
          ).length,
      ),
    )
    .toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "Conversations", exact: true })
    .click();
  await expect(page.locator(".thinking-trace>summary").last()).toContainText(
    "Completed",
  );
  await page
    .getByLabel("Message Mivuneko", { exact: true })
    .fill('Create a shopping file in "J:/Projects/shopping/"');
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator(".thinking-trace")).toHaveCount(2);
  await expect(page.locator(".thinking-trace>summary").last()).toContainText(
    "Completed",
  );
  await page.locator(".thinking-trace>summary").first().click();
  await expect(page.locator(".thinking-trace").first()).toContainText(
    "Saving closure.js",
  );
  await page.screenshot({ path: ".local/design/task-activity.png" });
  expect(
    await page
      .locator(".thinking-trace")
      .first()
      .evaluate(
        (el) =>
          !!el
            .closest(".conversation-turn")
            ?.nextElementSibling?.textContent?.includes("requested result"),
      ),
  ).toBe(true);
});

test("the add button is separate from the composer and controls stay within their row", async ({
  page,
}) => {
  await page.goto("/?view=chat");
  const plus = page.getByRole("button", { name: "Apps", exact: true });
  expect(await plus.evaluate((el) => el.closest("form") === null)).toBe(true);
  for (const width of [1440, 900, 430]) {
    await page.setViewportSize({ width, height: 900 });
    const a = await plus.boundingBox(),
      form = await page.locator(".composer-row form").boundingBox();
    expect(a!.x + a!.width).toBeLessThan(form!.x);
    await expect(
      page.getByLabel("Message Mivuneko", { exact: true }),
    ).toBeInViewport();
    for (const name of ["Record", "Send"]) {
      const r = await page
        .getByRole("button", { name, exact: true })
        .boundingBox();
      expect(r!.x + r!.width).toBeLessThanOrEqual(form!.x + form!.width);
      expect(r!.y + r!.height).toBeLessThanOrEqual(form!.y + form!.height);
      expect(Math.abs(r!.height - r!.width)).toBeLessThan(1);
    }
  }
});

test("folder launch uses a reviewed terminal command and retains command output", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as any,
      old = w.__TAURI_INTERNALS__.invoke;
    localStorage.setItem(
      "mivuneko.preferences.v1",
      JSON.stringify({
        backend: "ollama",
        computerApproval: "automatic",
        actionReview: "auto",
        voice: "off",
      }),
    );
    w.__TAURI_INTERNALS__.invoke = async (c: string, a: any) => {
      if (c === "computer_next")
        return {
          revision: w.__step,
          action: w.__step
            ? { kind: "finish", reason: "VS Code folder launch requested." }
            : {
                kind: "run_command",
                command:
                  "Get-Location; Start-Process $env:MIVUNEKO_VSCODE -ArgumentList @('--new-window','.')",
                cwd: ".",
                reason: "Open your project folder",
              },
          review: {
            decision: "allow",
            summary: "Requested project folder launch is allowed",
          },
          observation: { image: "", elements: [] },
        };
      if (c === "computer_act") {
        await old(c, a);
        return {
          exitCode: 0,
          cwd: "J:/Projects/JSPractice",
          stdout: "VS Code folder launch requested",
          stderr: "",
        };
      }
      return old(c, a);
    };
  });
  await page.goto("/?view=chat");
  await page
    .getByLabel("Message Mivuneko", { exact: true })
    .fill('open vscode for me on a new directory of "J:/Projects/JSPractice"');
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page
      .locator(".message.assistant")
      .filter({ hasText: "VS Code folder launch requested." }),
  ).toBeVisible();
  const start = await page.evaluate(() =>
    (window as any).__calls.find((x: any) => x.command === "computer_start"),
  );
  expect(start.args.workspace).toBe("J:/Projects/JSPractice");
  expect(start.args.windowId).toBe("");
  await page.getByLabel("Task activity").locator("summary").first().click();
  await page
    .locator(".thinking-scroll li summary")
    .filter({ hasText: "Running command" })
    .click();
  await expect(page.locator(".thinking-scroll pre")).toContainText("Exit: 0");
  await expect(page.locator(".thinking-scroll pre")).toContainText(
    "MIVUNEKO_VSCODE",
  );
  await expect(
    page.getByText("The file must exist before opening it", { exact: true }),
  ).toHaveCount(0);
});

test("a denied terminal proposal is never sent to the execution tool", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as any,
      old = w.__TAURI_INTERNALS__.invoke;
    w.__plans = 0;
    localStorage.setItem(
      "mivuneko.preferences.v1",
      JSON.stringify({
        backend: "ollama",
        computerApproval: "automatic",
        actionReview: "auto",
        voice: "off",
      }),
    );
    w.__TAURI_INTERNALS__.invoke = async (c: string, a: any) => {
      if (c === "computer_next") {
        w.__plans++;
        return {
          revision: w.__plans,
          action:
            w.__plans === 1
              ? {
                  kind: "run_command",
                  command: "Write-Output blocked",
                  reason: "Unrelated command",
                }
              : {
                  kind: "ask_user",
                  reason: "Which project check should I run?",
                },
          review: {
            decision: w.__plans === 1 ? "deny" : "allow",
            summary: "Outside this request",
          },
          observation: { image: "", elements: [] },
        };
      }
      return old(c, a);
    };
  });
  await page.goto("/?view=chat");
  await page
    .getByLabel("Message Mivuneko", { exact: true })
    .fill('run git status in "J:/Projects/JSPractice"');
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Which project check should I run?",
      exact: true,
    }),
  ).toBeVisible();
  const calls = await page.evaluate(() =>
    (window as any).__calls.filter((x: any) => x.command === "computer_act"),
  );
  expect(calls).toHaveLength(1);
  expect(calls[0].args.revision).toBe(2);
});

test("failed terminal output is retained while the task corrects the command", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as any,
      old = w.__TAURI_INTERNALS__.invoke;
    localStorage.setItem(
      "mivuneko.preferences.v1",
      JSON.stringify({
        backend: "ollama",
        computerApproval: "automatic",
        actionReview: "auto",
        voice: "off",
      }),
    );
    w.__TAURI_INTERNALS__.invoke = async (c: string, a: any) => {
      if (c === "computer_next")
        return {
          revision: w.__step,
          action:
            w.__step < 2
              ? {
                  kind: "run_command",
                  ...(w.__step
                    ? {
                        executable: "node",
                        args: ["-e", "console.log('corrected')"],
                      }
                    : { command: "missing-command" }),
                  reason: "Check the project",
                }
              : { kind: "finish", reason: "The corrected command passed." },
          review: { decision: "allow", summary: "Scoped project command" },
          observation: { image: "", elements: [] },
        };
      if (c === "computer_act") {
        const n = w.__step;
        await old(c, a);
        return {
          exitCode: n === 0 ? 1 : 0,
          stdout: n === 0 ? "" : "corrected",
          stderr: n === 0 ? "Command was not found" : "",
        };
      }
      return old(c, a);
    };
  });
  await page.goto("/?view=chat");
  await page
    .getByLabel("Message Mivuneko", { exact: true })
    .fill('run npm test in "J:/Projects/JSPractice"');
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page
      .locator(".message.assistant")
      .filter({ hasText: "The corrected command passed." }),
  ).toBeVisible();
  await page.getByLabel("Task activity").locator("summary").first().click();
  await expect(
    page.getByText("Command failed (exit 1)", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".trace-check").first()).toHaveText("!");
  await page
    .locator(".thinking-scroll li summary")
    .filter({ hasText: "Running command" })
    .click();
  await expect(page.locator(".thinking-scroll pre").last()).toContainText(
    "node",
  );
  await expect(page.locator(".thinking-scroll pre").last()).toContainText(
    "Exit: 0",
  );
});

test("checking an open editor reports observed windows without speculative chat or launching", async ({
  page,
}) => {
  await page.goto("/?view=chat");
  await page.evaluate(() => {
    (window as any).__checkWindows = [
      {
        id: "editor",
        title: "practice - Visual Studio Code",
        process: "code.exe",
      },
    ];
  });
  await page
    .getByLabel("Message Mivuneko", { exact: true })
    .fill("hey haru can you check if my vscode is open?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page
      .locator(".message.assistant")
      .filter({ hasText: "Yes, vscode is open" })
      .last(),
  ).toBeVisible();
  const calls = await page.evaluate(() => (window as any).__calls);
  expect(calls.some((c: any) => c.command === "computer_prepare_task")).toBe(
    true,
  );
  expect(
    calls.some((c: any) =>
      ["computer_start", "computer_select_target", "computer_act"].includes(
        c.command,
      ),
    ),
  ).toBe(false);
});
test("missing editor window is reported without claiming its process is closed", async ({
  page,
}) => {
  await page.goto("/?view=chat");
  await page.evaluate(() => {
    (window as any).__checkWindows = [];
  });
  await page
    .getByLabel("Message Mivuneko", { exact: true })
    .fill("can you check if vscode is open?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page
      .locator(".message.assistant")
      .filter({ hasText: "I don't see an open vscode window" })
      .last(),
  ).toBeVisible();
});

test("an app check followed by coding in its project resolves the actual editor folder", async ({
  page,
}) => {
  await page.goto("/?view=chat");
  await page.evaluate(() => {
    const w = window as any;
    w.__checkWindows = [
      {
        id: "editor",
        title: "Welcome - JSPractice - Visual Studio Code",
        process: "code.exe",
      },
    ];
    w.__editorWorkspaces = [
      {
        path: "J:/Projects/JSPractice",
        title: "Welcome - JSPractice - Visual Studio Code",
      },
    ];
  });
  const input = page.getByLabel("Message Mivuneko", { exact: true });
  await input.fill("hey haru can you check if my vscode is open?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page
      .locator(".message.assistant")
      .filter({ hasText: "Yes, vscode is open" })
      .last(),
  ).toBeVisible();
  await input.fill(
    'I want you to create a folder inside the project named "closure" and create a closure.js file and add examples via comments to it',
  );
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          (window as any).__calls.filter(
            (c: any) => c.command === "computer_start",
          ).length,
      ),
    )
    .toBe(1);
  const call = await page.evaluate(() =>
    (window as any).__calls.find((c: any) => c.command === "computer_start"),
  );
  expect(call.args.workspace).toBe("J:/Projects/JSPractice");
  expect(call.args.task).toContain("closure.js");
  const preparation = await page.evaluate(() =>
    (window as any).__calls
      .filter((c: any) => c.command === "computer_prepare_task")
      .at(-1),
  );
  expect(preparation.args.context.facts.join(" ")).toContain("vscode is open");
  await expect(
    page.getByText("Where should I save the files?", { exact: true }),
  ).toHaveCount(0);
});

test("unfamiliar wording and a non-keyword follow-up use model context instead of phrase matching", async ({
  page,
}) => {
  await page.goto("/?view=chat");
  await page.evaluate(() => {
    const w = window as any,
      original = w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.invoke = async (c: string, a: any) => {
      if (c === "ollama_chat") {
        w.__calls.push({ command: c, args: a });
        return JSON.stringify({
          text: "",
          emotion: "happy",
          computerTask: "Update the requested document",
        });
      }
      if (c === "computer_start") w.__step = 0;
      return original(c, a);
    };
    w.__prepared = (a: any) => ({
      kind: "workspace",
      task: a.task,
      context: {
        ...a.context,
        goal: "Maintain the project note",
        request: a.context.request || a.task,
        workspace: "J:/Projects/notes",
        windowId: "",
        question: "",
        status: "working",
      },
    });
    const key = "mivuneko.preferences.v1";
    localStorage.setItem(
      key,
      JSON.stringify({
        ...JSON.parse(localStorage.getItem(key)!),
        computerApproval: "automatic",
      }),
    );
    window.dispatchEvent(new StorageEvent("storage", { key }));
  });
  const input = page.getByLabel("Message Mivuneko", { exact: true });
  let expectedPreparations = 0;
  for (const text of [
    "Put a short welcome note in the notes project.",
    "Make that shorter, keep the meaning.",
  ]) {
    await input.fill(text);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    expectedPreparations++;
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as any).__calls.filter(
              (c: any) => c.command === "computer_prepare_task",
            ).length,
        ),
      )
      .toBe(expectedPreparations);
    await expect(page.locator(".thinking-trace>summary").last()).toContainText(
      "Completed",
    );
  }
  const calls = await page.evaluate(() => (window as any).__calls);
  const preparations = calls.filter(
    (c: any) => c.command === "computer_prepare_task",
  );
  expect(preparations).toHaveLength(2);
  expect(preparations[1].args.context.workspace).toBe("J:/Projects/notes");
  expect(preparations[1].args.context.request).toContain("welcome note");
  expect(preparations[1].args.context.facts.length).toBeGreaterThan(0);
  const chat = calls.filter((c: any) => c.command === "ollama_chat").at(-1);
  expect(
    chat.args.messages.some(
      (m: any) =>
        m.content.includes("Application task memory") &&
        m.content.includes("J:/Projects/notes"),
    ),
  ).toBe(true);
});

test("explanation-only wording with action keywords does not start computer work", async ({
  page,
}) => {
  await page.goto("/?view=chat");
  await page.evaluate(() => {
    const w = window as any,
      old = w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.invoke = async (c: string, a: any) => {
      if (c === "ollama_chat") {
        w.__calls.push({ command: c, args: a });
        return JSON.stringify({
          text: "A closure retains its lexical scope.",
          emotion: "idle",
          computerTask: "",
          appQuery: "",
          companionActions: [],
        });
      }
      return old(c, a);
    };
  });
  await page
    .getByLabel("Message Mivuneko", { exact: true })
    .fill("Explain closures. Do not edit the file or create a folder.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByText("A closure retains its lexical scope.", { exact: true }),
  ).toBeVisible();
  const calls = await page.evaluate(() => (window as any).__calls);
  expect(
    calls.some((c: any) =>
      ["computer_prepare_task", "computer_start", "computer_act"].includes(
        c.command,
      ),
    ),
  ).toBe(false);
});
