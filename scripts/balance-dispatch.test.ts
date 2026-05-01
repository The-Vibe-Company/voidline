import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const dispatchScript = path.join(repoRoot, "scripts", "balance-dispatch.sh");

function fakeUvxEnv(env: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const binDir = mkdtempSync(path.join(tmpdir(), "voidline-modal-bin-"));
  const uvxPath = path.join(binDir, "uvx");
  writeFileSync(uvxPath, "#!/usr/bin/env sh\nexit 0\n");
  chmodSync(uvxPath, 0o755);
  return {
    ...process.env,
    MODAL_TOKEN_ID: "",
    MODAL_TOKEN_SECRET: "",
    MODAL_CONFIG_PATH: path.join(binDir, "missing-modal.toml"),
    PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
    ...env,
  };
}

function runDispatch(args: string[], env: NodeJS.ProcessEnv = {}): string {
  return execFileSync(dispatchScript, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: fakeUvxEnv(env),
  });
}

describe("balance Modal dispatcher", () => {
  it("refuses quick dry-run without Modal credentials", () => {
    const result = spawnSync(dispatchScript, ["quick", "--dry-run"], {
      cwd: repoRoot,
      encoding: "utf8",
      env: fakeUvxEnv(),
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Modal credentials");
  });

  it("prints Modal quick dry-run details", () => {
    const output = runDispatch(["quick", "--dry-run"], {
      MODAL_TOKEN_ID: "token-id",
      MODAL_TOKEN_SECRET: "token-secret",
    });

    expect(output).toContain("backend=modal");
    expect(output).toContain("command=quick");
    expect(output).toContain("resource_class=cpu-burst");
    expect(output).toContain("report_path=/reports/");
    expect(output).toContain("model_dir=/models/");
  });

  it("prints Modal train dry-run details", () => {
    const output = runDispatch(["train", "--dry-run", "--timesteps", "16"], {
      MODAL_TOKEN_ID: "token-id",
      MODAL_TOKEN_SECRET: "token-secret",
    });

    expect(output).toContain("command=train");
    expect(output).toContain("resource_class=h100-burst");
    expect(output).toContain("extra_args=--timesteps 16");
  });

  it("prints pull dry-run details", () => {
    const output = runDispatch(["pull", "--dry-run", "--reports"], {
      MODAL_TOKEN_ID: "token-id",
      MODAL_TOKEN_SECRET: "token-secret",
    });

    expect(output).toContain("command=pull");
    expect(output).toContain("resource_class=local-pull");
    expect(output).toContain("pull_mode=reports");
    expect(output).toContain(".context/balance-reports");
  });

  it("rejects commands outside the allowlist", () => {
    const result = spawnSync(dispatchScript, ["profile-check", "--dry-run"], {
      cwd: repoRoot,
      encoding: "utf8",
      env: fakeUvxEnv({
        MODAL_TOKEN_ID: "token-id",
        MODAL_TOKEN_SECRET: "token-secret",
      }),
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("unknown balance command: profile-check");
  });
});
