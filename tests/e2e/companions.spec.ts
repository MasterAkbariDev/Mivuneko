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
  await page.getByRole("button", { name: "Meet Mivuneko" }).click();
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
