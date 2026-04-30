import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const crateDir = resolve(root, "sim/crates/voidline-wasm");
const outDir = "../../../src/generated/voidline-wasm";
const generatedWasm = resolve(root, "src/generated/voidline-wasm/voidline_wasm_bg.wasm");
const generatedGitignore = resolve(root, "src/generated/voidline-wasm/.gitignore");

if (process.env.VERCEL && existsSync(generatedWasm)) {
  console.log("[wasm] Vercel build: using committed generated WASM artifacts.");
  rmSync(generatedGitignore, { force: true });
  process.exit(0);
}

const result = spawnSync(
  "wasm-pack",
  ["build", "--target", "web", "--out-dir", outDir, "--release"],
  {
    cwd: crateDir,
    stdio: "inherit",
    env: process.env,
  },
);

if (result.status === 0) {
  rmSync(generatedGitignore, { force: true });
  process.exit(0);
}

process.exit(result.status ?? 1);
