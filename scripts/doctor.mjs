import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { platform, arch } from "node:os";
console.log(
  `Mivuneko doctor · ${platform()} ${arch()} · Node ${process.version}`,
);
for (const [name, command, args] of [
  ["Rust", "cargo", ["--version"]],
  ["Xcode Command Line Tools", "xcode-select", ["-p"]],
  ["Whisper CLI", "whisper-cli", ["--help"]],
]) {
  try {
    execFileSync(command, args, { stdio: "pipe", timeout: 5000 });
    console.log(`${name}: available`);
  } catch {
    console.log(`${name}: missing or unavailable`);
  }
}
console.log(
  `Project voice configuration: ${existsSync(".local/voice.json") ? "present" : "not configured (optional)"}`,
);
console.log(
  `Hermes environment key: ${process.env.MIVUNEKO_HERMES_KEY ? "present" : "not in environment; macOS Keychain fallback is supported"}`,
);
console.log(
  "This check does not print credentials or claim device permissions.",
);

console.log(
  `Gemini environment keys: ${process.env.MIVUNEKO_GEMINI_KEYS ? "present (not displayed)" : "not configured; use Settings or environment"}`,
);
console.log(
  `Gemini proxy environment: ${process.env.MIVUNEKO_PROXY ? "configured (not displayed)" : "not configured"}`,
);
if (platform() === "win32") {
  try {
    const vswhere = join(
      process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
      "Microsoft Visual Studio",
      "Installer",
      "vswhere.exe",
    );
    const location = execFileSync(
      vswhere,
      [
        "-latest",
        "-products",
        "*",
        "-requires",
        "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
        "-property",
        "installationPath",
      ],
      { encoding: "utf8", timeout: 5000 },
    ).trim();
    console.log(
      `MSVC C++ Build Tools: ${location ? "installed" : "missing; install Desktop development with C++ and Windows SDK"}`,
    );
  } catch {
    console.log(
      "MSVC Build Tools: not detected; install Desktop development with C++ and Windows SDK",
    );
  }
}
