// Production-build screenshots. Run npm run build first.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { chromium } from "playwright";
const dist = resolve("apps/desktop/dist");
const types = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".png": "image/png",
};
const server = createServer(async (req, res) => {
  try {
    const path = resolve(
      dist,
      "." + new URL(req.url, "http://localhost").pathname,
    );
    if (path !== dist && !path.startsWith(dist + "/"))
      throw Error("Invalid path");
    const file = path === dist ? dist + "/index.html" : path;
    const target = extname(file) ? file : dist + "/index.html";
    res.setHeader(
      "Content-Type",
      types[extname(target)] ?? "application/octet-stream",
    );
    res.end(await readFile(target));
  } catch {
    res.statusCode = 404;
    res.end("Not found");
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
const out = resolve(process.env.MIVUNEKO_SCREENSHOTS ?? "docs/screenshots");
await mkdir(out, { recursive: true });
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.MIVUNEKO_CHROMIUM_PATH,
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 400, height: 800 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  if (
    !(await page.title()).includes("Mivuneko") ||
    !page.url().startsWith(origin)
  )
    throw Error("Unexpected preview page identity");
  await page.locator('[data-model-ready="true"]').waitFor();
  await page.screenshot({ path: out + "/pet.png" });
  await page.getByRole("button", { name: "Companion menu" }).click();
  await page.screenshot({ path: out + "/pet-menu.png" });
  await page.getByRole("button", { name: "Pet options" }).click();
  await page.getByLabel("Emotion preview").selectOption("angry");
  await page.waitForTimeout(150);
  await page.screenshot({ path: out + "/pet-options.png" });
  await page.getByRole("button", { name: "Close pet options" }).click();
  await page.screenshot({ path: out + "/pet-angry.png" });
  await page.getByRole("button", { name: "Companion menu" }).click();
  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await page.getByLabel("Message beneath pet").fill("Hello Mivuneko!");
  await page.getByRole("button", { name: "Send" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: out + "/inline-chat.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + "/?view=chat");
  await page.getByRole("button", { name: "Meet Mivuneko" }).click();
  await page
    .getByLabel("Message Mivuneko", { exact: true })
    .fill("Open Telegram");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByRole("dialog").waitFor();
  await page.screenshot({ path: out + "/approval.png" });
  await page.getByRole("button", { name: "Allow once" }).click();
  await page
    .getByRole("log")
    .getByText("Mock launch: Telegram. No app was opened.")
    .waitFor();
  await page.screenshot({ path: out + "/conversations.png" });
  await page.setViewportSize({ width: 800, height: 900 });
  await page.screenshot({ path: out + "/conversations-narrow.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.screenshot({ path: out + "/settings.png", fullPage: true });
  if (errors.length) throw Error(errors.join("\n"));
  console.log("Production screenshots captured; no page errors.");
} finally {
  await browser?.close();
  server.close();
}
