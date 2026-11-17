const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

// Opt-in real-model acceptance. Use an idle QA app with local WebView2 debugging enabled.
(async () => {
  assert.equal(
    process.platform,
    "win32",
    "This acceptance harness exercises the Windows desktop worker",
  );
  const endpoint = process.env.MIVUNEKO_CDP_URL || "http://127.0.0.1:9227";
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(new URL(endpoint).hostname),
    "Use a local QA app",
  );
  const browser = await chromium.connectOverCDP(endpoint);
  const page = browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => p.url().includes("view=chat"));
  assert.ok(page, "Launch the native QA app before running this test");
  const invoke = (command, args = {}) =>
    page.evaluate(
      ([command, args]) => window.__TAURI_INTERNALS__.invoke(command, args),
      [command, args],
    );
  const model =
    process.env.MIVUNEKO_QA_MODEL ||
    (await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("mivuneko.preferences.v1") || "{}")
          .ollamaModel || "qwen3.5:9b",
    ));
  const root = path
    .resolve(".local", `contextual-flow-${Date.now()}`)
    .replaceAll("\\", "/");
  fs.mkdirSync(root, { recursive: true });
  const records = [];
  let context = {},
    conversation = [];
  const samePath = (a, b) =>
    a.replaceAll("\\", "/").toLowerCase() ===
    b.replaceAll("\\", "/").toLowerCase();
  async function prepare(task, explicitWorkspace = "", fresh = false) {
    if (fresh) {
      context = {};
      conversation = [];
    }
    const prepared = await invoke("computer_prepare_task", {
      task,
      context,
      conversation: conversation.slice(-12),
      explicitWorkspace,
      model,
    });
    records.push({ task, prepared });
    context = prepared.context;
    conversation.push({ role: "user", content: task });
    if (prepared.kind === "question")
      conversation.push({ role: "assistant", content: prepared.question });
    console.log(
      JSON.stringify({
        task,
        kind: prepared.kind,
        workspace: context.workspace,
        question: prepared.question,
      }),
    );
    return prepared;
  }
  async function execute(prepared, expectedRoot) {
    assert.equal(prepared.kind, "workspace");
    assert.ok(
      samePath(prepared.context.workspace, expectedRoot),
      "The model selected the requested project",
    );
    const { sessionId } = await invoke("computer_start", {
      windowId: "",
      workspace: expectedRoot,
      task: prepared.task,
      model,
      background: true,
      reviewMode: "auto",
    });
    try {
      for (let step = 0; step < 10; step++) {
        const plan = await invoke("computer_next", { sessionId });
        console.log(
          JSON.stringify({
            step: step + 1,
            action: plan.action.kind,
            review: plan.review?.decision,
          }),
        );
        if (plan.review?.decision === "deny") continue;
        assert.notEqual(
          plan.review?.decision,
          "ask",
          "Routine fixture work unexpectedly requested permission",
        );
        assert.notEqual(
          plan.action.kind,
          "ask_user",
          "The fixture already supplies its requirements",
        );
        const result = await invoke("computer_act", {
          sessionId,
          revision: plan.revision,
          interactive: false,
        });
        if (plan.action.kind === "finish") {
          context = {
            ...context,
            status: "completed",
            facts: [...(context.facts || []), plan.action.reason],
          };
          conversation.push({ role: "assistant", content: plan.action.reason });
          return;
        }
        if (result.exitCode !== undefined)
          console.log(
            JSON.stringify({
              exitCode: result.exitCode,
              timedOut: result.timedOut,
            }),
          );
      }
      throw Error("The task did not finish within its acceptance budget");
    } finally {
      await invoke("computer_stop");
    }
  }
  try {
    let prepared = await prepare(
      `Set up preferences.json in "${root}" with theme dark and retries 2. Verify the saved values.`,
      root,
      true,
    );
    await execute(prepared, root);
    const original = fs.readFileSync(
      path.join(root, "preferences.json"),
      "utf8",
    );
    assert.deepEqual(JSON.parse(original), { theme: "dark", retries: 2 });
    prepared = await prepare(
      "Turn that into YAML as well, keeping exactly those values and keeping the original. Call it preferences.yaml.",
    );
    await execute(prepared, root);
    const yaml = fs.readFileSync(path.join(root, "preferences.yaml"), "utf8");
    assert.match(yaml, /theme:\s*['"]?dark\b/);
    assert.match(yaml, /retries:\s*2\b/);
    assert.equal(
      fs.readFileSync(path.join(root, "preferences.json"), "utf8"),
      original,
    );

    const other = root + "-inventory";
    fs.mkdirSync(other, { recursive: true });
    const csv = "item,quantity\napples,3\npears,5\n";
    fs.writeFileSync(path.join(other, "inventory.csv"), csv);
    prepared = await prepare(
      `Different job: in "${other}", total the quantities in inventory.csv and save summary.json with total. Leave the source unchanged.`,
      other,
    );
    assert.deepEqual(
      prepared.context.facts,
      [],
      "Unrelated work must not inherit prior task outcomes",
    );
    await execute(prepared, other);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(other, "summary.json"), "utf8"))
        .total,
      8,
    );
    assert.equal(
      fs.readFileSync(path.join(other, "inventory.csv"), "utf8"),
      csv,
    );

    const catalog = await invoke("computer_windows");
    const editors = catalog.windows.filter(
      (w) => w.process.toLowerCase() === "code.exe",
    );
    prepared = await prepare(
      "Have I already got Visual Studio Code open anywhere?",
      "",
      true,
    );
    assert.equal(prepared.kind, "inspect");
    assert.ok(
      editors.length
        ? editors.some((w) => prepared.result.includes(w.title))
        : prepared.result.startsWith("I don't see"),
      "Inspection must match actual Code window evidence",
    );

    prepared = await prepare(
      `Could you build one for me in "${root}"?`,
      root,
      true,
    );
    assert.equal(
      prepared.kind,
      "question",
      "A missing subject must not be inferred from desktop windows",
    );
    prepared = await prepare(
      "A JavaScript script called today.js that prints the current date.",
    );
    assert.equal(prepared.kind, "workspace");
    assert.ok(
      samePath(prepared.context.workspace, root),
      "Clarification must retain the already specified folder",
    );

    const edit = JSON.parse(
      await invoke("ollama_chat", {
        requestId: crypto.randomUUID(),
        model,
        mode: "Assist",
        messages: [
          {
            role: "user",
            content: `Observed task state: ${JSON.stringify(context)}`,
          },
          {
            role: "user",
            content:
              "Add a short comment to that script explaining what it does.",
          },
        ],
      }),
    );
    assert.ok(edit.computerTask, "A contextual edit must hand off to tools");
    const discussion = JSON.parse(
      await invoke("ollama_chat", {
        requestId: crypto.randomUUID(),
        model,
        mode: "Assist",
        messages: [
          {
            role: "user",
            content: `Observed task state: ${JSON.stringify(context)}`,
          },
          {
            role: "user",
            content:
              "Only explain what JavaScript closures are. Do not edit the file or create a folder.",
          },
        ],
      }),
    );
    assert.ok(
      !discussion.computerTask,
      "An explanation must not become an action",
    );
    prepared = await prepare(
      "New topic: take me to a page about Ada Lovelace and her life.",
    );
    assert.equal(prepared.kind, "browser");
    assert.match(prepared.browserRequest.query, /Ada/i);
    fs.writeFileSync(
      path.join(root, "acceptance-results.json"),
      JSON.stringify({ model, records }, null, 2),
    );
    console.log(`Contextual flows verified. Fixtures retained at ${root}`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
