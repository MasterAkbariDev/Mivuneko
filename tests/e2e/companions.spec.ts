import { test, expect } from "@playwright/test";

test("walk and run repaint every illustrated character even with a selected expression", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/?view=chat&tab=Characters");
  for (const id of [
    "luna",
    "miku",
    "kitsune",
    "stella",
    "teto",
    "neru",
    "snow",
    "silver",
    "azure",
    "goth",
    "mochi",
  ]) {
    for (const mode of ["walk", "run"]) {
      await page.evaluate(
        async ({ id, mode }) => {
          const path = "/src/preferences.ts";
          const { updatePreferences } = await import(path);
          updatePreferences({
            renderer: "2d",
            character: id,
            illustrationDepth: id === "mochi",
            activePackId: "",
            petMode: mode,
            petExpression: "crying",
          });
        },
        { id, mode },
      );
      const preview = page
        .getByLabel("Live character preview")
        .locator(".luna-model");
      await expect(preview).toHaveAttribute("data-model", id);
      await expect(preview.locator("canvas")).toHaveCount(1);
      await expect(preview.locator("canvas")).toHaveAttribute(
        "data-ready",
        "true",
        { timeout: 15000 },
      );
      const hashes = await preview
        .locator("canvas")
        .evaluate(async (canvas: HTMLCanvasElement) => {
          const hashes = new Set<number>();
          for (let frame = 0; frame < 16; frame++) {
            const pixels = canvas
              .getContext("2d")!
              .getImageData(0, 0, canvas.width, canvas.height).data;
            let hash = 2166136261;
            for (let i = 0; i < pixels.length; i += 64)
              hash = Math.imul(hash ^ pixels[i] ^ pixels[i + 3], 16777619);
            hashes.add(hash);
            await new Promise((r) => setTimeout(r, 90));
          }
          return hashes.size;
        });
      expect(
        hashes,
        `${id} ${mode} must repaint actual limb frames`,
      ).toBeGreaterThanOrEqual(3);
    }
  }
});

test("2D choices and expressions update the desktop pet", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?view=chat");

  await page.getByRole("button", { name: "Characters", exact: true }).click();
  const picker = page.getByRole("group", { name: "Choose a companion" });
  await expect(picker.getByRole("button")).toHaveCount(10);
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
    await picker.getByRole("button", { name: new RegExp(`^${name}`) }).click();
    await expect(
      pet.getByRole("img", { name: new RegExp(`${name}.*2D companion`) }),
    ).toBeVisible();
    await expect(pet.locator(".luna-model")).toHaveAttribute("data-model", id);
  }
  await page.getByLabel("Pet expression").selectOption("love");
  await expect(pet.locator(".luna-model")).toHaveAttribute("data-pose", "love");
  await expect(pet.locator(".effect-hearts")).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page
      .locator(".mood-previews")
      .getByRole("button", { name: "Happy", exact: true }),
  ).toBeDisabled();
  expect(errors).toEqual([]);
});

test("Luna previews unique expression and movement frames", async ({
  page,
}) => {
  await page.goto("/?view=chat");

  await page.getByRole("button", { name: "Characters", exact: true }).click();
  await page.getByRole("button", { name: "Luna", exact: true }).click();
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
    await page
      .getByRole("button", { name: "Conversations", exact: true })
      .click();
    await page
      .getByLabel("Message Mivuneko", { exact: true })
      .fill(mode === "sit" ? "sit down" : `${mode} to another place`);
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
    await page.getByRole("button", { name: "Characters", exact: true }).click();
    moves.add((await preview.getAttribute("data-frame"))!);
  }
  expect(moves.size).toBe(3);
});

test("every illustrated character loads distinct nonempty emotions and directional motion artwork", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto("/?view=chat&tab=Characters");
  const results = await page.evaluate(async () => {
    const modelsPath = "/src/lunaModel.ts",
      framesPath = "/src/spriteFrames.ts";
    const { characters } = await import(modelsPath),
      { spriteFrame } = await import(framesPath);
    const preparedPath = "/src/prepareSprites.ts";
    const { prepareAtlas } = await import(preparedPath);
    const loaded = new Map<string, HTMLImageElement>();
    async function fingerprint(f: any) {
      const prepared = await prepareAtlas(f.image, f.columns, f.rows);
      const image = prepared.frame(f.row * f.columns + f.column).canvas;
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(image, 0, 0, 64, 64);
      const pixels = ctx.getImageData(0, 0, 64, 64).data;
      let count = 0,
        hash = 2166136261;
      for (let i = 0; i < pixels.length; i++) {
        hash = Math.imul(hash ^ pixels[i], 16777619);
        if (i % 4 === 3 && pixels[i] > 50) count++;
      }
      let border = 0;
      for (let y = 0; y < 64; y++)
        for (let x = 0; x < 64; x++)
          if (
            (x < 2 || x > 61 || y < 2 || y > 61) &&
            pixels[(y * 64 + x) * 4 + 3] > 30
          )
            border++;
      return { hash: hash >>> 0, count, border };
    }
    const result = [];
    for (const id of Object.keys(characters)) {
      const emotions = [];
      for (const pose of Object.keys(characters[id].poses))
        emotions.push(await fingerprint(spriteFrame(id, pose, "stand", 0, 0)));
      const motion = [];
      for (const mode of ["walk", "run"])
        for (const direction of [0, 1, 2])
          for (const tick of [0, 1, 2])
            motion.push(
              await fingerprint(spriteFrame(id, "idle", mode, direction, tick)),
            );
      result.push({
        id,
        unique: new Set(emotions.map((f) => f.hash)).size,
        min: Math.min(...emotions.concat(motion).map((f) => f.count)),
        motionUnique: new Set(motion.map((f) => f.hash)).size,
        borders: Math.max(...emotions.concat(motion).map((f) => f.border)),
      });
    }
    return result;
  });
  for (const r of results) {
    expect(r.unique, r.id + " unique emotion images").toBe(21);
    expect(r.min, r.id + " nonempty frames").toBeGreaterThan(120);
    expect(r.motionUnique, r.id + " distinct motion drawings").toBe(18);
    expect(r.borders, r.id + " figure stays inside its canvas").toBe(0);
  }
});
