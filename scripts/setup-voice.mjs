import { mkdir, writeFile, rename, unlink } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { createHash } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
const binary = process.argv[2];
if (!binary) throw Error("Pass the absolute whisper-cli path");
const revision = "5359861c739e955e79d9a303bcbc70fb988958b1";
const name = "ggml-tiny.bin";
const metadata = await fetch(
  `https://huggingface.co/api/models/ggerganov/whisper.cpp/tree/${revision}?recursive=false`,
);
if (!metadata.ok) throw Error("Cannot read official Whisper model metadata");
const entry = (await metadata.json()).find((f) => f.path === name);
const expected = entry?.lfs?.oid;
if (!/^[a-f0-9]{64}$/.test(expected ?? ""))
  throw Error(
    "Official model SHA-256 metadata was unavailable; download aborted",
  );
const dir = resolve(".local/models");
await mkdir(dir, { recursive: true });
const model = join(dir, name),
  temp = model + ".part";
const hash = createHash("sha256");
let size = 0;
const response = await fetch(
  `https://huggingface.co/ggerganov/whisper.cpp/resolve/${revision}/${name}`,
);
if (!response.ok || !response.body) throw Error("Model download failed");
try {
  await pipeline(
    Readable.fromWeb(response.body),
    new Transform({
      transform(chunk, encoding, callback) {
        size += chunk.length;
        if (size > 100 * 1024 * 1024) {
          callback(Error("Model exceeded expected size"));
          return;
        }
        hash.update(chunk);
        callback(null, chunk);
      },
    }),
    createWriteStream(temp, { mode: 0o600 }),
  );
  if (hash.digest("hex") !== expected)
    throw Error("Whisper model checksum mismatch");
  await rename(temp, model);
} catch (e) {
  await unlink(temp).catch(() => {});
  throw e;
}
const config = { binary: resolve(binary), model };
await writeFile(".local/voice.json", JSON.stringify(config, null, 2), {
  mode: 0o600,
});
const support = join(
  homedir(),
  "Library",
  "Application Support",
  "dev.mivuneko.companion",
);
await mkdir(support, { recursive: true });
await writeFile(join(support, "voice.json"), JSON.stringify(config), {
  mode: 0o600,
});
console.log(
  "Multilingual tiny Whisper model downloaded and SHA-256 verified. Voice paths configured; model remains outside the source archive.",
);
