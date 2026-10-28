import { test, expect } from "@playwright/test";

test("2D choices and expressions update the desktop pet", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?view=chat");
  await page.getByRole("button", { name: "Meet Mivuneko" }).click();
  await page.getByRole("button", { name: "Characters", exact: true }).click();
  const picker = page.getByLabel("Character", { exact: true });
  await expect(picker.locator("option")).toHaveCount(10);
  const pet = await context.newPage();
  await pet.goto("/");
  for (const [id, name] of [
    ["miku", "Miku"],
    ["kitsune", "Kiko"],
    ["stella", "Stella"],
    ["luna", "Luna"],
    ["teto", "Teto"],
    ["neru", "Neru"],
    ["snow", "Yuki"],
    ["silver", "Sora"],
    ["azure", "Aoi"],
    ["goth", "Raven"],
  ]) {
    await picker.selectOption(id);
    await expect(
      pet.getByRole("img", { name: new RegExp(`${name}.*2D companion`) }),
    ).toBeVisible();
    await expect(pet.locator(".luna-model")).toHaveAttribute("data-model", id);
  }
  await page.getByLabel("Pet expression").selectOption("love");
  await expect(pet.locator(".luna-model")).toHaveAttribute("data-pose", "love");
  await expect(pet.locator(".effect-hearts")).toBeVisible();
  await page.getByLabel("Local voice style").selectOption("multilingual");
  await page.getByLabel("Speech language").selectOption("ja");
  await expect(page.getByLabel("Speech language")).toHaveValue("ja");
  await expect(
    page.getByRole("button", { name: "Preview voice" }),
  ).toBeDisabled();
  expect(errors).toEqual([]);
});

test("native voice preview sends the selected style and language", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.__calls = [];
    w.__TAURI_INTERNALS__ = {
      transformCallback: () => 1,
      unregisterCallback: () => {},
      invoke: async (command: string, args: unknown) => {
        w.__calls.push({ command, args });
        if (command !== "synthesize_speech") return null;
        const samples = 1600;
        const data = new Uint8Array(44 + samples * 2);
        const view = new DataView(data.buffer);
        for (const [offset, tag] of [
          [0, "RIFF"],
          [8, "WAVE"],
          [12, "fmt "],
          [36, "data"],
        ] as const)
          for (let i = 0; i < tag.length; i++)
            data[offset + i] = tag.charCodeAt(i);
        view.setUint32(4, data.length - 8, true);
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, 16000, true);
        view.setUint32(28, 32000, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        view.setUint32(40, samples * 2, true);
        for (let i = 0; i < samples; i++)
          view.setInt16(44 + i * 2, Math.sin(i / 8) * 10000, true);
        return Array.from(data);
      },
    };
  });
  await page.goto("/?view=chat");
  await page.getByRole("button", { name: "Meet Mivuneko" }).click();
  await page.getByRole("button", { name: "Characters", exact: true }).click();
  await page.getByLabel("Local voice style").selectOption("bright");
  await page.getByRole("button", { name: "Preview voice" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).__calls
            .filter((c: any) => c.command === "synthesize_speech")
            .at(-1)?.args?.style,
      ),
    )
    .toBe("bright");
  await expect(
    page.getByRole("button", { name: "Preview voice" }),
  ).toBeEnabled();
  await page.getByLabel("Local voice style").selectOption("multilingual");
  await page.getByLabel("Speech language").selectOption("ja");
  await page.getByRole("button", { name: "Preview voice" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).__calls
            .filter((c: any) => c.command === "synthesize_speech")
            .at(-1)?.args?.language,
      ),
    )
    .toBe("ja");
});

test("Luna previews unique expression and movement frames", async ({
  page,
}) => {
  await page.goto("/?view=chat");
  await page.getByRole("button", { name: "Meet Mivuneko" }).click();
  await page.getByRole("button", { name: "Characters", exact: true }).click();
  await page.getByLabel("Character", { exact: true }).selectOption("luna");
  const preview = page
    .getByLabel("Live character preview")
    .locator(".luna-model");
  const frames = new Set<string>();
  for (const option of await page
    .getByLabel("Pet expression")
    .locator("option")
    .evaluateAll((items) =>
      items
        .map((x) => (x as HTMLOptionElement).value)
        .filter((x) => x !== "auto"),
    )) {
    await page.getByLabel("Pet expression").selectOption(option);
    await expect(preview).toHaveAttribute("data-pose", option);
    frames.add((await preview.getAttribute("data-frame"))!);
  }
  expect(frames.size).toBe(21);
  await page.getByLabel("Pet expression").selectOption("auto");
  const moves = new Set<string>();
  for (const mode of ["walk", "run", "sit"]) {
    await page.getByLabel("Pet mode").selectOption(mode);
    moves.add((await preview.getAttribute("data-frame"))!);
  }
  expect(moves.size).toBe(3);
});
