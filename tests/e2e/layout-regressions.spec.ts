import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any;
    let next = 1;
    w.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    w.__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: "main" },
        currentWebview: { label: "main" },
      },
      transformCallback: () => next++,
      unregisterCallback() {},
      invoke: async (c: string, a: any) => {
        if (c === "plugin:event|listen") return a.handler;
        if (c === "load_history") return "[]";
        if (c === "get_launch_policy")
          return { enabled: true, mode: "auto", stored: true };
        if (c === "ollama_models")
          return { models: [{ name: "qwen3.5:9b" }, { name: "gpt-oss:20b" }] };
        if (c === "local_runtime_status")
          return { installed: true, voiceReady: true };
        if (c === "voice_engines" || c === "list_apps") return [];
        if (c === "voice_capabilities") return { systemSpeech: false };
        if (c === "character_voice") return { engine: "kokoro" };
        if (c === "gemini_status") return { configured: false };
        return null;
      },
    };
    localStorage.setItem(
      "mivuneko.preferences.v1",
      JSON.stringify({
        backend: "ollama",
        voice: "open-mic",
        voiceProvider: "qwen",
        textScale: 1.1,
        renderer: "2d",
        character: "luna",
        rememberHistory: false,
        petMode: "stand",
      }),
    );
  });
  await page.setViewportSize({ width: 1280, height: 890 });
  await page.goto("/?view=chat");
});
async function settings(page: any, name: string) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name, exact: true }).click();
}
async function inside(child: any, parent: any) {
  const c = await child.boundingBox(),
    p = await parent.boundingBox();
  expect(c).not.toBeNull();
  expect(p).not.toBeNull();
  expect(c!.x).toBeGreaterThanOrEqual(p!.x - 1);
  expect(c!.x + c!.width).toBeLessThanOrEqual(p!.x + p!.width + 1);
}
test("settings actions and local-model buttons have padding, gaps and correct ownership", async ({
  page,
}) => {
  await settings(page, "Appearance");
  const content = page.locator(".settings-content"),
    footer = page.locator(".settings-footer");
  for (const button of await footer.getByRole("button").all()) {
    await inside(button, content);
    expect(
      await button.evaluate((el) =>
        parseFloat(getComputedStyle(el).paddingLeft),
      ),
    ).toBeGreaterThanOrEqual(12);
  }
  await page.screenshot({ path: "test-results/layout-appearance.png" });
  await settings(page, "Connections");
  const actions = page.locator(".local-model-actions");
  const boxes = await actions.getByRole("button").evaluateAll((es) =>
    es.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right };
    }),
  );
  for (let i = 1; i < boxes.length; i++)
    if (Math.abs(boxes[i].y - boxes[i - 1].y) < 2)
      expect(boxes[i].x - boxes[i - 1].right).toBeGreaterThanOrEqual(9);
  for (const button of await actions.getByRole("button").all())
    await inside(button, actions);
  await page.screenshot({ path: "test-results/layout-connections.png" });
});
test("activity toolbar keeps a usable search field and unwrapped actions", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  const toolbar = page.locator(".activity-toolbar");
  expect(
    (await page.getByLabel("Search activity").boundingBox())!.width,
  ).toBeGreaterThan(180);
  for (const button of await toolbar.getByRole("button").all())
    await inside(button, toolbar);
  await page.screenshot({ path: "test-results/layout-activity.png" });
});
test("character browser keeps the inspector visible and selects a compatible format", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Characters", exact: true }).click();
  await page.getByRole("tab", { name: "3D", exact: true }).click();
  await expect(page.locator(".character-inspector h2")).toHaveText("Haru");
  await inside(
    page.locator(".character-inspector"),
    page.locator(".character-studio"),
  );
  await expect(
    page.locator('.character-scene[data-model-ready="true"]'),
  ).toBeVisible({ timeout: 30000 });
  await expect
    .poll(() =>
      page.locator(".model-thumbnail").evaluate((el: any) => el.naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.screenshot({ path: "test-results/layout-characters-3d.png" });
  await page.getByRole("tab", { name: "2D", exact: true }).click();
  await page
    .locator("#character-models")
    .evaluate((el) => el.scrollIntoView({ block: "start" }));
  await expect(page.locator(".character-inspector h2")).toBeInViewport();
  const controls = page.locator(".character-inspector>.inspector-expressions");
  for (const button of await controls.getByRole("button").all())
    await inside(button, controls);
  await page.screenshot({
    path: "test-results/layout-characters-scrolled.png",
  });
});
test("voice controls show one send, icon-only microphone and aligned external plus", async ({
  page,
}) => {
  const row = page.locator(".composer-row"),
    plus = page.getByRole("button", { name: "Apps", exact: true }),
    form = row.locator("form");
  const a = await plus.boundingBox(),
    f = await form.boundingBox();
  expect(Math.abs(a!.y + a!.height - f!.y - f!.height)).toBeLessThan(1);
  expect(a!.x + a!.width).toBeLessThan(f!.x);
  await expect(
    page.getByRole("button", { name: "Send", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Done speaking", exact: true }),
  ).toHaveCount(0);
  expect(await page.locator(".mic-compact").innerText()).toBe("");
  await page.screenshot({ path: "test-results/layout-composer.png" });
  await settings(page, "Voice & input");
  await page.screenshot({ path: "test-results/layout-voice.png" });
});
