import { readFileSync } from "node:fs";
const config = JSON.parse(readFileSync(".local/voice.json", "utf8"));
const field = process.argv[2];
if (!["binary", "model"].includes(field) || typeof config[field] !== "string")
  process.exit(1);
process.stdout.write(config[field]);
