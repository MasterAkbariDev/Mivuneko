import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };
const localCargo = join(root, ".local", "cargo");
if (
  process.platform === "darwin" &&
  existsSync(join(localCargo, "bin", "cargo")) &&
  !env.CARGO_HOME &&
  !env.RUSTUP_HOME
) {
  env.CARGO_HOME = localCargo;
  env.RUSTUP_HOME = join(root, ".local", "rustup");
  env.PATH = `${join(localCargo, "bin")}:${env.PATH ?? ""}`;
}

let cli;
try {
  cli = createRequire(import.meta.url).resolve("@tauri-apps/cli/tauri.js");
} catch {
  console.error("Tauri is not installed. Run npm ci first.");
  process.exit(1);
}
const child = spawn(process.execPath, [cli, "dev", ...process.argv.slice(2)], {
  cwd: join(root, "apps", "desktop"),
  env,
  stdio: "inherit",
});
child.on("error", (error) => {
  console.error(`Unable to start the desktop app: ${error.message}`);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
