import { test, expect } from "@playwright/test";

test("voice storage shows usage, sends the install location and confirms model removal", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.__calls = [];
    w.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    w.__TAURI_INTERNALS__ = {
      transformCallback: () => 1,
      unregisterCallback() {},
      invoke: async (command: string, args: any) => {
        w.__calls.push({ command, args });
        if (command === "local_runtime_status")
          return { installed: true, voiceReady: true };
        if (command === "ollama_models") return { models: [] };
        if (command === "local_voice_storage") {
          if (args.action === "inventory")
            return {
              runtimeBytes: 12700000000,
              speechBytes: 2200000000,
              modelBytes: 4500000000,
              reclaimableBytes: 885000000,
              runtimeRoot: "C:/Voice",
            };
          return { freedBytes: 885000000, warnings: [] };
        }
        if (command === "voice_engines") return [];
        if (command === "get_monitors" || command === "list_apps") return [];
        return null;
      },
    };
  });
  await page.goto("/?view=chat&tab=Settings");
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await page.getByText("Local voice storage", { exact: false }).click();
  await expect(
    page.getByText("Runtime 12.70 GB", { exact: false }),
  ).toBeVisible();
  await page
    .getByLabel("Local runtime install location")
    .fill("K:/Mivuneko/Voice");
  await page
    .getByRole("button", { name: "Update local runtime", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).__calls
            .filter((c: any) => c.command === "install_local_runtime")
            .at(-1)?.args.storageRoot,
      ),
    )
    .toBe("K:/Mivuneko/Voice");
  await page
    .getByRole("button", { name: "Clean verified downloads & old versions" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Freed 0.89 GB" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Remove expressive model", exact: false })
    .click();
  expect(
    await page.evaluate(() =>
      (window as any).__calls.some(
        (c: any) => c.args?.action === "remove-expressive",
      ),
    ),
  ).toBe(false);
  await page.getByRole("button", { name: "Keep model", exact: true }).click();
  await expect(
    page.getByRole("group", { name: "Confirm expressive voice removal" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Remove expressive model", exact: false })
    .click();
  await page.getByRole("button", { name: "Remove model", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).__calls.filter(
            (c: any) => c.args?.action === "remove-expressive",
          ).length,
      ),
    )
    .toBe(1);
});
