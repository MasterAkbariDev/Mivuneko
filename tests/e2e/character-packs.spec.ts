import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
function folder(root: string, name: string, broken = false) {
  const path = join(root, name);
  mkdirSync(join(path, "art"), { recursive: true });
  const p = JSON.parse(
    readFileSync("docs/character-packs/examples/2d/character.json", "utf8"),
  );
  p.name = "Library companion";
  p.license = "Original project example artwork";
  writeFileSync(join(path, "character.json"), JSON.stringify(p));
  if (!broken)
    writeFileSync(
      join(path, "art", "expressions.png"),
      readFileSync("apps/desktop/public/characters/luna-atlas.png"),
    );
  return path;
}
async function studio(page: any) {
  await page.goto("/?view=chat&tab=Characters");
}
test("folder imports create independent persistent slots and reject a broken pack atomically", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  const root = info.outputPath("packs");
  mkdirSync(root, { recursive: true });
  const good = folder(root, "good"),
    bad = folder(root, "bad", true);
  await studio(page);
  const input = page.getByLabel("Import character folder", { exact: true });
  await input.setInputFiles(good);
  const cards = page.locator(".imported-pack-card");
  await expect(cards).toHaveCount(1);
  await expect(
    page.getByRole("img", { name: /Library companion 2d companion/ }),
  ).toBeVisible();
  await input.setInputFiles(good);
  await expect(cards).toHaveCount(2);
  await page.reload();
  await expect(cards).toHaveCount(2);
  await input.setInputFiles(bad);
  await expect(page.getByRole("alert")).toContainText(
    "Missing character asset",
  );
  await expect(cards).toHaveCount(2);
  await page
    .getByRole("button", { name: /Remove pack Library companion/ })
    .first()
    .click();
  await expect(cards).toHaveCount(1);
  await expect(
    page.getByRole("img", { name: /Library companion 2d companion/ }),
  ).toBeVisible();
  await page.getByLabel("Imported character pose").selectOption("happy");
  await expect(
    page.getByRole("img", { name: /Library companion 2d companion, happy/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Creating characters & voices/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Character guide", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Voice identity: explicit or silent" }),
  ).toBeVisible();
});
test("standalone VRM imports keep two independent character slots", async ({
  page,
}) => {
  test.setTimeout(60000);
  await studio(page);
  await page.getByRole("tab", { name: "3D Animated VRM", exact: true }).click();
  const bytes = readFileSync("apps/desktop/public/models/haru.vrm");
  await page.getByLabel("Import VRM file").setInputFiles([
    { name: "first.vrm", mimeType: "application/octet-stream", buffer: bytes },
    { name: "second.vrm", mimeType: "application/octet-stream", buffer: bytes },
  ]);
  await expect(page.locator(".imported-character")).toHaveCount(2);
  await expect(
    page.locator(".character-scene[data-model-ready=true]"),
  ).toBeVisible({ timeout: 30000 });
  await page.reload();
  await expect(page.locator(".imported-character")).toHaveCount(2);
  const buttons = page.locator(".imported-character>button:first-child");
  await buttons.first().click();
  await expect(buttons.first()).toHaveAttribute("aria-pressed", "true");
  await page
    .locator(".imported-character")
    .last()
    .getByRole("button", { name: /Remove / })
    .click();
  await expect(page.locator(".imported-character")).toHaveCount(1);
  await expect(buttons.first()).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".imported-character")).toContainText("Silent");
});
