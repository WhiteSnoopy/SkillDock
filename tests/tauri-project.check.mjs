import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

const requiredFiles = [
  "package.json",
  "index.html",
  "vite.config.ts",
  "src/main.tsx",
  "src-tauri/Cargo.toml",
  "src-tauri/tauri.conf.json",
  "src-tauri/src/main.rs",
  "src-tauri/src/lib.rs",
  "src-tauri/src/commands/mod.rs"
];

for (const rel of requiredFiles) {
  const target = path.join(root, rel);
  try {
    await fs.access(target);
  } catch {
    throw new Error(`Missing Tauri project file: ${rel}`);
  }
}

const pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
if (!pkg?.scripts?.["tauri:dev"] || !pkg?.scripts?.tauri) {
  throw new Error("package.json scripts must include tauri and tauri:dev");
}

const tauriConfigRaw = await fs.readFile(path.join(root, "src-tauri", "tauri.conf.json"), "utf8");
const tauriConfig = JSON.parse(tauriConfigRaw);

if (tauriConfig?.build?.devUrl !== "http://127.0.0.1:1420") {
  throw new Error("tauri devUrl must be http://127.0.0.1:1420");
}

if (tauriConfig?.build?.beforeDevCommand !== "pnpm dev") {
  throw new Error("tauri beforeDevCommand must be pnpm dev");
}

console.log("tauri-project.check passed");
